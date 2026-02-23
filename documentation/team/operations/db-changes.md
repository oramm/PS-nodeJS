# DB Changes Guidelines

## Purpose

Rules for analyzing and proposing MariaDB schema changes in this project.

## Safety rules

1. Default to read-only access unless write approval is explicit.
2. Never expose passwords, tokens, or personal data in logs/reports.
3. Base every recommendation on inspected schema, not assumptions.
4. Do not execute migrations without explicit approval.

## Environment context

- Env loading is defined in `documentation/team/onboarding/environment.md`.
- Default `NODE_ENV` is production if not set.
- Confirm active DB target in logs before DB work.

## Minimum schema analysis set

- `information_schema.tables`
- `information_schema.columns`
- `information_schema.statistics`
- `information_schema.key_column_usage`
- `information_schema.referential_constraints`

## Consistency checks

1. FK type compatibility.
2. FK index presence.
3. Naming consistency for tables, PK/FK, and indexes.
4. `NULL` usage aligned with optional/required relation semantics.
5. Cascade behavior aligned with business risk.

## Required change proposal format

1. Reason and risk being addressed.
2. Affected objects (tables/columns/relations/indexes).
3. Proposed SQL (without execution).
4. Impact (migration risk, lock/runtime risk).
5. Validation and rollback plan.

## AI-specific section

When an AI agent contributes to DB-impacting work:

1. It must update `documentation/team/operations/post-change-checklist.md`.
2. It must not create new root-level operational docs.
3. It should map tool-specific instructions to this file instead of duplicating DB policy text.
