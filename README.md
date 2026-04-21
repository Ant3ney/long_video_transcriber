# Transcript Maker

A local-first web application for transcribing long video and audio files using OpenAI Whisper. Designed for reliability with large files (3+ hours), featuring automatic chunking, real-time progress tracking, and full resumability.

## Features

- **Large file support** - Handles multi-hour videos by automatically splitting into manageable chunks
- **Real-time progress** - See overall and per-chunk progress as transcription runs
- **Resumable** - If the process stops mid-way, resume without losing completed work
- **Multiple export formats** - Download transcripts as plain text or SRT (with timestamps)
- **Configurable** - Choose Whisper model size, chunk duration, and overlap settings
- **Local-first** - Everything runs on your machine, no cloud services needed

## Architecture

The app consists of three layers:

1. **Next.js UI** (React) - Upload area, job list, job detail, transcript viewer
2. **API Routes** (Route Handlers) - Job CRUD, file upload, progress polling
3. **Python Worker** (Whisper + FFmpeg) - Media analysis, splitting, transcription

All state is persisted in SQLite. Files are stored on the local filesystem under the `data/` directory.

## Prerequisites

### Required

1. **Node.js 18+** - https://nodejs.org/
2. **Python 3.8+** - https://python.org/
3. **FFmpeg** - Required for media inspection and audio extraction

Install FFmpeg:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Arch Linux
sudo pacman -S ffmpeg
```

4. **OpenAI Whisper** - Python package for transcription

```bash
pip install -r worker/requirements.txt
```

### Optional

For faster transcription with GPU, install PyTorch with CUDA support:

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

## Installation

```bash
# 1. Install Node.js dependencies
npm install

# 2. Create a Python virtual environment and install dependencies
python -m venv .venv
.venv/bin/pip install -r worker/requirements.txt

# 3. Verify FFmpeg is installed
ffmpeg -version
```

The app automatically detects the `.venv/` virtual environment and uses it for the Python worker. No need to activate it manually.

> **Arch Linux note**: Arch uses an externally-managed Python environment (PEP 668), so you **must** use a virtual environment. The commands above handle this correctly. Do not use `pip install` directly on the system Python.

## Running

```bash
npm run dev
```

Then open http://localhost:3000 in your browser.

The Python transcription worker is automatically spawned by the app when a job is created. No separate process needed.

### Environment Variables

- `PYTHON_CMD` (default: auto-detected) - Python command to use for the worker. The app checks for `.venv/bin/python` first, then falls back to `python3`.

## Usage

1. **Upload** - Drag and drop or click to select a video/audio file
2. **Configure** (optional) - Expand Advanced options to adjust chunk duration, overlap, and Whisper model
3. **Start** - Click Start Transcription to upload and begin processing
4. **Monitor** - Watch progress in real-time on the job detail page
5. **Resume** - If interrupted, click Resume to continue from where it stopped
6. **Export** - Download the transcript as TXT or SRT

## How It Works

### Pipeline

1. **Upload** - File is saved to `data/uploads/{job_id}/`
2. **Analyze** - FFprobe inspects the file for duration and format
3. **Split** - If the file is longer than the chunk duration, it is split into chunks with optional overlap
4. **Transcribe** - Each chunk is extracted as 16kHz mono WAV audio and transcribed using Whisper
5. **Merge** - All chunk transcripts are merged into a final transcript (TXT and SRT)

### Resume Logic

All state is persisted in SQLite. When resuming:

- Already-completed chunks are skipped
- Chunks that were mid-transcription are reset to pending
- The worker picks up from where it left off

### File Storage

```
data/
  transcription.db            # SQLite database
  uploads/{job_id}/           # Original uploaded files
  chunks/{job_id}/            # Extracted audio chunks (WAV)
  transcripts/{job_id}/       # Transcript outputs
    chunk_0000.txt            # Per-chunk text
    chunk_0000.json           # Per-chunk segments (for SRT)
    transcript.txt            # Final merged text
    transcript.srt            # Final merged SRT
```

## Whisper Models

| Model  | Parameters | Relative Speed | VRAM   |
|--------|-----------|----------------|--------|
| tiny   | 39M       | ~32x           | ~1 GB  |
| base   | 74M       | ~16x           | ~1 GB  |
| small  | 244M      | ~6x            | ~2 GB  |
| medium | 769M      | ~2x            | ~5 GB  |
| large  | 1550M     | 1x             | ~10 GB |

Speed is relative to real-time on a modern GPU. CPU transcription is significantly slower.

## Troubleshooting

**Failed to start Python worker** - Ensure Python 3 is installed and accessible as `python3`. Set `PYTHON_CMD=python` if your system uses `python` instead.

**ffmpeg not found** - Install FFmpeg and ensure it is in your PATH.

**No module named whisper** - Install the Whisper package: `pip install openai-whisper`

**Transcription is slow** - Use a smaller Whisper model (tiny or base), use shorter chunk durations, or install CUDA-enabled PyTorch for GPU acceleration.

**Job stuck in transcribing state** - The worker may have crashed. Click Resume to restart it.

## Development

```bash
npm run dev       # Run dev server
npx tsc --noEmit  # Type check
npm run lint      # Lint
npm run build     # Build for production
```

## Tech Stack

- Next.js 16 with App Router
- TypeScript
- Tailwind CSS 4
- better-sqlite3 for SQLite
- OpenAI Whisper for speech recognition
- FFmpeg for media processing

