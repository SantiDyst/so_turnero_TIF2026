import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

interface PrismaRuntimeCache {
  adapter?: PrismaPg;
  client?: PrismaClient;
  schema?: string;
}

const prismaRuntime = globalThis as typeof globalThis & PrismaRuntimeCache;

function getRuntimeConfiguration(): {
  connectionString: string;
  schema?: string;
  options?: string;
} {
  const databaseUrl = process.env['DATABASE_URL'];
  const schema = process.env['PRISMA_SCHEMA'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the runtime Prisma adapter.');
  }

  if (!schema && !new URL(databaseUrl).hostname.includes('-pooler')) {
    throw new Error('DATABASE_URL must use the Neon pooled host (containing "-pooler").');
  }

  if (schema) {
    if (!schema.startsWith('test_')) {
      throw new Error('PRISMA_SCHEMA is reserved for isolated test schemas named "test_".');
    }

    return { connectionString: databaseUrl, schema, options: `-c search_path=${schema}` };
  }

  return { connectionString: databaseUrl };
}

function getPrismaClient(): PrismaClient {
  const configuration = getRuntimeConfiguration();

  if (prismaRuntime.schema !== configuration.schema) {
    prismaRuntime.client = undefined;
    prismaRuntime.adapter = undefined;
    prismaRuntime.schema = configuration.schema;
  }

  if (!prismaRuntime.adapter) {
    prismaRuntime.adapter = new PrismaPg(
      { connectionString: configuration.connectionString, options: configuration.options },
      { schema: configuration.schema },
    );
  }

  prismaRuntime.client ??= new PrismaClient({ adapter: prismaRuntime.adapter });
  return prismaRuntime.client;
}

@Injectable()
export class PrismaService {
  readonly client = getPrismaClient();
}
