import path from "path";
import fs from "fs";

// ============================================================
// Filesystem storage layout for uploads, chunks, and transcripts
// ============================================================

const DATA_DIR =
  process.env.TRANSCRIPT_DATA_DIR ??
  (process.env.VERCEL ? path.join("/tmp", "transcript-maker") : path.join(process.cwd(), "data"));

export const DIRS = {
  data: DATA_DIR,
  uploads: path.join(DATA_DIR, "uploads"),
  chunks: path.join(DATA_DIR, "chunks"),
  transcripts: path.join(DATA_DIR, "transcripts"),
} as const;

/** Ensure all storage directories exist */
export function ensureStorageDirs(): void {
  for (const dir of Object.values(DIRS)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/** Get the upload directory for a specific job */
export function jobUploadDir(jobId: string): string {
  const dir = path.join(DIRS.uploads, jobId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Get the chunks directory for a specific job */
export function jobChunksDir(jobId: string): string {
  const dir = path.join(DIRS.chunks, jobId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Get the transcripts directory for a specific job */
export function jobTranscriptsDir(jobId: string): string {
  const dir = path.join(DIRS.transcripts, jobId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Get the path where the uploaded file should be stored */
export function uploadFilePath(jobId: string, filename: string): string {
  return path.join(jobUploadDir(jobId), path.basename(filename));
}

/** Get the final merged transcript path */
export function mergedTranscriptPath(jobId: string): string {
  return path.join(jobTranscriptsDir(jobId), "transcript.txt");
}

/** Get the SRT transcript path */
export function srtTranscriptPath(jobId: string): string {
  return path.join(jobTranscriptsDir(jobId), "transcript.srt");
}

/** Read a transcript file, returning null if it doesn't exist */
export function readTranscript(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** Clean up all files for a job */
export function cleanupJobFiles(jobId: string): void {
  const dirs = [
    path.join(DIRS.uploads, jobId),
    path.join(DIRS.chunks, jobId),
    path.join(DIRS.transcripts, jobId),
  ];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Format seconds to HH:MM:SS */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
