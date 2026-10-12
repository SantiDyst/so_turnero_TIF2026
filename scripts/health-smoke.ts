import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';

async function smoke(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');

  try {
    const response = await fetch(`${await app.getUrl()}/health`);
    const body: unknown = await response.json();

    if (response.status !== 200 || JSON.stringify(body) !== JSON.stringify({ status: 'ok' })) {
      throw new Error(`Unexpected health response: ${response.status} ${JSON.stringify(body)}`);
    }
  } finally {
    await app.close();
  }
}

void smoke();
