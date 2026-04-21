import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Job, Chunk, JobWithChunks, JobProgressSummary } from "./types";

// ============================================================
// SQLite database for persistent job and chunk tracking
// ============================================================

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "transcription.db");

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

let _db: Database.Database | null = null;

/** Get or create the singleton database connection */
export function getDb(): Database.Database {
  if (_db) return _db;

  ensureDataDir();
  _db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read/write performance
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");

  // Create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      duration_seconds REAL,
      file_size INTEGER NOT NULL DEFAULT 0,
      total_chunks INTEGER NOT NULL DEFAULT 0,
      completed_chunks INTEGER NOT NULL DEFAULT 0,
      failed_chunks INTEGER NOT NULL DEFAULT 0,
      chunk_duration_seconds INTEGER NOT NULL DEFAULT 600,
      overlap_seconds INTEGER NOT NULL DEFAULT 2,
      whisper_model TEXT NOT NULL DEFAULT 'base',
      transcript_path TEXT,
      worker_pid INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_path TEXT,
      audio_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      start_time REAL NOT NULL DEFAULT 0,
      end_time REAL NOT NULL DEFAULT 0,
      transcript_path TEXT,
      transcript_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_job_id ON chunks(job_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_status ON chunks(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  `);

  return _db;
}

// ============================================================
// Job queries
// ============================================================

export function createJob(job: {
  id: string;
  filename: string;
  original_path: string;
  file_size: number;
  chunk_duration_seconds?: number;
  overlap_seconds?: number;
  whisper_model?: string;
}): Job {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO jobs (id, filename, original_path, file_size, chunk_duration_seconds, overlap_seconds, whisper_model)
    VALUES (@id, @filename, @original_path, @file_size, @chunk_duration_seconds, @overlap_seconds, @whisper_model)
  `);
  stmt.run({
    id: job.id,
    filename: job.filename,
    original_path: job.original_path,
    file_size: job.file_size,
    chunk_duration_seconds: job.chunk_duration_seconds ?? 600,
    overlap_seconds: job.overlap_seconds ?? 2,
    whisper_model: job.whisper_model ?? "base",
  });
  return getJob(job.id)!;
}

export function getJob(id: string): Job | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Job | undefined;
  return row ?? null;
}

export function getAllJobs(): Job[] {
  const db = getDb();
  return db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all() as Job[];
}

export function getJobWithChunks(id: string): JobWithChunks | null {
  const job = getJob(id);
  if (!job) return null;
  const chunks = getChunksForJob(id);
  return { ...job, chunks };
}

export function updateJob(id: string, updates: Partial<Job>): void {
  const db = getDb();
  const allowed = [
    "status", "error_message", "duration_seconds", "file_size",
    "total_chunks", "completed_chunks", "failed_chunks",
    "transcript_path", "worker_pid",
  ];

  const setClauses: string[] = ["updated_at = datetime('now')"];
  const values: Record<string, unknown> = { id };

  for (const key of allowed) {
    if (key in updates) {
      setClauses.push(`${key} = @${key}`);
      values[key] = (updates as Record<string, unknown>)[key];
    }
  }

  const sql = `UPDATE jobs SET ${setClauses.join(", ")} WHERE id = @id`;
  db.prepare(sql).run(values);
}

export function deleteJob(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM chunks WHERE job_id = ?").run(id);
  db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
}

/** Get summary list for the job list view */
export function getJobSummaries(): JobProgressSummary[] {
  const jobs = getAllJobs();
  return jobs.map((job) => {
    let progress_percent = 0;
    if (job.status === "completed") {
      progress_percent = 100;
    } else if (job.total_chunks > 0) {
      progress_percent = Math.round((job.completed_chunks / job.total_chunks) * 100);
    } else if (job.status === "analyzing") {
      progress_percent = 5;
    } else if (job.status === "splitting") {
      progress_percent = 10;
    }

    return {
      id: job.id,
      filename: job.filename,
      status: job.status,
      total_chunks: job.total_chunks,
      completed_chunks: job.completed_chunks,
      failed_chunks: job.failed_chunks,
      duration_seconds: job.duration_seconds,
      created_at: job.created_at,
      updated_at: job.updated_at,
      progress_percent,
    };
  });
}

// ============================================================
// Chunk queries
// ============================================================

export function createChunk(chunk: {
  id: string;
  job_id: string;
  chunk_index: number;
  start_time: number;
  end_time: number;
}): Chunk {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO chunks (id, job_id, chunk_index, start_time, end_time)
    VALUES (@id, @job_id, @chunk_index, @start_time, @end_time)
  `);
  stmt.run(chunk);
  return getChunk(chunk.id)!;
}

export function getChunk(id: string): Chunk | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM chunks WHERE id = ?").get(id) as Chunk | undefined;
  return row ?? null;
}

export function getChunksForJob(jobId: string): Chunk[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM chunks WHERE job_id = ? ORDER BY chunk_index ASC")
    .all(jobId) as Chunk[];
}

export function updateChunk(id: string, updates: Partial<Chunk>): void {
  const db = getDb();
  const allowed = [
    "chunk_path", "audio_path", "status", "error_message",
    "transcript_path", "transcript_text",
  ];

  const setClauses: string[] = ["updated_at = datetime('now')"];
  const values: Record<string, unknown> = { id };

  for (const key of allowed) {
    if (key in updates) {
      setClauses.push(`${key} = @${key}`);
      values[key] = (updates as Record<string, unknown>)[key];
    }
  }

  const sql = `UPDATE chunks SET ${setClauses.join(", ")} WHERE id = @id`;
  db.prepare(sql).run(values);
}

/** Recount completed/failed chunks for a job and update the job record */
export function refreshJobChunkCounts(jobId: string): void {
  const db = getDb();
  const counts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM chunks WHERE job_id = ?
  `).get(jobId) as { total: number; completed: number; failed: number };

  updateJob(jobId, {
    total_chunks: counts.total,
    completed_chunks: counts.completed,
    failed_chunks: counts.failed,
  } as Partial<Job>);
}

/** Mark any chunks that were "transcribing" back to "pending" (for resume after crash) */
export function resetStalledChunks(jobId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE chunks SET status = 'pending', updated_at = datetime('now')
    WHERE job_id = ? AND status = 'transcribing'
  `).run(jobId);
}

