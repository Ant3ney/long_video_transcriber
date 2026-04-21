import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { updateJob } from "./db";

// ============================================================
// Spawns the Python transcription worker as a child process
// ============================================================

// Use turbopackIgnore to prevent the bundler from tracing into these dynamic paths
const PROJECT_ROOT = /* turbopackIgnore: true */ process.cwd();
const WORKER_SCRIPT = path.join(PROJECT_ROOT, "worker", "transcribe.py");
const DB_PATH = path.join(PROJECT_ROOT, "data", "transcription.db");

// Track running workers by job ID to prevent duplicate spawns
const runningWorkers = new Map<string, number>();

/**
 * Resolve the Python command to use.
 *
 * Priority:
 *   1. PYTHON_CMD environment variable (explicit override)
 *   2. .venv/bin/python inside the project (local virtual environment)
 *   3. "python3" on PATH (system fallback)
 */
function resolvePythonCmd(): string {
  if (process.env.PYTHON_CMD) {
    return process.env.PYTHON_CMD;
  }

  // Check for a local virtual environment created by the project
  const venvPython = path.join(PROJECT_ROOT, ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }

  return "python3";
}

/**
 * Spawn the Python transcription worker for a given job.
 * The worker handles the full pipeline: analyze → split → transcribe → merge.
 * It communicates progress by writing directly to the SQLite database.
 */
export function spawnWorker(jobId: string): { pid: number } {
  // Prevent duplicate workers for the same job
  if (runningWorkers.has(jobId)) {
    const existingPid = runningWorkers.get(jobId)!;
    console.log(`[worker] Worker already running for job ${jobId} (PID ${existingPid})`);
    return { pid: existingPid };
  }

  const pythonCmd = resolvePythonCmd();
  console.log(`[worker] Spawning worker for job ${jobId} (python: ${pythonCmd})`);

  const child = spawn(pythonCmd, [WORKER_SCRIPT, jobId, DB_PATH], {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    },
  });

  const pid = child.pid ?? 0;
  runningWorkers.set(jobId, pid);

  // Update job with worker PID
  try {
    updateJob(jobId, { worker_pid: pid } as Record<string, unknown> & { worker_pid: number });
  } catch (e) {
    console.error(`[worker] Failed to update job PID: ${e}`);
  }

  // Log stdout
  child.stdout?.on("data", (data: Buffer) => {
    const lines = data.toString().trim().split("\n");
    for (const line of lines) {
      console.log(`[worker:${jobId.slice(0, 8)}] ${line}`);
    }
  });

  // Log stderr
  child.stderr?.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        console.error(`[worker:${jobId.slice(0, 8)}:err] ${line}`);
      }
    }
  });

  // Handle worker exit
  child.on("close", (code) => {
    runningWorkers.delete(jobId);
    console.log(`[worker] Worker for job ${jobId.slice(0, 8)} exited with code ${code}`);

    try {
      updateJob(jobId, { worker_pid: null } as Record<string, unknown> & { worker_pid: null });
    } catch {
      // Job might already be cleaned up
    }
  });

  child.on("error", (err) => {
    runningWorkers.delete(jobId);
    console.error(`[worker] Failed to spawn worker for job ${jobId}: ${err.message}`);

    try {
      updateJob(jobId, {
        status: "failed",
        error_message: `Failed to start Python worker: ${err.message}. Make sure Python 3 is installed and the virtual environment is set up (python -m venv .venv && .venv/bin/pip install -r worker/requirements.txt).`,
        worker_pid: null,
      } as Record<string, unknown>);
    } catch {
      // DB might not be available
    }
  });

  return { pid };
}

/** Check if a worker is currently running for a job */
export function isWorkerRunning(jobId: string): boolean {
  return runningWorkers.has(jobId);
}

/** Get all running worker job IDs */
export function getRunningWorkerJobIds(): string[] {
  return Array.from(runningWorkers.keys());
}

