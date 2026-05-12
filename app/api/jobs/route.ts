import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createJob, getJobSummaries } from "@/lib/db";
import { ensureStorageDirs, uploadFilePath } from "@/lib/storage";
import { spawnWorker } from "@/lib/worker";
import fs from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { logError, logInfo } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

type BlobCreateJobRequest = {
  source: "vercel-blob";
  filename: string;
  file_size: number;
  blob_url: string;
  blob_download_url?: string;
  blob_pathname?: string;
  chunk_duration_seconds?: number;
  overlap_seconds?: number;
  whisper_model?: string;
};

// ============================================================
// GET /api/jobs — List all jobs with progress summaries
// ============================================================
export async function GET() {
  try {
    const summaries = getJobSummaries();
    return Response.json({ jobs: summaries });
  } catch (error) {
    logError("jobs.list_failed", error);
    return Response.json(
      { error: "Failed to list jobs" },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/jobs — Create a new job and upload file
// Expects multipart form data with:
//   - file: the video file
//   - chunk_duration_seconds (optional, default 600)
//   - overlap_seconds (optional, default 2)
//   - whisper_model (optional, default "base")
// ============================================================
export async function POST(request: NextRequest) {
  try {
    ensureStorageDirs();

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return createBlobBackedJob(request);
    }

    return createMultipartBackedJob(request);
  } catch (error) {
    logError("jobs.create_failed", error);
    return Response.json(
      { error: `Failed to create job: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}

async function createBlobBackedJob(request: NextRequest) {
  const body = (await request.json()) as Partial<BlobCreateJobRequest>;

  if (body.source !== "vercel-blob") {
    return Response.json({ error: "Unsupported upload source" }, { status: 400 });
  }

  if (!body.filename || !body.blob_url || typeof body.file_size !== "number") {
    return Response.json(
      { error: "filename, file_size, and blob_url are required" },
      { status: 400 }
    );
  }

  const jobId = uuidv4();
  const originalPath = body.blob_download_url || body.blob_url;

  logInfo("jobs.create_blob_started", {
    job_id: jobId,
    filename: body.filename,
    file_size: body.file_size,
    blob_pathname: body.blob_pathname,
  });

  const job = createJob({
    id: jobId,
    filename: body.filename,
    original_path: originalPath,
    file_size: body.file_size,
    chunk_duration_seconds: body.chunk_duration_seconds,
    overlap_seconds: body.overlap_seconds,
    whisper_model: body.whisper_model,
  });

  spawnWorker(jobId);
  logInfo("jobs.create_blob_completed", { job_id: jobId });

  return Response.json({ job }, { status: 201 });
}

async function createMultipartBackedJob(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  const chunkDuration = parseInt(
    (formData.get("chunk_duration_seconds") as string) || "600",
    10
  );
  const overlap = parseInt(
    (formData.get("overlap_seconds") as string) || "2",
    10
  );
  const whisperModel = (formData.get("whisper_model") as string) || "base";

  // Create job
  const jobId = uuidv4();
  const filePath = uploadFilePath(jobId, file.name);

  // Ensure directory exists
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  logInfo("jobs.create_multipart_started", {
    job_id: jobId,
    filename: file.name,
    file_size: file.size,
    file_path: filePath,
  });

  await pipeline(
    Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>),
    fs.createWriteStream(filePath)
  );

  const job = createJob({
    id: jobId,
    filename: file.name,
    original_path: filePath,
    file_size: file.size,
    chunk_duration_seconds: chunkDuration,
    overlap_seconds: overlap,
    whisper_model: whisperModel,
  });

  // Spawn the Python worker to start processing
  spawnWorker(jobId);
  logInfo("jobs.create_multipart_completed", { job_id: jobId });

  return Response.json({ job }, { status: 201 });
}
