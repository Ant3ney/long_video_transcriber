import { NextRequest } from "next/server";
import { getJob } from "@/lib/db";
import { mergedTranscriptPath, srtTranscriptPath, readTranscript } from "@/lib/storage";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 299;

// ============================================================
// GET /api/jobs/[id]/transcript — Download transcript
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

    let filePath: string;
    let contentType: string;
    let extension: string;

    if (format === "srt") {
      filePath = srtTranscriptPath(id);
      contentType = "application/x-subrip";
      extension = "srt";
    } else {
      filePath = mergedTranscriptPath(id);
      contentType = "text/plain";
      extension = "txt";
    }

    const content = readTranscript(filePath);
    if (!content) {
      return Response.json(
        { error: "Transcript not available yet" },
        { status: 404 }
      );
    }

    // Return as downloadable file
    const filename = `${job.filename.replace(/\.[^.]+$/, "")}_transcript.${extension}`;

    return new Response(content, {
      headers: {
        "Content-Type": `${contentType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logError("jobs.transcript_download_failed", error);
    return Response.json(
      { error: "Failed to get transcript" },
      { status: 500 }
    );
  }
}
