# JusDown Backend v2.0 - README

This document provides a brief overview of the new, modern backend for JusDown.

## Architecture

This backend is built on Node.js v20+ and follows a modular, library-based approach, completely avoiding system binaries like `yt-dlp`.

- **`server.js`**: The main entry point. It runs an Express server, handles API routing, manages download jobs, and orchestrates the different downloader modules.
- **`playwright_engine.js`**: Manages a persistent, headless Chromium browser instance using Playwright. This is the core engine for scraping media URLs from platforms that don't have a public API.
- **`*_downloader.js` Modules**: Each platform has its own module (e.g., `instagram_downloader.js`, `youtube_downloader.js`). These modules contain the specific logic for extracting media URLs from that platform.
- **`ffmpeg_converter.js`**: A utility module that uses `fluent-ffmpeg` to convert downloaded media into MP3 format when required.

## API Endpoints

All endpoints are prefixed with `/api/v2` and require an `x-api-key` header for authentication.

- **`POST /api/v2/download`**:
  - Starts a new download job.
  - Body: `{ "url": "...", "type": "mp3|mp4|image", "platform": "youtube|instagram|etc." }`
  - Returns: `{ "success": true, "jobId": "..." }`

- **`GET /api/v2/status/:jobId`**:
  - Checks the status of a download job.
  - Returns: `{ "success": true, "status": "queued|processing|completed|failed", "url": "..." (if completed), "error": "..." (if failed) }`
