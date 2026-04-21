"use client";

import { useEffect, useState, useCallback } from "react";
import type { JobProgressSummary } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import ProgressBar from "./ProgressBar";

// ============================================================
// Job list component — shows all jobs with progress summaries
// ============================================================

interface JobListProps {
  /** Called when a job is clicked */
  onSelectJob: (jobId: string) => void;
  /** Trigger to refresh the list */
  refreshTrigger: number;
}

export default function JobList({ onSelectJob, refreshTrigger }: JobListProps) {
  const [jobs, setJobs] = useState<JobProgressSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + poll every 3 seconds
  useEffect(() => {
    // Defer initial fetch to avoid synchronous setState in effect body
    const timeout = setTimeout(fetchJobs, 0);
    const interval = setInterval(fetchJobs, 3000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchJobs, refreshTrigger]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "Z"); // SQLite dates are UTC
      return d.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3" />
          <div className="h-12 bg-zinc-100 dark:bg-zinc-800/50 rounded" />
          <div className="h-12 bg-zinc-100 dark:bg-zinc-800/50 rounded" />
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 text-center">
        <div className="text-3xl mb-2 opacity-50">📋</div>
        <p className="text-zinc-500 dark:text-zinc-400">
          No transcription jobs yet. Upload a video to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Transcription Jobs
        </h2>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {jobs.map((job) => (
          <button
            key={job.id}
            onClick={() => onSelectJob(job.id)}
            className="w-full text-left p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {job.filename}
                  </p>
                  <StatusBadge status={job.status} type="job" />
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{formatDate(job.created_at)}</span>
                  {job.duration_seconds && (
                    <span>Duration: {formatDuration(job.duration_seconds)}</span>
                  )}
                  {job.total_chunks > 0 && (
                    <span>
                      {job.completed_chunks}/{job.total_chunks} chunks
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Progress bar for active jobs */}
            {job.status !== "pending" && job.status !== "completed" && job.status !== "failed" && (
              <ProgressBar
                value={job.progress_percent}
                showPercent={false}
                size="sm"
                variant="blue"
                className="mt-2"
              />
            )}
            {job.status === "completed" && (
              <ProgressBar
                value={100}
                showPercent={false}
                size="sm"
                variant="green"
                className="mt-2"
              />
            )}
            {job.status === "failed" && (
              <ProgressBar
                value={job.progress_percent}
                showPercent={false}
                size="sm"
                variant="red"
                className="mt-2"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

