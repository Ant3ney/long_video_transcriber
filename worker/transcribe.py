#!/usr/bin/env python3
"""
Transcription worker for the Long Video Transcript Maker.

This script handles the full transcription pipeline for a single job:
  1. Analyze media file (get duration, format info)
  2. Split into chunks if needed (using FFmpeg)
  3. Transcribe each chunk using Whisper
  4. Merge chunk transcripts into a final transcript

It reads job configuration from SQLite and writes progress back to it.

Usage:
    python3 transcribe.py <job_id> <db_path>
"""

import sys
import os
import json
import sqlite3
import subprocess
import shutil
import time
import uuid
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime

# ============================================================
# Database helpers
# ============================================================

def get_db(db_path: str) -> sqlite3.Connection:
    """Open a connection to the SQLite database."""
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def update_job(conn: sqlite3.Connection, job_id: str, **kwargs):
    """Update job fields in the database."""
    kwargs["updated_at"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [job_id]
    conn.execute(f"UPDATE jobs SET {set_clause} WHERE id = ?", values)
    conn.commit()


def update_chunk(conn: sqlite3.Connection, chunk_id: str, **kwargs):
    """Update chunk fields in the database."""
    kwargs["updated_at"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [chunk_id]
    conn.execute(f"UPDATE chunks SET {set_clause} WHERE id = ?", values)
    conn.commit()


def refresh_job_counts(conn: sqlite3.Connection, job_id: str):
    """Recount chunk statuses and update the job record."""
    row = conn.execute("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM chunks WHERE job_id = ?
    """, (job_id,)).fetchone()
    update_job(conn, job_id,
               total_chunks=row["total"],
               completed_chunks=row["completed"],
               failed_chunks=row["failed"])


def get_job(conn: sqlite3.Connection, job_id: str) -> dict:
    """Fetch a job by ID."""
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise ValueError(f"Job {job_id} not found")
    return dict(row)


def get_chunks(conn: sqlite3.Connection, job_id: str) -> list:
    """Fetch all chunks for a job, ordered by index."""
    rows = conn.execute(
        "SELECT * FROM chunks WHERE job_id = ? ORDER BY chunk_index ASC",
        (job_id,)
    ).fetchall()
    return [dict(r) for r in rows]


# ============================================================
# Media analysis using FFmpeg/FFprobe
# ============================================================

def check_ffmpeg():
    """Verify FFmpeg and FFprobe are available."""
    for cmd in ["ffmpeg", "ffprobe"]:
        if shutil.which(cmd) is None:
            raise RuntimeError(
                f"{cmd} not found. Please install FFmpeg: "
                "https://ffmpeg.org/download.html"
            )


def get_media_duration(file_path: str) -> float:
    """Get duration of a media file in seconds using FFprobe."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            file_path,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"FFprobe failed: {result.stderr}")

    info = json.loads(result.stdout)

    # Try format duration first
    if "format" in info and "duration" in info["format"]:
        return float(info["format"]["duration"])

    # Fall back to first stream duration
    for stream in info.get("streams", []):
        if "duration" in stream:
            return float(stream["duration"])

    raise RuntimeError("Could not determine media duration")


def is_remote_url(value: str) -> bool:
    """Return True when a path points at a remote HTTP(S) asset."""
    parsed = urllib.parse.urlparse(value)
    return parsed.scheme in ("http", "https")


def download_remote_media(url: str, upload_dir: str, filename: str) -> str:
    """Stream a remote media file to local disk for FFmpeg processing."""
    os.makedirs(upload_dir, exist_ok=True)
    safe_filename = os.path.basename(filename) or "upload"
    local_path = os.path.join(upload_dir, safe_filename)

    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        print(f"Using previously downloaded media: {local_path}")
        return local_path

    tmp_path = f"{local_path}.part"
    print(f"Downloading remote media to {local_path}")

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "long-video-transcript-maker/1.0",
        },
    )

    bytes_written = 0
    next_progress = 256 * 1024 * 1024
    with urllib.request.urlopen(request, timeout=60) as response:
        with open(tmp_path, "wb") as output:
            while True:
                chunk = response.read(8 * 1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
                bytes_written += len(chunk)
                if bytes_written >= next_progress:
                    print(f"Downloaded {bytes_written / (1024 * 1024 * 1024):.2f} GiB")
                    next_progress += 256 * 1024 * 1024

    os.replace(tmp_path, local_path)
    print(f"Remote media download complete: {bytes_written} bytes")
    return local_path


# ============================================================
# Audio extraction and splitting
# ============================================================

def extract_audio_chunk(
    input_path: str,
    output_path: str,
    start_time: float,
    duration: float,
) -> str:
    """
    Extract an audio chunk from the input file.
    Converts to WAV 16kHz mono, which is optimal for Whisper.
    """
    cmd = [
        "ffmpeg",
        "-y",                       # Overwrite output
        "-i", input_path,
        "-ss", str(start_time),     # Start time
        "-t", str(duration),        # Duration
        "-vn",                      # No video
        "-acodec", "pcm_s16le",     # PCM 16-bit
        "-ar", "16000",             # 16kHz sample rate
        "-ac", "1",                 # Mono
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg audio extraction failed: {result.stderr[:500]}")
    return output_path


# ============================================================
# Whisper transcription
# ============================================================

_whisper_model = None
_whisper_model_name = None


def load_whisper_model(model_name: str):
    """Load the Whisper model (cached across chunks)."""
    global _whisper_model, _whisper_model_name
    if _whisper_model is not None and _whisper_model_name == model_name:
        return _whisper_model

    print(f"Loading Whisper model: {model_name}")
    import whisper
    _whisper_model = whisper.load_model(model_name)
    _whisper_model_name = model_name
    print(f"Whisper model loaded: {model_name}")
    return _whisper_model


def transcribe_audio(audio_path: str, model_name: str) -> dict:
    """
    Transcribe an audio file using Whisper.
    Returns the full result dict with 'text' and 'segments'.
    """
    model = load_whisper_model(model_name)
    result = model.transcribe(audio_path, verbose=False)
    return result


# ============================================================
# SRT formatting
# ============================================================

def format_timestamp_srt(seconds: float) -> str:
    """Format seconds as SRT timestamp: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def segments_to_srt(segments: list, time_offset: float = 0.0) -> str:
    """Convert Whisper segments to SRT format with optional time offset."""
    lines = []
    for i, seg in enumerate(segments, 1):
        start = seg["start"] + time_offset
        end = seg["end"] + time_offset
        text = seg["text"].strip()
        lines.append(f"{i}")
        lines.append(f"{format_timestamp_srt(start)} --> {format_timestamp_srt(end)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


# ============================================================
# Main pipeline
# ============================================================

def run_pipeline(job_id: str, db_path: str):
    """Run the full transcription pipeline for a job."""
    conn = get_db(db_path)
    job = get_job(conn, job_id)

    data_dir = os.path.dirname(db_path)
    uploads_dir = os.path.join(data_dir, "uploads", job_id)
    chunks_dir = os.path.join(data_dir, "chunks", job_id)
    transcripts_dir = os.path.join(data_dir, "transcripts", job_id)
    os.makedirs(uploads_dir, exist_ok=True)
    os.makedirs(chunks_dir, exist_ok=True)
    os.makedirs(transcripts_dir, exist_ok=True)

    original_path = job["original_path"]
    chunk_duration = job["chunk_duration_seconds"]
    overlap = job["overlap_seconds"]
    whisper_model = job["whisper_model"]

    try:
        # ---- Step 1: Check prerequisites ----
        print("Checking FFmpeg...")
        check_ffmpeg()

        # ---- Step 2: Analyze media ----
        print(f"Analyzing: {original_path}")
        update_job(conn, job_id, status="analyzing")

        if is_remote_url(original_path):
            original_path = download_remote_media(original_path, uploads_dir, job["filename"])

        if not os.path.exists(original_path):
            raise FileNotFoundError(f"Upload file not found: {original_path}")

        duration = get_media_duration(original_path)
        print(f"Duration: {duration:.1f}s ({duration/60:.1f} min)")
        update_job(conn, job_id, duration_seconds=duration)

        # ---- Step 3: Plan chunks ----
        existing_chunks = get_chunks(conn, job_id)

        if not existing_chunks:
            # Create chunk records
            print("Planning chunks...")
            update_job(conn, job_id, status="splitting")

            chunk_starts = []
            t = 0.0
            while t < duration:
                chunk_end = min(t + chunk_duration, duration)
                chunk_starts.append((t, chunk_end))
                # Advance by chunk_duration minus overlap, but ensure progress
                t += max(chunk_duration - overlap, chunk_duration / 2)

            total = len(chunk_starts)
            print(f"Planned {total} chunks")

            for i, (start, end) in enumerate(chunk_starts):
                chunk_id = str(uuid.uuid4())
                conn.execute(
                    """INSERT INTO chunks (id, job_id, chunk_index, start_time, end_time, status,
                       created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))""",
                    (chunk_id, job_id, i, start, end),
                )
            conn.commit()
            refresh_job_counts(conn, job_id)
            existing_chunks = get_chunks(conn, job_id)
        else:
            print(f"Found {len(existing_chunks)} existing chunks (resuming)")
            # Reset any stalled transcribing chunks to pending
            conn.execute(
                "UPDATE chunks SET status = 'pending', updated_at = datetime('now') "
                "WHERE job_id = ? AND status = 'transcribing'",
                (job_id,),
            )
            conn.commit()
            existing_chunks = get_chunks(conn, job_id)

        # ---- Step 4: Extract audio and transcribe each chunk ----
        update_job(conn, job_id, status="transcribing")
        total_chunks = len(existing_chunks)

        for chunk in existing_chunks:
            if chunk["status"] == "completed":
                print(f"  Chunk {chunk['chunk_index']+1}/{total_chunks}: already done, skipping")
                continue

            chunk_idx = chunk["chunk_index"]
            chunk_id = chunk["id"]
            start = chunk["start_time"]
            end = chunk["end_time"]
            chunk_len = end - start

            print(f"  Chunk {chunk_idx+1}/{total_chunks}: {start:.1f}s - {end:.1f}s")

            try:
                # Mark chunk as transcribing
                update_chunk(conn, chunk_id, status="transcribing")

                # Extract audio for this chunk
                audio_filename = f"chunk_{chunk_idx:04d}.wav"
                audio_path = os.path.join(chunks_dir, audio_filename)

                if not os.path.exists(audio_path):
                    print(f"    Extracting audio...")
                    extract_audio_chunk(original_path, audio_path, start, chunk_len)
                else:
                    print(f"    Audio already extracted")

                update_chunk(conn, chunk_id, audio_path=audio_path)

                # Transcribe
                print(f"    Transcribing with Whisper ({whisper_model})...")
                result = transcribe_audio(audio_path, whisper_model)

                text = result.get("text", "").strip()
                segments = result.get("segments", [])

                # Save chunk transcript
                txt_path = os.path.join(transcripts_dir, f"chunk_{chunk_idx:04d}.txt")
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write(text)

                # Save chunk segments as JSON (for SRT generation later)
                json_path = os.path.join(transcripts_dir, f"chunk_{chunk_idx:04d}.json")
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump({
                        "text": text,
                        "segments": segments,
                        "start_time": start,
                        "end_time": end,
                    }, f, indent=2)

                # Update chunk record
                update_chunk(conn, chunk_id,
                             status="completed",
                             transcript_path=txt_path,
                             transcript_text=text,
                             error_message=None)

                refresh_job_counts(conn, job_id)
                print(f"    Done ({len(text)} chars)")

            except Exception as e:
                print(f"    ERROR: {e}")
                update_chunk(conn, chunk_id,
                             status="failed",
                             error_message=str(e)[:1000])
                refresh_job_counts(conn, job_id)
                # Continue to next chunk instead of aborting

        # ---- Step 5: Check for failures ----
        refresh_job_counts(conn, job_id)
        job = get_job(conn, job_id)
        if job["failed_chunks"] > 0:
            msg = f"{job['failed_chunks']} chunk(s) failed transcription"
            print(f"WARNING: {msg}")
            # Don't abort - merge what we have

        # ---- Step 6: Merge transcripts ----
        print("Merging transcripts...")
        update_job(conn, job_id, status="merging")

        chunks = get_chunks(conn, job_id)
        all_text_parts = []
        all_srt_parts = []
        srt_counter = 1

        for chunk in chunks:
            if chunk["status"] != "completed":
                # Insert a placeholder for failed chunks
                all_text_parts.append(
                    f"\n[Chunk {chunk['chunk_index']+1}: transcription failed]\n"
                )
                continue

            # Text
            text = chunk["transcript_text"] or ""
            all_text_parts.append(text)

            # SRT segments
            json_path = os.path.join(
                transcripts_dir, f"chunk_{chunk['chunk_index']:04d}.json"
            )
            if os.path.exists(json_path):
                with open(json_path, "r", encoding="utf-8") as f:
                    chunk_data = json.load(f)
                offset = chunk["start_time"]
                for seg in chunk_data.get("segments", []):
                    start_ts = seg["start"] + offset
                    end_ts = seg["end"] + offset
                    seg_text = seg["text"].strip()
                    if seg_text:
                        all_srt_parts.append(f"{srt_counter}")
                        all_srt_parts.append(
                            f"{format_timestamp_srt(start_ts)} --> {format_timestamp_srt(end_ts)}"
                        )
                        all_srt_parts.append(seg_text)
                        all_srt_parts.append("")
                        srt_counter += 1

        # Write merged text transcript
        merged_text = "\n\n".join(all_text_parts).strip()
        merged_txt_path = os.path.join(transcripts_dir, "transcript.txt")
        with open(merged_txt_path, "w", encoding="utf-8") as f:
            f.write(merged_text)
        print(f"Merged transcript: {len(merged_text)} chars -> {merged_txt_path}")

        # Write merged SRT
        merged_srt = "\n".join(all_srt_parts)
        merged_srt_path = os.path.join(transcripts_dir, "transcript.srt")
        with open(merged_srt_path, "w", encoding="utf-8") as f:
            f.write(merged_srt)
        print(f"Merged SRT: {srt_counter-1} entries -> {merged_srt_path}")

        # ---- Step 7: Mark complete ----
        update_job(conn, job_id,
                   status="completed",
                   transcript_path=merged_txt_path)
        print(f"Job {job_id} completed successfully!")

    except Exception as e:
        print(f"FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        try:
            update_job(conn, job_id,
                       status="failed",
                       error_message=str(e)[:2000])
        except Exception:
            pass
        sys.exit(1)
    finally:
        conn.close()


# ============================================================
# Entry point
# ============================================================

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <job_id> <db_path>")
        sys.exit(1)

    job_id = sys.argv[1]
    db_path = sys.argv[2]

    print(f"Starting transcription worker")
    print(f"  Job ID: {job_id}")
    print(f"  DB: {db_path}")
    print(f"  PID: {os.getpid()}")

    run_pipeline(job_id, db_path)
