import { NextRequest } from "next/server";
import { getJobWithChunks, deleteJob } from "@/lib/db";
import { cleanupJobFiles } from "@/lib/storage";

// ============================================================
// GET /api/jobs/[id] — Get job details with all chunks
// ============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = getJobWithChunks(id);

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    return Response.json({ job });
  } catch (error) {
    console.error("Failed to get job:", error);
    return Response.json(
      { error: "Failed to get job" },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/jobs/[id] — Delete a job and its files
// ============================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    cleanupJobFiles(id);
    deleteJob(id);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete job:", error);
    return Response.json(
      { error: "Failed to delete job" },
      { status: 500 }
    );
  }
}

