import { NextRequest } from "next/server";
import { getJob, updateJob, resetStalledChunks } from "@/lib/db";
import { spawnWorker, isWorkerRunning } from "@/lib/worker";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 299;

// ============================================================
// POST /api/jobs/[id]/resume — Resume an interrupted job
// ============================================================
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = getJob(id);

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    // Only allow resuming jobs that are in a resumable state
    const resumableStatuses = ["failed", "paused", "analyzing", "splitting", "transcribing", "merging"];
    if (!resumableStatuses.includes(job.status)) {
      return Response.json(
        { error: `Cannot resume job with status: ${job.status}` },
        { status: 400 }
      );
    }

    // Check if worker is already running
    if (isWorkerRunning(id)) {
      return Response.json(
        { error: "Worker is already running for this job" },
        { status: 409 }
      );
    }

    // Reset stalled chunks (ones that were "transcribing" when the process died)
    resetStalledChunks(id);

    // Reset job status to pending so the worker picks it up
    updateJob(id, {
      status: "pending",
      error_message: null,
    });

    // Spawn a new worker
    const { pid } = spawnWorker(id);

    return Response.json({
      success: true,
      message: "Job resumed",
      worker_pid: pid,
    });
  } catch (error) {
    logError("jobs.resume_failed", error);
    return Response.json(
      { error: "Failed to resume job" },
      { status: 500 }
    );
  }
}
