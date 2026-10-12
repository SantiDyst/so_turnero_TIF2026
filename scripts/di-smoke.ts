import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';

async function smoke(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  await app.close();
}

void smoke();
