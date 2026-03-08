// ---------------------------------------------------------------------------
// Distributed Compute Mesh — Job Runner
// ---------------------------------------------------------------------------
import { meshClient, type JobOffer, type JobResult } from "./mesh-client";

// ---------------------------------------------------------------------------
// Processor interface — each job type registers a processor
// ---------------------------------------------------------------------------

export interface JobProcessor {
  /** Can this processor handle the given job type? */
  canHandle(type: string): boolean;
  /** Execute the job and return the result payload. */
  process(
    jobId: string,
    type: string,
    payload: Record<string, unknown>,
    onProgress: (pct: number, message?: string) => void,
  ): Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Runner singleton
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_JOBS = 2;

class MeshJobRunner {
  private processors: JobProcessor[] = [];
  private unsubOffer: (() => void) | null = null;

  /** Register a processor (order matters — first match wins). */
  register(processor: JobProcessor): void {
    this.processors.push(processor);
  }

  /** Start listening for job offers from the mesh client. */
  start(): void {
    if (this.unsubOffer) return;
    this.unsubOffer = meshClient.onJobOffer((offer) => this.handleOffer(offer));
    console.log("[job-runner] started, processors:", this.processors.length);
  }

  /** Stop listening. */
  stop(): void {
    this.unsubOffer?.();
    this.unsubOffer = null;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async handleOffer(offer: JobOffer): Promise<void> {
    console.log(`[job-runner] received offer: ${offer.jobId} (${offer.type})`);

    // Check concurrency limit
    if (meshClient.activeJobs >= MAX_CONCURRENT_JOBS) {
      console.log("[job-runner] at capacity, rejecting");
      meshClient.rejectJob(offer.jobId, "at_capacity");
      return;
    }

    // Find a processor
    const processor = this.processors.find((p) => p.canHandle(offer.type));
    if (!processor) {
      console.log(`[job-runner] no processor for type "${offer.type}", rejecting`);
      meshClient.rejectJob(offer.jobId, "unsupported_type");
      return;
    }

    // Accept the job
    meshClient.acceptJob(offer.jobId);
    meshClient.activeJobs += 1;

    const startMs = performance.now();

    try {
      const result = await processor.process(
        offer.jobId,
        offer.type,
        offer.payload,
        (pct, message) => meshClient.sendJobProgress(offer.jobId, pct, message),
      );

      const processingMs = Math.round(performance.now() - startMs);
      const jobResult: JobResult = {
        jobId: offer.jobId,
        result,
        processingMs,
      };
      meshClient.sendJobResult(jobResult);
      console.log(`[job-runner] completed ${offer.jobId} in ${processingMs}ms`);
    } catch (err: any) {
      console.error(`[job-runner] failed ${offer.jobId}:`, err);
      meshClient.sendJobError(offer.jobId, err?.message || "Unknown error");
    }
  }
}

/** Global singleton */
export const meshJobRunner = new MeshJobRunner();
