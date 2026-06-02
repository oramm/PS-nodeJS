# Production Kylos DB Migration Memory

This file is the shared memory for the last known migration verification state of the production database.

It is not the source of truth for schema status. The source of truth is the live database schema checked through `information_schema`.

Use this file to remember what was last verified, what was missing, and what still needs manual follow-up.

## Current Target

- Label: `remote-kylos`
- Expected env: `production`
- DB host: unknown until next verification
- DB name: unknown until next verification

## Last Verified Snapshot

- Verified at: not verified yet
- Verified by: not verified yet
- Verified commit: not verified yet
- Check mode: not verified yet
- Result summary: baseline file created, no production verification recorded yet

## Verification Scope

- Scope: not verified yet
- Incremental baseline: not verified yet
- Forward migrations checked: not verified yet

## Verified Migrations

No production verification has been recorded yet.

| Migration | File hash | Status | Verified at | Notes |
| --- | --- | --- | --- | --- |
| none | none | pending | n/a | first remote check will populate this table |

## Known Gaps

- No shared production migration snapshot has been recorded yet.

## Manual Verification Needed

- First remote-kylos read-only verification to establish baseline target (`DB_HOST`, `DB_NAME`) and verified migration set.

## Notes

- Update this file only after a fresh read-only verification against the production schema.
- Keep entries concise and current so the file stays useful during future migration checks.