import 'dotenv/config';

import { readFileSync, rmSync } from 'node:fs';

import { Client } from 'pg';

import { TestRuntime } from './runtime';

const runtimeFile = `${process.cwd()}/.test-runtime.json`;

export default async function globalTeardown(): Promise<void> {
  const runtime = JSON.parse(readFileSync(runtimeFile, 'utf8')) as TestRuntime;
  if (!runtime.schema.startsWith('test_')) {
    throw new Error('Refusing to drop a non-test schema.');
  }

  const client = new Client({ connectionString: runtime.databaseUrl });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA "${runtime.schema}" CASCADE`);
  } finally {
    await client.end();
    rmSync(runtimeFile, { force: true });
  }
}
