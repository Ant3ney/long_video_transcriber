// ============================================================
// Core types for the transcription pipeline
// ============================================================

export type JobStatus =
  | "pending"       // Job created, file uploaded, waiting to start
  | "analyzing"     // Inspecting media metadata
  | "splitting"     // Splitting into chunks
  | "transcribing"  // Transcribing chunks
  | "merging"       // Merging chunk transcripts
  | "completed"     // Done
  | "failed"        // Terminal failure
  | "paused";       // Interrupted, can be resumed

export type ChunkStatus =
  | "pending"       // Waiting to be transcribed
  | "transcribing"  // Currently being transcribed
  | "completed"     // Successfully transcribed
  | "failed";       // Transcription failed

export interface Job {
  id: string;
  filename: string;
  original_path: string;
  status: JobStatus;
  error_message: string | null;

  // Media metadata (populated after analysis)
  duration_seconds: number | null;
  file_size: number;

  // Chunk tracking
  total_chunks: number;
  completed_chunks: number;
  failed_chunks: number;

  // Configuration
  chunk_duration_seconds: number;   // Target chunk duration
  overlap_seconds: number;          // Overlap between chunks

  // Whisper model to use
  whisper_model: string;

  // Transcript paths
  transcript_path: string | null;

  // Worker process ID (for tracking running workers)
  worker_pid: number | null;

  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  job_id: string;
  chunk_index: number;
  chunk_path: string | null;
  audio_path: string | null;
  status: ChunkStatus;
  error_message: string | null;

  // Timing within the original file
  start_time: number;    // seconds
  end_time: number;      // seconds

  // Output
  transcript_path: string | null;
  transcript_text: string | null;

  created_at: string;
  updated_at: string;
}

// API response types
export interface JobWithChunks extends Job {
  chunks: Chunk[];
}

export interface CreateJobRequest {
  filename: string;
  file_size: number;
  chunk_duration_seconds?: number;
  overlap_seconds?: number;
  whisper_model?: string;
}

export interface JobProgressSummary {
  id: string;
  filename: string;
  status: JobStatus;
  total_chunks: number;
  completed_chunks: number;
  failed_chunks: number;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
  progress_percent: number;
}

