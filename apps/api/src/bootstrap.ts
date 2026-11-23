import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
export async function createApp(logger: false | undefined = undefined) {
  if (process.env.NODE_ENV === 'production' && process.env.DATABASE_DRIVER === 'pglite')
    throw new Error('PGlite is a local demo/test driver, not a production configuration.');
  const app = await NestFactory.create(AppModule, { logger });
  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false }),
  );
  app.use(cookieParser());
  const allowedOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== allowedOrigin) {
      res.status(403).json({ statusCode: 403, message: 'Niedozwolone źródło żądania.' });
      return;
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ProdFlow API')
      .setDescription(
        'Szkielet 0.1: sesje, odczyt danych, tworzenie zleceń. Rejestracja czasu i QR są kolejnym etapem.',
      )
      .setVersion('0.1.0')
      .addCookieAuth('prodflow_session')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }
  app.enableShutdownHooks();
  return app;
}
