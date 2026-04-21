"use client";

import { useEffect, useState, useCallback } from "react";
import type { JobWithChunks, ChunkStatus } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import ProgressBar from "./ProgressBar";
import TranscriptViewer from "./TranscriptViewer";

// ============================================================
// Job detail view — shows full job info, chunk progress, transcript
// ============================================================

interface JobDetailProps {
  jobId: string;
  onBack: () => void;
}

export default function JobDetail({ jobId, onBack }: JobDetailProps) {
  const [job, setJob] = useState<JobWithChunks | null>(null);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
      }
    } catch (err) {
      console.error("Failed to fetch job:", err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Poll for updates every 2 seconds while job is active
  useEffect(() => {
    // Defer initial fetch to avoid synchronous setState in effect body
    const timeout = setTimeout(fetchJob, 0);
    const interval = setInterval(fetchJob, 2000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchJob]);

  const handleResume = async () => {
    setResuming(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/resume`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to resume");
      }
      await fetchJob();
    } catch {
      setError("Failed to resume job");
    } finally {
      setResuming(false);
    }
  };

  const handleRetryChunk = async (chunkId: string) => {
    setRetrying(chunkId);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry-chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunk_id: chunkId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to retry chunk");
      }
      await fetchJob();
    } catch {
      setError("Failed to retry chunk");
    } finally {
      setRetrying(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this job and all its files?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      onBack();
    } catch {
      setError("Failed to delete job");
      setDeleting(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatChunkTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const isActive = job && ["analyzing", "splitting", "transcribing", "merging"].includes(job.status);
  const canResume = job && ["failed", "paused"].includes(job.status);
  const hasTranscript = job?.status === "completed" && job.transcript_path;

  // Estimate remaining time based on chunk processing speed
  const estimateRemaining = () => {
    if (!job || job.total_chunks === 0 || job.completed_chunks === 0) return null;
    if (job.status !== "transcribing") return null;

    const elapsed =
      new Date().getTime() - new Date(job.created_at + "Z").getTime();
    const msPerChunk = elapsed / job.completed_chunks;
    const remaining = job.total_chunks - job.completed_chunks;
    const msRemaining = remaining * msPerChunk;
    const secRemaining = Math.round(msRemaining / 1000);

    return formatDuration(secRemaining);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3" />
          <div className="h-4 bg-zinc-100 dark:bg-zinc-800/50 rounded w-1/2" />
          <div className="h-32 bg-zinc-100 dark:bg-zinc-800/50 rounded" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 text-center">
        <p className="text-zinc-500">Job not found</p>
        <button onClick={onBack} className="mt-2 text-blue-600 hover:text-blue-700 text-sm">
          ← Back to jobs
        </button>
      </div>
    );
  }

  const overallProgress =
    job.status === "completed"
      ? 100
      : job.total_chunks > 0
        ? Math.round((job.completed_chunks / job.total_chunks) * 100)
        : job.status === "analyzing"
          ? 5
          : job.status === "splitting"
            ? 10
            : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onBack}
              className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              ← Back to jobs
            </button>
            <div className="flex items-center gap-2">
              {canResume && (
                <button
                  onClick={handleResume}
                  disabled={resuming}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
                >
                  {resuming ? "Resuming..." : "▶ Resume"}
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-3 mb-4">
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                {job.filename}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                <StatusBadge status={job.status} type="job" />
                <span>{formatSize(job.file_size)}</span>
                {job.duration_seconds && (
                  <span>Duration: {formatDuration(job.duration_seconds)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
          {job.error_message && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
              <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
                Error
              </p>
              <p className="text-sm text-red-600 dark:text-red-400/80">
                {job.error_message}
              </p>
            </div>
          )}

          {/* Overall progress */}
          <ProgressBar
            value={overallProgress}
            label="Overall Progress"
            variant={
              job.status === "completed"
                ? "green"
                : job.status === "failed"
                  ? "red"
                  : "blue"
            }
            size="lg"
          />

          {/* Stats row */}
          {job.total_chunks > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {job.total_chunks}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Total Chunks
                </p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {job.completed_chunks}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Completed
                </p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {job.failed_chunks}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Failed
                </p>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {job.total_chunks - job.completed_chunks - job.failed_chunks}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Remaining
                </p>
              </div>
            </div>
          )}

          {/* Estimated time remaining */}
          {isActive && estimateRemaining() && (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 text-center">
              Estimated time remaining: <strong>{estimateRemaining()}</strong>
            </p>
          )}
        </div>
      </div>

      {/* Chunk list */}
      {job.chunks.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Chunks
            </h2>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {job.chunks.map((chunk) => (
                <div
                  key={chunk.id}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {chunk.chunk_index + 1}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        {formatChunkTime(chunk.start_time)} →{" "}
                        {formatChunkTime(chunk.end_time)}
                      </span>
                      <StatusBadge
                        status={chunk.status as ChunkStatus}
                        type="chunk"
                      />
                    </div>
                    {chunk.error_message && (
                      <p className="text-xs text-red-500 mt-0.5 truncate">
                        {chunk.error_message}
                      </p>
                    )}
                  </div>
                  {chunk.status === "failed" && (
                    <button
                      onClick={() => handleRetryChunk(chunk.id)}
                      disabled={retrying === chunk.id}
                      className="flex-shrink-0 px-2 py-1 text-xs font-medium rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-50 transition-colors"
                    >
                      {retrying === chunk.id ? "..." : "Retry"}
                    </button>
                  )}
                  {chunk.status === "completed" && (
                    <span className="flex-shrink-0 text-emerald-500">✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transcript section */}
      {hasTranscript && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Transcript
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                {showTranscript ? "Hide" : "Show"} Transcript
              </button>
              <a
                href={`/api/jobs/${jobId}/transcript?format=txt`}
                download
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                ↓ TXT
              </a>
              <a
                href={`/api/jobs/${jobId}/transcript?format=srt`}
                download
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
              >
                ↓ SRT
              </a>
            </div>
          </div>
          {showTranscript && <TranscriptViewer jobId={jobId} />}
        </div>
      )}
    </div>
  );
}

