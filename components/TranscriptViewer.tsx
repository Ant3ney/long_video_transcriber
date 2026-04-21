"use client";

import { useEffect, useState, useCallback } from "react";

// ============================================================
// Transcript viewer — loads and displays the transcript text
// ============================================================

interface TranscriptViewerProps {
  jobId: string;
}

export default function TranscriptViewer({ jobId }: TranscriptViewerProps) {
  const [text, setText] = useState<string | null>(null);
  const [format, setFormat] = useState<"txt" | "srt">("txt");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTranscript = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/transcript-text?format=${format}`);
      if (res.ok) {
        const data = await res.json();
        setText(data.text);
      } else {
        setError("Transcript not available");
      }
    } catch {
      setError("Failed to load transcript");
    } finally {
      setLoading(false);
    }
  }, [jobId, format]);

  useEffect(() => {
    // Defer fetch to avoid synchronous setState in effect body
    const timeout = setTimeout(fetchTranscript, 0);
    return () => clearTimeout(timeout);
  }, [fetchTranscript]);

  const handleCopy = async () => {
    if (text) {
      await navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="p-4">
      {/* Format toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setFormat("txt")}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            format === "txt"
              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          }`}
        >
          Plain Text
        </button>
        <button
          onClick={() => setFormat("srt")}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            format === "srt"
              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          }`}
        >
          SRT (with timestamps)
        </button>
        {text && (
          <button
            onClick={handleCopy}
            className="ml-auto px-3 py-1 text-xs font-medium rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            Copy to clipboard
          </button>
        )}
      </div>

      {/* Content */}
      {loading && (
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-full" />
          <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-5/6" />
          <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-4/6" />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
      )}

      {text && (
        <div className="max-h-[500px] overflow-y-auto">
          <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

