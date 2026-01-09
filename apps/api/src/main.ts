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

  app.enableCors({
    // Echo the requesting Origin (rather than "*") so that credentials can be used
    // from the web app (cookies, auth headers, etc.).
    origin: true,
    credentials: true,
    // Required for /users/me PATCH and any future REST updates from the web app.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

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

  // Prefer API_PORT so the web app can run alongside any existing service on PORT.
  const port = Number(process.env.API_PORT || process.env.PORT || 8000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API listening on http://localhost:${port}`);

  console.log("Registered routes:");
  server.printRoutes({ commonPrefix: false }); // shows clean tree
}

bootstrap();
