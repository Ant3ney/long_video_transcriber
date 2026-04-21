"use client";

import { useState } from "react";
import UploadArea from "@/components/UploadArea";
import JobList from "@/components/JobList";
import JobDetail from "@/components/JobDetail";

// ============================================================
// Main page — Upload area + Job list, or Job detail view
// ============================================================

export default function Home() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleJobCreated = (jobId: string) => {
    setRefreshTrigger((t) => t + 1);
    setSelectedJobId(jobId);
  };

  // Show job detail view
  if (selectedJobId) {
    return (
      <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
        <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <h1
              className="text-xl font-bold text-zinc-900 dark:text-zinc-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              onClick={() => setSelectedJobId(null)}
            >
              🎙️ Transcript Maker
            </h1>
          </div>
        </header>
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
          <JobDetail
            jobId={selectedJobId}
            onBack={() => setSelectedJobId(null)}
          />
        </main>
      </div>
    );
  }

  // Show main view with upload + job list
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            🎙️ Transcript Maker
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Upload a video or audio file to transcribe it using Whisper
          </p>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 space-y-6">
        <UploadArea onJobCreated={handleJobCreated} />
        <JobList
          onSelectJob={setSelectedJobId}
          refreshTrigger={refreshTrigger}
        />
      </main>
    </div>
  );
}
