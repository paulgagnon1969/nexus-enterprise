// Nexus Enterprise API - Production deployment 2026-02-14
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
import * as net from "node:net";

async function assertPortAvailable(port: number, host = "0.0.0.0") {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (err: any) => {
      if (err && (err as any).code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use on ${host}. ` +
              "Kill the existing process or set API_PORT/PORT to a different value.",
          ),
        );
      } else {
        reject(err);
      }
    });

    server.once("listening", () => {
      server.close(() => resolve());
    });

    server.listen(port, host);
  });
}

async function bootstrap() {
  // Prefer API_PORT so the web app can run alongside any existing service on PORT.
  const port = Number(process.env.API_PORT || process.env.PORT || 8000);

  try {
    await assertPortAvailable(port, "0.0.0.0");
  } catch (err: any) {
    // Fail fast with a clear message instead of starting Nest on an unknown port.
    // This keeps the contract with apps/web (NEXT_PUBLIC_API_BASE_URL) predictable.
    console.error("[api] Failed to start: ", err?.message ?? String(err));
    process.exit(1);
  }

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

  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API listening on http://localhost:${port}`);

  console.log("Registered routes:");
  server.printRoutes({ commonPrefix: false }); // shows clean tree
}

bootstrap();
