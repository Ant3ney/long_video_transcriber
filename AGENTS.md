# Project: Transcript Maker

## Architecture

- **Frontend**: Next.js 16 App Router with React 19 client components
- **Backend**: Next.js Route Handlers (app/api/) for REST API
- **Worker**: Python script (worker/transcribe.py) spawned as child process per job
- **Database**: SQLite via better-sqlite3 (data/transcription.db)
- **Storage**: Local filesystem under data/ (uploads, chunks, transcripts)

## Key Conventions

- Route handlers use { params: Promise<{ id: string }> } pattern (not RouteContext)
- Client components use "use client" directive
- Avoid calling setState synchronously in useEffect bodies - use setTimeout(fn, 0) to defer
- All database access goes through lib/db.ts
- All file storage access goes through lib/storage.ts
- Python worker communicates via SQLite (no HTTP between Node and Python)

## Commands

- npm run dev: Start dev server
- npm run build: Production build
- npm run lint: ESLint
- npx tsc --noEmit: Type check

## File Layout

- lib/types.ts: TypeScript types for Job, Chunk, etc.
- lib/db.ts: SQLite database schema and queries
- lib/storage.ts: Filesystem storage utilities
- lib/worker.ts: Python worker spawner
- app/api/jobs/: REST API routes
- components/: React UI components
- worker/: Python transcription pipeline
- data/: Runtime data (gitignored)

