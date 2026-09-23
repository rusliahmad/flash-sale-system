# High-Throughput Flash Sale System

Backend + frontend for a flash sale: limited stock, one purchase per user, configurable sale window, race-condition-safe under concurrent load.

Status: scaffolding in progress. Design write-up, architecture diagram, run instructions, and stress test results land here once the core purchase flow is implemented.

## Layout

- `backend/` — Node.js + TypeScript + Express API, backed by Redis
- `frontend/` — React + TypeScript (Vite)
- `docker-compose.yml` — local Redis
