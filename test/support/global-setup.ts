import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { Client } from 'pg';

import { TestRuntime } from './runtime';

const requireFromHere = createRequire(__filename);
const runtimeFile = `${process.cwd()}/.test-runtime.json`;

function withSchema(databaseUrl: string, schema: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

export default async function globalSetup(): Promise<void> {
  const directUrl = process.env['DIRECT_URL'];
  if (!directUrl) {
    throw new Error('DIRECT_URL is required to create an isolated test schema.');
  }

  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const databaseUrl = withSchema(directUrl, schema);
  const client = new Client({ connectionString: directUrl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await client.end();
  }

  const prismaCli = requireFromHere.resolve('prisma/build/index.js');
  const migration = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DIRECT_URL: databaseUrl },
    encoding: 'utf8',
  });
  if (migration.status !== 0) {
    throw new Error(`Test migration failed: ${migration.stderr || migration.stdout}`);
  }

  const runtime: TestRuntime = { databaseUrl, schema };
  writeFileSync(runtimeFile, JSON.stringify(runtime), 'utf8');
}
