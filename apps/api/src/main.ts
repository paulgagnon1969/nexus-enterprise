import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication
} from "@nestjs/platform-fastify";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import * as path from "node:path";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  app.enableCors({ origin: true });

  // Multipart uploads (Fastify-native).
  const server = app.getHttpAdapter().getInstance();
  await server.register(fastifyMultipart, {
    limits: {
      // Keep this conservative; bump if needed.
      fileSize: 10 * 1024 * 1024,
    },
  });

  // Serve local uploaded files (dev-friendly). In production we should move to object storage.
  await server.register(fastifyStatic, {
    root: path.resolve(process.cwd(), "uploads"),
    prefix: "/uploads/",
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  const port = Number(process.env.PORT || 8000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
