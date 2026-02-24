import "reflect-metadata";
import http from "node:http";
import { startWorker } from "./worker";
import { IMPORT_QUEUE_NAME } from "./infra/queue/import-queue";

const startedAt = new Date().toISOString();
let workerReady = false;

async function bootstrap() {
  // Start the BullMQ import worker (connects to Postgres and Redis).
  await startWorker();
  workerReady = true;

  const port = Number(process.env.PORT || 8080);

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
      res.end(JSON.stringify({ ready: workerReady }));
      return;
    }

    res.statusCode = 404;
    res.end("not found\n");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[worker-http] listening on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error("[worker-http] fatal", err);
  process.exit(1);
});
