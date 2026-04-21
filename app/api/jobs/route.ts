import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createJob, getJobSummaries } from "@/lib/db";
import { ensureStorageDirs, uploadFilePath } from "@/lib/storage";
import { spawnWorker } from "@/lib/worker";
import fs from "fs";

// ============================================================
// GET /api/jobs — List all jobs with progress summaries
// ============================================================
export async function GET() {
  try {
    const summaries = getJobSummaries();
    return Response.json({ jobs: summaries });
  } catch (error) {
    console.error("Failed to list jobs:", error);
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

    // Stream file to disk to avoid loading entire file into memory
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure directory exists
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);

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

    return Response.json({ job }, { status: 201 });
  } catch (error) {
    console.error("Failed to create job:", error);
    return Response.json(
      { error: `Failed to create job: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}

