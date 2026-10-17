import { Client } from 'pg';

export interface TestRuntime {
  databaseUrl: string;
  schema: string;
}

const runtimeFile = `${process.cwd()}/.test-runtime.json`;

export function readTestRuntime(): TestRuntime {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(runtimeFile) as TestRuntime;
}

export async function assertIsolatedSchema(): Promise<void> {
  const runtime = readTestRuntime();
  if (!runtime.schema.startsWith('test_') || process.env['PRISMA_SCHEMA'] !== runtime.schema) {
    throw new Error('Refusing to run tests outside an ephemeral test_ schema.');
  }

  const client = new Client({
    connectionString: runtime.databaseUrl,
    options: `-c search_path=${runtime.schema}`,
  });
  await client.connect();
  try {
    const result = await client.query<{ current_schema: string }>('SELECT current_schema()');
    if (
      result.rows[0]?.current_schema !== runtime.schema ||
      result.rows[0]?.current_schema === 'public'
    ) {
      throw new Error(
        'Test schema safety guard failed: current schema is not the isolated test schema.',
      );
    }
  } finally {
    await client.end();
  }
}
