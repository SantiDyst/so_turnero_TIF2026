import { readTestRuntime } from './runtime';

const runtime = readTestRuntime();
process.env['DATABASE_URL'] = runtime.databaseUrl;
process.env['PRISMA_SCHEMA'] = runtime.schema;
