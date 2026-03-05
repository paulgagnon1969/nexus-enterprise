// Nexus Enterprise API - Production deployment 2026-02-14

// ── Browser-API stubs for pdf-parse / pdfjs-dist on Alpine ──────────────
// pdf-parse bundles pdfjs-dist which expects DOMMatrix, ImageData, and Path2D.
// @napi-rs/canvas can't load its native binding on Alpine, so we provide
// lightweight no-op stubs so the module can be imported without crashing.
// These are only used for PDF text extraction (no actual rendering).
const _g = globalThis as any;
if (typeof _g.DOMMatrix === "undefined") {
  _g.DOMMatrix = class DOMMatrix {
    constructor() { return Object.create(DOMMatrix.prototype); }
  };
}
if (typeof _g.ImageData === "undefined") {
  _g.ImageData = class ImageData {
    constructor(public width = 0, public height = 0) {}
  };
}
if (typeof _g.Path2D === "undefined") {
  _g.Path2D = class Path2D {};
}
// ────────────────────────────────────────────────────────────────────────

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
import { IoAdapter } from "@nestjs/platform-socket.io";
import * as path from "node:path";
import * as net from "node:net";

async function assertPortAvailable(port: number, host = "::") {
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
    await assertPortAvailable(port, "::");
  } catch (err: any) {
    // Fail fast with a clear message instead of starting Nest on an unknown port.
    // This keeps the contract with apps/web (NEXT_PUBLIC_API_BASE_URL) predictable.
    console.error("[api] Failed to start: ", err?.message ?? String(err));
    process.exit(1);
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 100 * 1024 * 1024 }), // 100 MB for video frame payloads
  );

  app.enableCors({
    // Echo the requesting Origin (rather than "*") so that credentials can be used
    // from the web app (cookies, auth headers, etc.).
    origin: true,
    credentials: true,
    // Required for /users/me PATCH and any future REST updates from the web app.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // Expose headers needed for file downloads (Content-Disposition contains filename)
    exposedHeaders: ["Content-Disposition"],
  });

  // Multipart uploads (Fastify-native).
  const server = app.getHttpAdapter().getInstance();
  await server.register(fastifyMultipart, {
    limits: {
      // 100 MB to support large architectural drawing sets (PDF)
      fileSize: 100 * 1024 * 1024,
    },
  });

  // Serve local uploaded files (dev-friendly). In production we should move to object storage.
  await server.register(fastifyStatic, {
    root: path.resolve(process.cwd(), "uploads"),
    prefix: "/uploads/",
  });

  // Socket.IO adapter for WebSocket gateways (support session signaling)
  app.useWebSocketAdapter(new IoAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  // Bind to "::" for dual-stack (IPv4 + IPv6). Chrome resolves localhost to
  // ::1 (IPv6) first; binding only to 0.0.0.0 causes ERR_CONNECTION_REFUSED.
  await app.listen({ port, host: "::" });
  console.log(`API listening on http://localhost:${port}`);

  console.log("Registered routes:");
  server.printRoutes({ commonPrefix: false }); // shows clean tree
}

bootstrap().catch((err) => {
  console.error('[api] Fatal startup error:', err);
  process.exit(1);
});

// Deployment trigger 1771091354
// Updated: Sun Feb 15 06:16:41 CST 2026
