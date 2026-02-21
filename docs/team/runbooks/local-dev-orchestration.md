# Local Dev Orchestration (Backend + Frontend)

This runbook describes how to start and stop both local dev servers from the backend repository.

## Repositories

- Backend: `C:\Apache24\htdocs\PS-nodeJS`
- Frontend: `C:\Apache24\htdocs\ENVI.ProjectSite`

## Commands (run in `PS-nodeJS`)

```bash
yarn dev:up
yarn dev:status
yarn dev:logs
yarn dev:logs:follow
yarn dev:down
```

## What each command does

- `yarn dev:up`
  - starts backend (`yarn start`) on port `3000` if not already running
  - starts frontend (`yarn start`) on port `9000` if not already running
  - waits for readiness:
    - backend port `3000` in LISTEN state
    - frontend `http://localhost:9000/docs/` returns HTTP 200
  - writes runtime state into `tmp/dev-runtime/`

- `yarn dev:status`
  - prints runtime status for both services
  - refreshes `tmp/dev-runtime/status.json`
  - exit code:
    - `0` when both services are running
    - `1` when any service is down

- `yarn dev:logs`
  - prints tail of backend and frontend logs

- `yarn dev:logs:follow`
  - follows logs until interrupted (`Ctrl+C`)

- `yarn dev:down`
  - stops tracked backend/frontend processes using PID files
  - removes PID/status files
  - keeps logs for debugging

## Runtime files

Created under `tmp/dev-runtime/` (ignored by git):

- `backend.pid`
- `frontend.pid`
- `backend.log`
- `frontend.log`
- `status.json`

## Troubleshooting

- Frontend repo missing:
  - ensure path exists: `C:\Apache24\htdocs\ENVI.ProjectSite`

- Port already occupied by unknown process:
  - use `yarn dev:status` to see detected PID
  - stop conflicting process manually if needed
  - then run `yarn dev:up` again

- Backend root `/` returns 404:
  - expected in this project
  - liveness is based on port `3000` listening
