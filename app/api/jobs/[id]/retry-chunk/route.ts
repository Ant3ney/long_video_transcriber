import { NextRequest } from "next/server";
import { getJob, getChunk, updateChunk, updateJob, refreshJobChunkCounts } from "@/lib/db";
import { spawnWorker, isWorkerRunning } from "@/lib/worker";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 299;

// ============================================================
// POST /api/jobs/[id]/retry-chunk — Retry a failed chunk
// Body: { chunk_id: string }
// ============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const chunkId = body.chunk_id;

    if (!chunkId) {
      return Response.json(
        { error: "chunk_id is required" },
        { status: 400 }
      );
    }

    const job = getJob(id);
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    const chunk = getChunk(chunkId);
    if (!chunk || chunk.job_id !== id) {
      return Response.json({ error: "Chunk not found" }, { status: 404 });
    }

    if (chunk.status !== "failed") {
      return Response.json(
        { error: `Cannot retry chunk with status: ${chunk.status}` },
        { status: 400 }
      );
    }

    // Reset chunk to pending
    updateChunk(chunkId, {
      status: "pending",
      error_message: null,
    });
    refreshJobChunkCounts(id);

    // If job was completed or failed, set it back to transcribing
    if (job.status === "completed" || job.status === "failed") {
      updateJob(id, { status: "pending", error_message: null });
    }

    // Spawn worker if not already running
    if (!isWorkerRunning(id)) {
      spawnWorker(id);
    }

    return Response.json({ success: true, message: "Chunk retry started" });
  } catch (error) {
    logError("jobs.retry_chunk_failed", error);
    return Response.json(
      { error: "Failed to retry chunk" },
      { status: 500 }
    );
  }
}
