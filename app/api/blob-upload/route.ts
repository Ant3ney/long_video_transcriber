import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { logError, logInfo, logWarn } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 299;

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 * 1024; // 20 GiB
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const ALLOWED_CONTENT_TYPES = [
  "video/*",
  "audio/*",
  "application/octet-stream",
  "application/x-matroska",
];

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;

  try {
    body = (await request.json()) as HandleUploadBody;
  } catch (error) {
    logError("blob_upload.invalid_json", error);
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (!multipart) {
          logWarn("blob_upload.non_multipart_requested", { pathname });
        }

        logInfo("blob_upload.token_requested", {
          pathname,
          multipart,
          has_client_payload: Boolean(clientPayload),
          max_upload_bytes: MAX_UPLOAD_BYTES,
        });

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + TOKEN_TTL_MS,
          addRandomSuffix: true,
          tokenPayload: clientPayload,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        logInfo("blob_upload.completed_callback", {
          pathname: blob.pathname,
          content_type: blob.contentType,
          token_payload: tokenPayload,
        });
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    logError("blob_upload.failed", error, { request_type: body.type });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blob upload failed" },
      { status: 400 }
    );
  }
}
