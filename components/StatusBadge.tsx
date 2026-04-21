"use client";

import type { JobStatus, ChunkStatus } from "@/lib/types";

// ============================================================
// Status badge component for displaying job/chunk status
// ============================================================

const jobStatusConfig: Record<
  JobStatus,
  { label: string; color: string; animate?: boolean }
> = {
  pending: { label: "Pending", color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  analyzing: { label: "Analyzing", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", animate: true },
  splitting: { label: "Splitting", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300", animate: true },
  transcribing: { label: "Transcribing", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", animate: true },
  merging: { label: "Merging", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", animate: true },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  paused: { label: "Paused", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
};

const chunkStatusConfig: Record<
  ChunkStatus,
  { label: string; color: string; animate?: boolean }
> = {
  pending: { label: "Pending", color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  transcribing: { label: "Transcribing", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", animate: true },
  completed: { label: "Done", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

interface StatusBadgeProps {
  status: JobStatus | ChunkStatus;
  type?: "job" | "chunk";
  className?: string;
}

export default function StatusBadge({
  status,
  type = "job",
  className = "",
}: StatusBadgeProps) {
  const config =
    type === "job"
      ? jobStatusConfig[status as JobStatus]
      : chunkStatusConfig[status as ChunkStatus];

  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color} ${className}`}
    >
      {config.animate && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {config.label}
    </span>
  );
}

