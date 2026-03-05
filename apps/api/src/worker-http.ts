// ── Browser-API stubs for pdf-parse / pdfjs-dist on Alpine ──────────────
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    constructor() { return Object.create(DOMMatrix.prototype); }
  };
}
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as any).ImageData = class ImageData {
    constructor(public width = 0, public height = 0) {}
  };
}
if (typeof globalThis.Path2D === "undefined") {
  (globalThis as any).Path2D = class Path2D {};
}
// ────────────────────────────────────────────────────────────────────────

import "reflect-metadata";
import http from "node:http";
import { startWorker } from "./worker";
import { IMPORT_QUEUE_NAME } from "./infra/queue/import-queue";

const startedAt = new Date().toISOString();
let workerReady = false;
let workerError: string | null = null;

async function bootstrap() {
  const port = Number(process.env.PORT || 8080);

  // Start the HTTP health-check server FIRST so Cloud Run's startup probe
  // succeeds immediately. The worker can take time to connect to Redis/Postgres.
  const server = http.createServer((_req, res) => {
    const url = _req.url ?? "/";

    // Liveness probe — always 200 if the process is up.
    if (url === "/health" || url === "/") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "ok",
          service: "nexus-worker",
          queue: IMPORT_QUEUE_NAME,
          workerReady,
          workerError,
          startedAt,
          uptime: Math.floor(process.uptime()),
        }),
      );
      return;
    }

    // Readiness probe — 503 if the worker hasn't finished initialization.
    if (url === "/health/ready") {
      res.statusCode = workerReady ? 200 : 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ready: workerReady, error: workerError }));
      return;
    }

    res.statusCode = 404;
    res.end("not found\n");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[worker-http] health server listening on port ${port}`);
  });

  // Now start the BullMQ worker (connects to Postgres and Redis).
  // This may take a while but the health server is already responding.
  try {
    await startWorker();
    workerReady = true;
    console.log("[worker-http] worker initialized successfully");
  } catch (err: any) {
    workerError = err?.message ?? String(err);
    console.error("[worker-http] worker failed to start:", workerError);
    // Don't exit — keep the health server running so Cloud Run doesn't
    // enter a crash loop. The /health/ready endpoint will report 503.
  }
}

bootstrap().catch((err) => {
  console.error("[worker-http] fatal", err);
  process.exit(1);
});
