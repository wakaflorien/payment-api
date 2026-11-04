import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { Express } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { requestContext } from './common/request-context.middleware.js';
import { SWAGGER_PATH } from './swagger.js';

/**
 * Global HTTP configuration shared by main.ts and the e2e tests.
 * (Raw bodies for callback signatures are enabled in NestFactory.create: { rawBody: true }.)
 */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService);
  const express = app.getHttpAdapter().getInstance() as Express;

  // Behind a load balancer / TLS terminator, trust its X-Forwarded-* headers so
  // request.ip is the real client (used in auth logs). TRUST_PROXY=1 = one hop.
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    express.set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
  }

  app.use(requestContext());

  // Security headers. Swagger UI needs inline scripts, so its pages skip the CSP.
  const secureHeaders = helmet();
  const docsHeaders = helmet({ contentSecurityPolicy: false });
  app.use((request: { path: string }, response: never, next: () => void) =>
    request.path.startsWith(`/${SWAGGER_PATH}`)
      ? docsHeaders(request as never, response, next)
      : secureHeaders(request as never, response, next),
  );

  // Only the listed front-end origins (e.g. the Next.js app) may call the API from a browser.
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({
      origin: origins,
      methods: ['GET', 'POST', 'PATCH'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    });
  }

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  return app;
}
