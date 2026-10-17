import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

interface PrismaRuntimeCache {
  adapter?: PrismaPg;
  client?: PrismaClient;
}

const prismaRuntime = globalThis as typeof globalThis & PrismaRuntimeCache;

function getDatabaseUrl(): string {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the runtime Prisma adapter.');
  }

  if (!new URL(databaseUrl).hostname.includes('-pooler')) {
    throw new Error('DATABASE_URL must use the Neon pooled host (containing "-pooler").');
  }

  return databaseUrl;
}

function getPrismaClient(): PrismaClient {
  if (!prismaRuntime.adapter) {
    prismaRuntime.adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
  }

  prismaRuntime.client ??= new PrismaClient({ adapter: prismaRuntime.adapter });
  return prismaRuntime.client;
}

@Injectable()
export class PrismaService {
  readonly client = getPrismaClient();
}
