import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // CLI-only direct connection. Runtime code reads DATABASE_URL instead.
    url: env('DIRECT_URL'),
  },
});
