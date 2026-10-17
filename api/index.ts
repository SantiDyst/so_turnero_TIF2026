import 'reflect-metadata';

import type { Request, Response } from 'express';
import express, { type RequestHandler } from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';

import { AppModule } from '../src/app.module';

let handlerPromise: Promise<RequestHandler> | undefined;

async function createHandler(): Promise<RequestHandler> {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  await app.init();
  return expressApp;
}

export default async function handler(request: Request, response: Response): Promise<void> {
  handlerPromise ??= createHandler();
  const appHandler = await handlerPromise;
  appHandler(request, response, (error?: unknown) => {
    if (error) {
      throw error;
    }
  });
}
