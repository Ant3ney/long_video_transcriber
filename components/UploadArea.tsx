"use client";

import { useState, useCallback, useRef } from "react";
import type { PutBlobResult } from "@vercel/blob";
import { upload } from "@vercel/blob/client";

// ============================================================
// File upload area with drag-and-drop and configuration options
// ============================================================

interface UploadAreaProps {
  onJobCreated: (jobId: string) => void;
}

const ACCEPTED_EXTENSIONS = ".mp4,.webm,.avi,.mov,.mkv,.mpeg,.mpg,.mp3,.wav,.flac,.ogg,.m4a";
const VERCEL_FUNCTION_BODY_LIMIT = 4.5 * 1024 * 1024;

export default function UploadArea({ onJobCreated }: UploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Configuration
  const [chunkDuration, setChunkDuration] = useState(600); // 10 minutes
  const [overlap, setOverlap] = useState(2);
  const [whisperModel, setWhisperModel] = useState("base");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        setError(null);
      }
    },
    []
  );

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const shouldUseBlobUpload = (file: File) => {
    if (process.env.NEXT_PUBLIC_USE_VERCEL_BLOB_UPLOADS === "true") {
      return true;
    }

    if (process.env.NEXT_PUBLIC_USE_VERCEL_BLOB_UPLOADS === "false") {
      return false;
    }

    return window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1" &&
      file.size > VERCEL_FUNCTION_BODY_LIMIT;
  };

  const createBlobJob = async (blob: PutBlobResult, file: File) => {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: "vercel-blob",
        filename: file.name,
        file_size: file.size,
        blob_url: blob.url,
        blob_download_url: blob.downloadUrl,
        blob_pathname: blob.pathname,
        chunk_duration_seconds: chunkDuration,
        overlap_seconds: overlap,
        whisper_model: whisperModel,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Job creation failed with status ${res.status}`);
    }

    return data as { job: { id: string } };
  };

  const uploadToVercelBlob = async (file: File) => {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const blob = await upload(`uploads/${Date.now()}-${safeName}`, file, {
      access: "public",
      handleUploadUrl: "/api/blob-upload",
      multipart: true,
      contentType: file.type || "application/octet-stream",
      clientPayload: JSON.stringify({
        filename: file.name,
        size: file.size,
        chunk_duration_seconds: chunkDuration,
        overlap_seconds: overlap,
        whisper_model: whisperModel,
      }),
      onUploadProgress: (event) => {
        setUploadProgress(Math.round(event.percentage));
      },
    });

    return createBlobJob(blob, file);
  };

  const uploadToAppServer = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("chunk_duration_seconds", chunkDuration.toString());
    formData.append("overlap_seconds", overlap.toString());
    formData.append("whisper_model", whisperModel);

    // Use XMLHttpRequest for upload progress tracking
    const xhr = new XMLHttpRequest();

    return new Promise<{ job: { id: string } }>((resolve, reject) => {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error || "Upload failed"));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onabort = () => reject(new Error("Upload cancelled"));

      xhr.open("POST", "/api/jobs");
      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const result = shouldUseBlobUpload(selectedFile)
        ? await uploadToVercelBlob(selectedFile)
        : await uploadToAppServer(selectedFile);

      setSelectedFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onJobCreated(result.job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Upload Video
        </h2>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center p-8 rounded-lg border-2 border-dashed
            cursor-pointer transition-colors duration-200
            ${
              isDragging
                ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30"
                : selectedFile
                  ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800"
                  : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleFileSelect}
            className="hidden"
          />

          {selectedFile ? (
            <div className="text-center">
              <div className="text-3xl mb-2">🎬</div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {selectedFile.name}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {formatSize(selectedFile.size)}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                Click or drag to change file
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl mb-3 opacity-50">📁</div>
              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                Drop a video or audio file here
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                or click to browse
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-3">
                Supports MP4, WebM, AVI, MOV, MKV, MP3, WAV, FLAC, and more
              </p>
            </div>
          )}
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400 mb-1">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-blue-100 dark:bg-blue-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Advanced options toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="mt-4 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          {showAdvanced ? "▼" : "▶"} Advanced options
        </button>

        {/* Advanced options */}
        {showAdvanced && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Chunk duration (seconds)
              </label>
              <input
                type="number"
                value={chunkDuration}
                onChange={(e) => setChunkDuration(parseInt(e.target.value) || 600)}
                min={60}
                max={3600}
                className="w-full px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
              <p className="text-xs text-zinc-400 mt-1">
                {Math.round(chunkDuration / 60)} min per chunk
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Overlap (seconds)
              </label>
              <input
                type="number"
                value={overlap}
                onChange={(e) => setOverlap(parseInt(e.target.value) || 0)}
                min={0}
                max={30}
                className="w-full px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Whisper model
              </label>
              <select
                value={whisperModel}
                onChange={(e) => setWhisperModel(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              >
                <option value="tiny">tiny (fastest, least accurate)</option>
                <option value="base">base (fast, good accuracy)</option>
                <option value="small">small (balanced)</option>
                <option value="medium">medium (slower, better)</option>
                <option value="large">large (slowest, best)</option>
              </select>
            </div>
          </div>
        )}

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className={`
            mt-4 w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors duration-200
            ${
              !selectedFile || uploading
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            }
          `}
        >
          {uploading
            ? "Uploading..."
            : selectedFile
              ? `Start Transcription`
              : "Select a file to begin"}
        </button>
      </div>
    </div>
  );
}
