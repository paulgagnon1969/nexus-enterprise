import type { FastifyRequest } from "fastify";

export type UploadedFilePart = {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
};

/**
 * Read a single file field from a Fastify multipart request and return the part.
 *
 * - Iterates `req.parts()` until it finds the named file field, then breaks so
 *   Fastify can finalize the multipart stream and the request doesn't hang.
 * - Optionally captures a small set of string field values alongside the file.
 */
export async function readSingleFileFromMultipart(
  req: FastifyRequest,
  options: {
    fieldName: string;
    captureFields?: string[];
  },
): Promise<{
  file: UploadedFilePart;
  fields: Record<string, string | undefined>;
}> {
  const fastReq: any = req as any;
  const parts = fastReq.parts?.();
  if (!parts) {
    throw new Error("Multipart support is not configured");
  }

  let filePart: UploadedFilePart | undefined;
  const fields: Record<string, string | undefined> = {};

  for await (const part of parts) {
    if (part.type === "file" && part.fieldname === options.fieldName) {
      filePart = part as UploadedFilePart;
      // We only expect a single file field; break once we have it so the
      // iterator can complete and Fastify can finalize the request.
      break;
    }

    if (
      part.type === "field" &&
      options.captureFields &&
      options.captureFields.includes(part.fieldname)
    ) {
      fields[part.fieldname] = String(part.value);
    }
  }

  if (!filePart) {
    throw new Error("No file uploaded");
  }

  return { file: filePart, fields };
}

/**
 * Read all matching file fields from a Fastify multipart request.
 *
 * - Iterates the entire `req.parts()` stream so Fastify can always finalize
 *   the request cleanly.
 * - `fieldName` can be a specific field or omitted to accept all file parts.
 * - Returns files in the order they were received.
 */
export async function readMultipleFilesFromMultipart(
  req: FastifyRequest,
  options?: {
    fieldName?: string; // if omitted, capture all file parts
    captureFields?: string[];
  },
): Promise<{
  files: UploadedFilePart[];
  fields: Record<string, string | undefined>;
}> {
  const fastReq: any = req as any;
  const parts = fastReq.parts?.();
  if (!parts) {
    throw new Error("Multipart support is not configured");
  }

  const files: UploadedFilePart[] = [];
  const fields: Record<string, string | undefined> = {};

  for await (const part of parts) {
    if (part.type === "file") {
      if (!options?.fieldName || part.fieldname === options.fieldName) {
        files.push(part as UploadedFilePart);
      }
      continue;
    }

    if (
      part.type === "field" &&
      options?.captureFields &&
      options.captureFields.includes(part.fieldname)
    ) {
      fields[part.fieldname] = String(part.value);
    }
  }

  if (!files.length) {
    throw new Error("No files uploaded");
  }

  return { files, fields };
}
