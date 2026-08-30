import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // REST API lives under /api/* (see technical plan §4.2).
  app.setGlobalPrefix('api');

  // Local dev only: allow the Next.js app to call the API.
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });

  // Validation uses Zod (plan §39), not class-validator. A ZodValidationPipe
  // will be registered here once the first request DTOs land (Sprint 2+).

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`Memoire API listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
