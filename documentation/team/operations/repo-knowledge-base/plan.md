# PS-nodeJS Repository Knowledge Base Plan

## Objective

Create a repository-local knowledge base model for PS-nodeJS using the existing `documentation/team/*` structure as the canonical source of truth, while keeping ENVISecondBrain as external business and project context.

The result must make documentation navigation predictable for humans and AI agents without creating a second Obsidian vault or duplicating canonical repo documentation into ENVISecondBrain.

## Mandatory Context For Execution

Future execution sessions must read these files first:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `documentation/ai/README.md`
4. `documentation/team/operations/docs-map.md`
5. `documentation/team/README.md`
6. `factory/TOOL-ADAPTERS.md` when work touches Factory process rules

Related external context:

- `C:\Users\oram\ENVISecondBrain\40_wiki\firma\systemy\ps-envi\_index.ps-envi.md`
- `C:\Users\oram\ENVISecondBrain\CLAUDE.md`

## Scope

In scope:

- define PS-nodeJS repository knowledge base rules;
- clarify canonical docs vs adapters vs Factory meta-tools;
- resolve `docs/team/*` legacy status;
- add an explicit bridge to ENVISecondBrain;
- update AI entrypoints so agents start from the right docs;
- add a documentation impact checklist for future code changes.

Out of scope:

- moving PS-nodeJS into ENVISecondBrain;
- creating a new Obsidian vault inside PS-nodeJS;
- copying full PS-nodeJS docs into ENVISecondBrain;
- changing runtime code, DB schema, API behavior, deployment, or test framework.

## Target Model

```text
PS-nodeJS/
  AGENTS.md
  CLAUDE.md
  documentation/
    ai/
      README.md
    team/
      README.md
      architecture/
      onboarding/
      runbooks/
      operations/
        docs-map.md
        repo-knowledge-base/
          plan.md
          progress.md
          activity-log.md
```

Rules:

1. `documentation/team/*` is the repository knowledge base and canonical operational documentation.
2. `documentation/team/operations/docs-map.md` is the source-of-truth map, not a replacement for the canonical files it points to.
3. `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/*`, and `.claude/*` are adapters.
4. `factory/*` contains AI process meta-tools and must not become product/system documentation.
5. ENVISecondBrain stores business/project synthesis and links to PS-nodeJS canonical docs; it must not mirror repo documentation.

## Checkpoints

### N0 - Documentation Inventory

Goal:

Create a factual inventory of current documentation entrypoints, canonical files, adapters, legacy paths, and duplication risks.

Concrete tasks:

1. Review `documentation/team/**`.
2. Review `documentation/ai/README.md`.
3. Review `documentation/team/operations/docs-map.md`.
4. Review `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/**`, `.claude/**`.
5. Review `docs/team/**` and classify it as active, redirect-only, or legacy.

Acceptance criteria:

1. `progress.md` records the inventory summary.
2. Every active documentation root has an owner role: canonical, adapter, Factory, legacy, or external context.
3. `docs/team/*` has an explicit decision recorded before any rewrite.

Evidence:

1. `git status --short`
2. `rg --files documentation docs .github .claude factory | rg "README|docs-map|instructions|AGENTS|CLAUDE|plan|progress|activity-log"`

### N1 - Canonical Model Definition

Goal:

Define the repository knowledge base model in canonical docs.

Concrete tasks:

1. Update `documentation/ai/README.md` with the repository knowledge base contract.
2. Update `documentation/team/README.md` with canonical/adapters/Factory/external-context boundaries.
3. Keep wording concise and avoid duplicating the full content of `docs-map.md`.

Acceptance criteria:

1. `documentation/team/*` is explicitly named as the repository knowledge base.
2. ENVISecondBrain is explicitly named as external business/project context.
3. The docs say not to duplicate canonical repo docs into ENVISecondBrain.

Evidence:

1. `rg -n "repository knowledge base|ENVISecondBrain|canonical|adapter" documentation/ai/README.md documentation/team/README.md`

### N2 - Entry Point Order

Goal:

Make agent orientation deterministic.

Concrete tasks:

1. Update `AGENTS.md` with the required reading order.
2. Update `CLAUDE.md` only if its current navigation guidance conflicts with the new model.
3. Ensure `docs-map.md` remains the source-of-truth map for documentation categories.

Acceptance criteria:

1. New agents can identify the first 3-5 files to read.
2. `AGENTS.md` remains short and pointer-like.
3. `CLAUDE.md` remains an operational shortcut, not a long documentation map.

Evidence:

1. `rg -n "docs-map|documentation/ai/README|documentation/team/README|reading order|start" AGENTS.md CLAUDE.md`

### N3 - Legacy Path Decision

Goal:

Remove ambiguity around `docs/team/*`.

Concrete tasks:

1. Decide whether `docs/team/*` is removed, converted to redirect stubs, or explicitly marked legacy.
2. If retained, add a clear pointer to `documentation/team/*`.
3. Update `docs-map.md` with the decision.

Acceptance criteria:

1. No active rule points agents to `docs/team/*` as canonical.
2. Any retained file under `docs/team/*` clearly points to `documentation/team/*`.
3. `docs-map.md` records the legacy status.

Evidence:

1. `rg -n "docs/team|documentation/team|legacy|canonical" docs documentation/team/operations/docs-map.md`

### N4 - ENVISecondBrain Bridge

Goal:

Create a small, explicit bridge between PS-nodeJS documentation and ENVISecondBrain.

Concrete tasks:

1. Add `documentation/team/operations/second-brain-link.md`.
2. Define what belongs in PS-nodeJS docs and what belongs in ENVISecondBrain.
3. Link to the PS ENVI branch in ENVISecondBrain.
4. Define when code changes require an SB wiki impact decision.

Acceptance criteria:

1. The bridge file exists and is linked from `docs-map.md`.
2. It states that PS-nodeJS is source of truth for code, DB, API, runtime, deploy, and repo operations.
3. It states that ENVISecondBrain is source of truth for business/project synthesis and AI working context.
4. It forbids mirroring full repo docs into SB.

Evidence:

1. `Test-Path documentation/team/operations/second-brain-link.md`
2. `rg -n "second-brain-link|ENVISecondBrain|source of truth|mirror" documentation/team/operations`

### N5 - Documentation Impact Checklist

Goal:

Make future code changes decide whether documentation and SB context need updates.

Concrete tasks:

1. Update `AGENTS.md` or `.github/PULL_REQUEST_TEMPLATE.md` with a documentation impact rule.
2. The rule must cover DB, env, deploy, workflow, Drive folder shape, API contract, and business process changes.
3. Link to `post-change-checklist.md` for DB/env/deploy changes.
4. Link to `second-brain-link.md` for SB impact decisions.

Acceptance criteria:

1. PR/review workflow includes a docs impact decision.
2. DB/env/deploy changes still require `post-change-checklist.md`.
3. Business/process changes require an explicit ENVISecondBrain impact decision.

Evidence:

1. `rg -n "documentation impact|post-change-checklist|second-brain|Drive folder|API contract|business process" AGENTS.md .github/PULL_REQUEST_TEMPLATE.md documentation/team/operations`

### N6 - Adapter Deduplication

Goal:

Keep tool-specific instruction files as adapters only.

Concrete tasks:

1. Review `.github/instructions/*`, `.github/copilot-instructions.md`, `CLAUDE.md`, `AGENTS.md`, `.claude/**`.
2. Replace long duplicated documentation with links where practical.
3. Preserve tool-specific operational details that cannot live in canonical docs.

Acceptance criteria:

1. Adapter files are short enough to be useful as entrypoints.
2. Long-lived knowledge lives in `documentation/team/*`.
3. No adapter silently conflicts with canonical docs.

Evidence:

1. `rg -n "documentation/team|docs-map|canonical|adapter" .github CLAUDE.md AGENTS.md .claude`

### N7 - Closeout And Handoff

Goal:

Close the planning task by updating canonical docs and removing or archiving temporary planning artifacts according to repository policy.

Concrete tasks:

1. Verify all checklist items in this plan.
2. Update `progress.md` with final status.
3. Decide whether to remove this `repo-knowledge-base/` active task folder after canonical docs are updated.
4. Leave a concise closeout note in `post-change-checklist.md` only if DB/env/deploy was affected.

Acceptance criteria:

1. The repository has a single documented knowledge base model.
2. Agents have a deterministic entrypoint order.
3. `docs/team/*` ambiguity is resolved.
4. ENVISecondBrain bridge exists and is discoverable.
5. No DB/API/UI/runtime behavior changed.

Evidence:

1. `git diff -- documentation/ai documentation/team AGENTS.md CLAUDE.md .github docs`
2. `git status --short`

## Risks

1. Legacy `docs/team/*` may be used by older tooling or prompts.
2. Long adapter files may still contain useful tool-specific rules and should not be blindly collapsed.
3. ENVISecondBrain bridge must avoid creating a second source of truth for repo internals.
4. This is documentation/process work only; runtime code changes would increase the required review scope.

## Execution Notes

Use one checkpoint per session unless the diff remains very small. After each session, append to `progress.md` and `activity-log.md`.

No tests are required unless runtime code changes are introduced. Expected verification is documentation grep, file existence checks, and `git diff` review.
