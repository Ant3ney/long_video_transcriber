import { NextRequest } from "next/server";
import { getJob } from "@/lib/db";
import { mergedTranscriptPath, srtTranscriptPath, readTranscript } from "@/lib/storage";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 299;

// ============================================================
// GET /api/jobs/[id]/transcript-text — Get transcript content as JSON
// Query params:
//   format: "txt" (default) or "srt"
// ============================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = getJob(id);

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    const format = request.nextUrl.searchParams.get("format") || "txt";
    const filePath = format === "srt" ? srtTranscriptPath(id) : mergedTranscriptPath(id);
    const content = readTranscript(filePath);

    if (!content) {
      return Response.json(
        { error: "Transcript not available yet" },
        { status: 404 }
      );
    }

    return Response.json({ text: content, format });
  } catch (error) {
    logError("jobs.transcript_text_failed", error);
    return Response.json(
      { error: "Failed to get transcript text" },
      { status: 500 }
    );
  }
}
