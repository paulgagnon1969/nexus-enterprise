import "reflect-metadata";
import http from "node:http";
import { startWorker } from "./worker";

async function bootstrap() {
  // Start the BullMQ import worker (connects to Postgres and Redis).
  await startWorker();

  const port = Number(process.env.PORT || 8080);

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end("ok\n");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[worker-http] listening on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error("[worker-http] fatal", err);
  process.exit(1);
});
