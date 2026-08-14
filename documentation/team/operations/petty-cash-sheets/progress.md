# Petty cash entries with postal register extension — progress

Companion to `plan.md`. Append session entries; do not rewrite past entries except for factual fixes.

## Current status

- Active phase: defects found by the owner's own testing are fixed; awaiting his review before P7
- Last completed checkpoint: **P6 — Frontend entry form**, then a fix round on top of it
- Next checkpoint: **P7 — Live cutover under supervision**

## Checkpoint status

| ID | Title | Status |
|---|---|---|
| P0 | Read live sheet structure and lock the column maps | CLOSED |
| P1 | Domain model and consistency rules | CLOSED |
| P2 | Petty-cash sheet writer with dry-run | CLOSED |
| P3 | Live barcode scanning in the browser | CLOSED |
| P4 | Postal register writer | CLOSED |
| P5 | Controller, validator, router | CLOSED |
| P6 | Frontend entry form | CLOSED |
| P7 | Live cutover under supervision | OPEN |

## Sessions

### 2026-08-12 — Session 0, analysis and planning

Scope: feasibility analysis for automated entry into the petty-cash and postal register sheets;
decide the recognition strategy; produce the planning pack.

Completed:
- Read both development copies and mapped their block structure
- Identified five entry kinds and the settlement rule that drives the inflow column
- Surveyed existing building blocks: `ToolsSheets`, the `ToolsAI` OCR pipeline, the KSeF
  cost-invoice sync, the camera-capture pattern in `SiteVisitsPage`
- Confirmed toolchain: `tesseract 5.5.0` (`pol`, `eng`), `pdftoppm` poppler 26.02, no `zbarimg`
- Locked owner decisions: scan-based barcode capture rather than camera; addressee and contents
  typed manually; AI receives text only, never images; plan lives in this repo

Restructured the same day after owner correction: the petty-cash entry is the aggregate and postal
dispatch is one of its kinds. Module renamed `postalDispatches` → `pettyCash`; planning folder
renamed `poczta-register-sync` → `petty-cash-sheets`.

Checkpoint status: P0 OPEN at end of session.

### 2026-08-12 — Session 1, P0 structure inspection

Scope: read the real structure of both spreadsheets and replace every provisional map in `plan.md`.

Completed:
- Added `src/scripts/pettycash-inspect-sheets.ts` (read-only, `spreadsheets.get` only) and the
  `pettycash:inspect` yarn script
- Inventory pass over both spreadsheets, then deep passes (240 and 700 rows) over the 2026 tabs
- Replaced sections 2.4 and 2.5 of `plan.md` with confirmed values

Findings that changed the design:

1. **The petty-cash writer does not need to insert rows.** Month blocks are pre-sized: August is
   `=SUM(B189:B228)` filled only through row 198, and rows 199–228 are already formatted.
2. **`values.append` on the postal tab writes into unrelated data.** Blocks end at row 435; rows
   436–456 are empty and unformatted; rows 457–463 hold an e-mail address book. `values.append`
   targets row 464.
3. **The postal writer cannot inherit formatting** — rows below the last block carry none, so the
   new block must copy format from the previous block.
4. **`POZOSTAŁO W PORTFELU` is `=B<r>-G<r>+<previous month H>`**, January chaining to the prior
   year's tab. The `443,98` discrepancy noted in session 0 was that carry-over.
5. **The robot must write formulas, not literals** (`=G<r>`, `=E<r>+F<r>`).
6. **Tab titles are inconsistent** — casing differs and one has a trailing space.
7. **September to December 2026 do not exist yet**; the owner opens each month by hand.
8. **No protected ranges exist** in either spreadsheet.
9. Marker columns verified empty: petty cash `N`, postal `I`.

Evidence: `yarn pettycash:inspect` (inventory and two deep passes); dumps in `tmp/`, gitignored
because they contain addressees, letter contents, invoice numbers, amounts and e-mail addresses.

Checkpoint status: P0 CLOSED, P1 OPEN.

### 2026-08-12 — Session 2, P1 domain model

Scope: build the persistence and domain layer specified for P1.

What happened: the first pass followed the plan literally — a migration creating `PettyCashEntries`,
`PostalDispatches` and `PostalDispatchItems`, plus three repositories. The owner challenged it with
one question: *what do you want to keep in that table, when the spreadsheet is still the source of
truth?* Re-examining each field, almost nothing survived:

| Intended column | Where it actually belongs |
|---|---|
| date, description, amounts, payer, document number | the sheet — a DB copy is a second truth that drifts on the first manual edit |
| tracking numbers | column E of the register |
| idempotency key | derivable; the tab is read anyway to find the insertion point |
| who triggered the write | Google version history, if the robot writes under its own identity |
| scan file id | a link in a free column of the register |
| write state for resume | reconciling the two tabs — which also catches manual edits that a stored state never would |

Owner decided: **zero tables**. The persistence layer was deleted.

Completed:
- Deleted `src/pettyCash/migrations/`, `PettyCashEntryRepository.ts`, `PostalDispatchRepository.ts`,
  `PostalDispatchItemRepository.ts`. Nothing was ever applied to any database.
- `src/pettyCash/pettyCashTypes.ts` — `EntryKind`, `SettlementMethod`, and `DispatchSyncState`
  (derived from the sheets, never stored)
- `src/pettyCash/PettyCashEntry.ts` — aggregate as a pure domain object
- `src/pettyCash/postal/PostalDispatch.ts` — items total vs invoice gross, duplicate detection
- `src/pettyCash/postal/PostalDispatchItem.ts` — SSCC normalisation and check-digit validation
- 37 unit tests in two suites
- Updated `plan.md`: P1 rewritten, P5 reworked around reconciliation instead of a stored state,
  locked decisions and risks updated

Correction worth recording: **the tracking number is an 18-digit GS1 SSCC, not 20 digits.** The
first implementation required 20 and would have rejected every real scan. Counting the digits in the
live values (`(00)559007734369539067` → 18 after the identifier) exposed it. The GS1 mod-10 check
digit was then verified against 22 real numbers from the sheet spanning 2011–2026 — all pass — so
the decoder can reject a misread instead of accepting a plausible wrong number. This matters more
than it looks: nobody proofreads eighteen digits by eye.

Also corrected mid-session: an initial probe reported core tables such as `Persons` missing from the
dev database. That was wrong — the probe compared names case-sensitively while MariaDB on Windows
stores them lowercase (`lower_case_table_names = 1`). The tables exist.

Evidence:
- `npx tsc --noEmit` — clean
- `node --max-old-space-size=6144 node_modules/jest/bin/jest.js src/pettyCash --runInBand` —
  37 passed, 2 suites
- `yarn check:cycles` — 3 cycles, all pre-existing in `ScrumSheet ↔ PersonsController`, none in
  `pettyCash`

Risks / blockers:
- `yarn test` cannot run a **newly added** test file on this machine: ts-jest builds the TS program
  from scratch and the default 2 GB heap is exhausted. Reproduced with a test file containing no
  imports at all, in two different directories, so it is not specific to this module. Workaround
  recorded in `plan.md` section 1. Worth fixing in the jest config as separate work.
- The dev database `envi_16_06` has 52 migrations pending in `SchemaMigrations` whose objects
  already exist. `applyPendingMigrations` has no filter and no per-migration error handling, so
  `yarn migrate:apply` would break on the first non-idempotent `ALTER`. Untouched here because this
  module no longer needs a database, but it will bite the next person who adds one.

Next session exact actions (P2):
1. `src/pettyCash/sheets/PettyCashWriter.ts` per `plan.md` P2, dry-run on by default
2. Parse the month range from the `=SUM(...)` formula, not from row arithmetic
3. Refuse to write into a month whose aggregate row does not exist
4. Tests asserting the request payload for all five entry kinds
5. Only then, one live write against the development copy

Checkpoint status: P1 CLOSED, P2 OPEN

### 2026-08-12 — Session 3, scope corrections from the owner

No code written beyond one field removal. Three decisions that change the plan:

1. **Confirmations are not scanned today.** The scan-file pipeline planned for P3 (`pdftoppm` +
   server-side decoding of an uploaded PDF) would have added a trip to the scanner rather than
   removing work. P3 was rewritten as live camera scanning in the browser at the moment of entry:
   no upload, no server round-trip, no `pdftoppm`, no stored file. The `POST /pettyCash/postal/scan`
   endpoint is gone from P5; tracking numbers arrive already decoded and are re-validated
   server-side. `PostalDispatch.scanFileUrl` removed from the model.
2. **No KSeF link, ever.** Prefilling an `INVOICE` entry from the cost-invoice sync is rejected, not
   deferred. Recorded under "Explicitly rejected" in `plan.md` so a future session does not
   helpfully reintroduce it.
3. **No letters-module linking.** The contents description of a letter stays free text.

What remains after stage 1 is a single follow-up: receipt recognition for purchases outside KSeF,
text-only to the model, gated on OCR anchors.

Note for P3: the browser check duplicates the SSCC rule that already exists server-side in
`PostalDispatchItem.normalizeTrackingNumber`. That duplication is deliberate — the client copy is
for instant feedback, the server copy is the one that decides. Do not remove either.

Open risk carried into P3: a fixed-focus laptop webcam may not resolve a dense GS1-128 at the
required distance. The typed fallback keeps the work unblocked, and a phone or a USB reader
(~150–250 zł, behaves as a keyboard) fixes it with no code change. P3 must be tested on the machine
that will actually be used.

Checkpoint status: unchanged — P2 next.

### 2026-08-12 — Session 4, P2 petty-cash writer

Scope: the writer that puts one entry row into the petty-cash tab, dry-run by default.

Completed:
- `src/pettyCash/sheets/pettyCashSheetConfig.ts` — column map and the two patterns that carry the
  logic: `=SUM(B<f>:B<l>)` identifies a month aggregate row and yields its data range,
  `=E<n>+F<n>` identifies a canonical data row
- `src/pettyCash/sheets/PettyCashWriter.ts` — snapshot loading, tab resolution by year,
  month-block parsing, free-row selection, duplicate detection, request building, and the fallback
  range expansion. `plan()` is pure and takes a snapshot, so the whole decision path is testable
  without touching Google
- `ToolsSheets.getValues` gained an optional `valueRenderOption` (additive, backwards compatible) so
  the snapshot can be read as formulas
- 26 new tests; 63 across the module

Design points worth keeping:
- The month range is read from the `=SUM(...)` formula, never derived from row numbers.
- A row counts as free only when **all** of A–N are empty, so an ad-hoc note in a trailing column
  protects the row.
- Format is copied from the nearest row whose expense column holds `=E<n>+F<n>`. Inheriting from the
  row above would not work: the empty rows of a month carry a number format only in column B. The
  dry-run proved the rule matters — it skipped row 198 (a `zaliczka` someone left without the
  formula) and took row 197.
- Duplicate detection covers both cases: the robot's own marker anywhere in the tab, and the same
  document number typed by hand within the same month.
- Dates are written as sheet serial numbers, not text, so the cell stays a real date.

Dry-run against the live structure of the development copy (read-only):
- tab `zaliczki 2026`, `sheetId` 166741251
- all eight month blocks parsed with exactly the ranges recorded in P0
- target row 199, format source row 197 — matching the P0 prediction
- correct cells for all five entry kinds

Blocked:
- The single live write could not run. The backend authenticates as `oramwp@gmail.com`; both
  development copies are owned by `kotalamichal02@gmail.com` and shared **read-only**, so
  `batchUpdate` fails with *The caller does not have permission*. Verified afterwards that nothing
  was written: row 199 is still empty and the August aggregate is unchanged.
- Needed to close P2: edit rights for `oramwp@gmail.com` on the copy
  `1ZF5aVskj4g7hcLGu_tDtIjbyoYBYl06HF3LtJf6ANLY`.

Raised for P7: every automated change would appear in version history under a named person rather
than a distinguishable robot account. Worth deciding before the first live write.

Next session exact actions:
1. Once access is granted, run the live write for one entry, verify the row and that the wallet
   balance is unchanged for a card payment, then clear the test row
2. Repeat for the remaining four kinds, or accept one as sufficient evidence
3. Then P3 (browser scanner) or P4 (postal register writer)

Checkpoint status: P2 OPEN — code done, live write outstanding.

### 2026-08-12 — Session 5, P2 live verification

Owner granted `oramwp@gmail.com` edit rights on the development copy. The live half of P2 ran.

One row written per entry kind into `zaliczki 2026`, each verified against the August aggregate row
and then removed:

| Entry kind | Row written | Wallet change | Expected | Result |
|---|---|---|---|---|
| invoice, card | 199 | 0,00 | 0,00 | pass |
| receipt, cash | 199 | −19,99 | −19,99 | pass |
| no document, cash | 199 | −500,00 | −500,00 | pass |
| advance | 199 | +2 000,00 | +2 000,00 | pass |
| postal, cash | 199 | −9,80 | −9,80 | pass |

What the run proved beyond the payload shape:
- The date lands as a real date (`2026-08-12`), not text — the copied number format applied.
- `=E199+F199` and `=G199` evaluated correctly in the sheet, so the row behaves like a hand-typed one.
- A card payment leaves `POZOSTAŁO W PORTFELU` untouched while cash reduces it and an advance raises
  it. That is the wallet rule working end to end, not just in unit tests.
- Re-running the same entry returned `skip` — idempotency verified against a live tab, not a fixture.
- After cleanup the August aggregate was byte-identical to the baseline (`1 027,23`) and row 199 was
  empty again. Cleanup restored formatting too, by copying it from the untouched row below.

Evidence: console transcript of the run, `A188:I188` before and after each write, and the written
row read back in full.

Note for P7: the same edit-rights grant will be needed on the live files, and the identity question
stands — changes are attributed to a named person, not to a distinguishable robot account.

Checkpoint status: P2 CLOSED. P3 and P4 are both open and independent.

### 2026-08-12 — Session 6, P3 browser scanner

Repo: `C:\xampp\htdocs\envi\ENVI.ProjectSite`.

Library decision, made on measurement rather than assumption: `BarcodeDetector` (the native Shape
Detection API, zero bundle cost) is **absent** in a current Chromium 148 build. Relying on it would
have meant a feature that silently does nothing on some machines, so it was dropped rather than kept
as a second code path. `@zxing/browser` + `@zxing/library`, restricted to Code 128, is the single
path.

Delivered:
- `src/Erp/PettyCash/trackingNumber.ts` — SSCC normalisation, GS1 check digit, and a rejection
  classifier that tells apart "wrong kind of shipment", "bad read" and "already on the list"
- `useBarcodeScanner.ts` — camera hook. The decision about a single read is the pure exported
  `evaluateScan`, so the dedupe, duplicate and check-digit behaviour is tested without a camera
- `BarcodeScanPanel.tsx` — stays open after a successful read so a stack of confirmations is scanned
  one after another without clicking
- `BarcodeScanProbePage.tsx` at `/pettyCash/scan-test` — route added without a menu entry, to be
  removed when the real form lands in P6
- 23 tests

Added beyond the task list, after a failing test exposed it: an `unsupported-code` rejection for S10
codes (`EE389519375PL` — Pocztex, parcels). Before that, presenting a Pocztex label produced
"incomplete read — try again", so a person would keep re-presenting a code that can never be
accepted in stage 1. The message now says plainly that this shipment type is entered by hand.

Evidence:
- `npx tsc --noEmit` clean; `npx vitest run src/Erp/PettyCash` → 23 passed
- webpack dev build compiled the whole app successfully with the new module
- screenshot of the probe page rendering inside the app shell:
  `tmp/ui-browser-loop/pettycash-scan-probe.png` (gitignored)

Outstanding, and the reason this checkpoint went before P4: **nobody has yet held a real confirmation
in front of a real camera.** That is the one risk in this module that no test can settle. The owner
opens `/pettyCash/scan-test` and tries it. If the webcam struggles, the typed field beside the
scanner already accepts a USB reader with no code change.

Next session exact actions (P4):
1. `src/pettyCash/postal/PostalRegisterWriter.ts` per `plan.md` P4
2. Guard: refuse to write if any target row already has content in A–H — this is what keeps the
   e-mail address book at rows 457+ safe
3. Tests asserting target rows, merge ranges and the sum formula
4. One live block written to the development copy, then removed

Hardware verdict (owner, same day): **laptop webcam does not read the code; a phone does.** The
decoder is therefore proven — the same build reads the same confirmation on a phone — and the
limitation is optical, not fixable in software. A fixed-focus webcam cannot resolve bars at this
density and no amount of tuning changes that.

Consequence, which is a P6 design input rather than a defect: scanning wants a phone or a USB
reader, while typing the addressee, contents and amounts wants a keyboard. Splitting the two across
devices would need a scan-handoff mechanism — a place to park numbers between phone and laptop —
and this module deliberately has no database, so that is a genuine feature, not a tweak. Options put
to the owner: USB reader on the laptop (zero code, the field already accepts keyboard input), whole
entry on the phone (works today, slower typing), or build the handoff.

**Owner chose: whole entry on the phone.** No purchase, no handoff feature. This turns P6 into a
phone-first screen — items as stacked cards rather than a five-column table, numeric keypads, and a
set of local typing reducers (recent amounts as one-tap choices, recent addressees from
`localStorage`, payer and date defaulting to last used). Those are not polish: with the phone as the
working device, typing is the only friction left in the flow, so cutting it is the checkpoint's job.
P6 also removes the probe page and its route.

Checkpoint status: P3 CLOSED, P4 OPEN.

### 2026-08-12 — Session 7, P4 postal register writer

Scope: the writer that appends a dispatch block to the postal register.

Two facts had to be measured before any code, because neither survives a text export:

1. **The merge contract.** A block carries exactly three merges: column A from the header row through
   the sum row, `B:D` on the header row for the invoice number, and column F across the item rows —
   the last one only when there are two or more letters. Counts over the 2026 tab: 81 `B:D` for 81
   blocks, 80 vertical `A`, 39 `F`.
2. **Cell types.** The date in column F is a real date (serial `46029` = 2026-01-07), not text, and
   single-item blocks use `=SUM(G429)` rather than a range. Both conventions are now reproduced.

Delivered:
- `src/pettyCash/sheets/postalRegisterConfig.ts` — column map and the sum-row pattern
- `src/pettyCash/sheets/PostalRegisterWriter.ts` — tab resolution, last-block detection, block
  placement, request building, occupancy guard, idempotency by invoice number
- `src/pettyCash/sheets/sheetDates.ts` — the serial-date helpers, extracted so both writers share
  them instead of the postal one importing the petty-cash writer for a date conversion
- `src/pettyCash/sheets/__tests__/PostalRegisterWriter.test.ts` — 18 tests; 81 across the module

Design points worth keeping:
- Header labels (`nr listu`, `data `, `kwota `) are copied from the previous block character for
  character, trailing spaces included, instead of being hardcoded. A "corrected" label would make
  the robot's blocks visibly different from everyone else's.
- `copyPaste` with `PASTE_FORMAT` may carry merges from the source rows, so the request list
  unmerges the whole target block before applying its own three. The block shape is then
  deterministic regardless of what the copy brought.
- The occupancy guard refuses to write if any target row has content in A–H. This is the guard that
  keeps the e-mail address book at rows 457+ safe, and the live test confirmed it stayed untouched.

Live test on the development copy: block 82 written at rows 436–439. Merges came out
`A436:A439`, `B436:D436`, `F437:F438` — matching the existing blocks exactly. The date rendered as
a real date, the sheet computed the sum as `19,60`, the address book was unchanged, and a re-run
returned `skip`. Cleanup (unmerge + reset `userEnteredFormat` + clear values) restored the tail of
the register byte-identical to its prior state.

Corrected during the session: header labels were being trimmed, which contradicted the comment
promising a faithful copy. Fixed with a non-trimming accessor and the test updated to assert the
trailing spaces.

Evidence: `npx tsc --noEmit` clean; 81 tests pass; `yarn check:cycles` shows only the pre-existing
`ScrumSheet ↔ PersonsController` cycles.

Next session exact actions (P5):
1. `PettyCashEntryValidator.ts`, delegating domain rules to `PettyCashEntry.consistencyErrors()`
2. `PettyCashReconciler.ts` — derive dispatch state by comparing the two tabs
3. `PettyCashEntryController.ts` with `withAuth()`; postal register first, petty-cash row second
4. `PettyCashRouter.ts` and registration in `src/index.ts`
5. `.env.example`: `PETTY_CASH_SPREADSHEET_ID`, `POSTAL_REGISTER_SPREADSHEET_ID`,
   `PETTY_CASH_SHEETS_DRY_RUN`

Checkpoint status: P4 CLOSED, P5 OPEN.

### 2026-08-12 — Session 8, P5 and P6: wiring and the screen

Scope: finish the module — HTTP surface, reconciliation, and the entry form.

**P5, backend.**
- `PettyCashEntryValidator.ts` — DTO shape and access only. Domain rules stay in
  `PettyCashEntry.consistencyErrors()` and the validator calls them rather than restating them.
- `sheets/PettyCashReconciler.ts` — derives dispatch state by comparing the two tabs: register
  blocks against petty-cash rows that look postal (Poczta invoice-number format `F\d{5}G\d{12}P`, or
  a description starting with `poczta`). Also rebuilds a complete entry from a register block, so
  finishing a half-written dispatch needs nothing remembered from the failed attempt.
- `PettyCashEntryController.ts` — register first, petty-cash row second. Deliberately does **not**
  extend `BaseController`: that class requires a repository, and this module has no database. There
  is likewise no transaction to own, because Google offers none across files — the reconciler is what
  replaces it.
- `PettyCashRouter.ts` — `POST /pettyCash/entries`, `GET /pettyCash/reconcile`,
  `POST /pettyCash/reconcile/:invoiceNumber`, plus `GET /pettyCash/access` for menu gating. One
  `app.use` gate before the routes, so a route added later is closed by default.
- `Setup.PettyCash`, `.env.example`, router registered in `src/index.ts`.
- 40 new tests; 101 in the backend module.

Corrected during the session: the backend gate initially allowed `ENVI_COOPERATOR`, which is not in
the frontend's `STAFF_ROLES`. Left as it was, the menu would have shown a link that answered 403.
Both sides now list the same three roles.

**P6, frontend.**
- `pettyCashApi.ts`, `recentValues.ts` (+8 tests), `PostalDispatchSection.tsx`,
  `PettyCashEntryPage.tsx`; probe page and its route removed; route `/pettyCash` under
  `STAFF_ROLES`; menu entry "Zaliczki".
- Phone-first as decided: one column, item **cards** rather than a five-column table,
  `inputMode="decimal"` on amounts, recent payers/addressees/amounts offered as one-tap choices from
  `localStorage`, payer and description prefilled from last use.
- Two fields removed rather than designed: net is derived from gross for postal entries (VAT-exempt,
  so they are equal), and the inflow amount is computed for card payments instead of asked. On a
  phone the cheapest field is the one that is not there.
- Deviation from the repo default, deliberate: no `react-hook-form`. The only non-trivial rule is the
  live sum check, and the authoritative validation runs on the backend against the domain model.
  Reaching for a form library here would add code, not remove it.
- 32 frontend tests pass; `npx tsc --noEmit` clean; screenshots captured at 375 px and 1200 px.

Fixed after looking at the phone screenshot: the description was not prefilled on first load, because
the default was only applied when the kind was *changed*. The first entry of the day would have
needed it typed for nothing.

Evidence: 101 backend tests, 32 frontend tests, both typechecks clean, `yarn check:cycles` unchanged,
webpack compiled the app, screenshots in `tmp/ui-browser-loop/pettycash-phone.png` and
`pettycash-desktop.png`.

Not verified, and not verifiable from here: the form has never submitted against a running backend.
Both writers were proven live in P2 and P4, and the controller only sequences them, but the round
trip browser → API → sheets has not been exercised. That happens in P7.

Checkpoint status: P5 CLOSED, P6 CLOSED, P7 OPEN.

### 2026-08-12 — Session 9, wiring verified against the copies

Owner set two things: `.env.development` points at the development copies with
`PETTY_CASH_SHEETS_DRY_RUN=true`, and **the identity question is closed** — everything is written by
`oramwp@gmail.com` and attribution in version history is not wanted. P7 step 2 loses that decision;
row ownership is carried by the marker columns, not by the author.

Verified end to end in dry-run against the copies, from a DTO in exactly the shape the form builds:
- postal entry with two letters → register block 82 at row 436, petty-cash row 199
- card invoice → petty-cash row 199, no register write
- postal entry whose letters do not sum to the invoice → rejected by the validator with the
  difference named
- routes mount and are closed without a session: all three answer 401

Two defects found and fixed by running against real data rather than fixtures:

1. **The reconciler reported `fry elektroniczne` as an unfinished dispatch.** Those blocks carry an
   e-mail instead of a tracking number and cost nothing, so they can never have a petty-cash row.
   Left in, the reconcile screen would have shown a permanent bogus item — and a screen that always
   shows something wrong is a screen people stop reading, which destroys the thing it exists for.
   Blocks with a zero total are now excluded, with a test.
2. **`GET /pettyCash/access` was dead code.** It was added by analogy with cost invoices, where
   access depends on a `StaffMembers` flag the client cannot see. Here the gate is purely role-based
   and the front already has the role in session, so the endpoint asked the server something it
   already knew. Removed.

**A real gap in the records, found on the first run over live data.** Reconciliation of 2026:
75 dispatches, 74 complete, one flagged `CASH_ONLY` — invoice `F00043G012600999273P`, a postal
expense of `10,30` entered in petty cash on 2026-01-20 by `got. ADu`, with **no block in the letters
register**. Searched both the 2026 and 2025 register tabs: zero occurrences. This is not a tool
artifact; it is a letter that was paid for and never registered. Reported to the owner.

Evidence: 102 tests pass, `npx tsc --noEmit` clean, backend starts with no errors and the three
routes answer 401 without a session.

Checkpoint status: unchanged — P7 is the only step left and it needs live spreadsheet ids plus a
deliberate `PETTY_CASH_SHEETS_DRY_RUN=false`.

### 2026-08-13 — Session 10, defects from the owner's own testing

The owner turned dry-run off and used the form for real against the copies. That found more in an
hour than every test written so far. Everything below came from his list.

**Fixed:**

1. **The payment method never reached the sheet.** The form asked "czym zapłacono" separately and
   sent only the payer name, so rows landed as `Michał` where every hand-typed row says
   `got. Michał` or `karta Krzysiek`. The method was used internally to pick the inflow column and
   was invisible in the sheet. Robot rows were therefore distinguishable at a glance — the exact
   opposite of the stated goal. `PettyCashEntry.sheetPayerLabel` now joins them, strips a prefix the
   user typed himself, and corrects one that contradicts the chosen method.
2. **The `auto:` marker was visible.** The plan said "hidden column"; the code never hid it. Both
   writers now carry an idempotent `updateDimensionProperties` that hides the marker column, so it
   also returns to hidden if somebody unhides it. Verified live: both columns report
   `hiddenByUser: true`.
3. **The register ran out of room.** Only 21 free rows stood between the last block and the e-mail
   address book; four test dispatches consumed 19 of them and the guard then blocked all further
   work. Per the owner's decision the writer now **inserts** the rows it needs, pushing the address
   book down. Verified live: the address book moved from row 457 to 461 and back after cleanup.
   The occupancy guard is gone — inserted rows are empty by construction.
4. **`setPhotoOptions failed` when closing the scanner.** `controls.stop()` alone leaves the library
   applying settings to a track that is already closing, and Chromium rejects it as an unhandled
   error. Teardown is now explicit and stepwise: decoder, then each track, then detach the video.
5. **The form did not look like the sheet.** New `SheetPreview` renders, under the form and updating
   live, the exact row that will land in petty cash and the exact block that will land in the
   register — in the sheets' own column order, including what the system fills in by itself: the
   expense, the inflow column, the sum and the payer with the method attached.
6. **No reconcile screen.** `PettyCashReconcilePage` at `/pettyCash/reconcile`, reachable from the
   entry form. Lists dispatches needing attention and completes a `REGISTER_ONLY` one with a button.
   `CASH_ONLY` is deliberately not actionable — a petty-cash row does not know who the letters went
   to or what was in them, so it cannot be rebuilt.

**Added on request:**

7. **Tracking link in the letter-number column.** The cell becomes
   `=HYPERLINK(url;"(00)…")` and still displays the same text, so the block does not change
   appearance. The URL comes from `POSTAL_TRACKING_URL_TEMPLATE` with `{number}` replaced by the
   20-character form the Poczta search expects (`00` + 18 digits, no brackets). Empty template =
   plain text as before. **The exact URL is unconfirmed** — the tracking site does not document its
   query parameter — hence env rather than a constant. `PostalRegisterWriter.readTrackingCell`
   unwraps the formula when reading a block back, otherwise the reconciler would have parsed digits
   out of the URL.
8. **Payer defaults to the logged-in user's first name**, editable, with the last used value taking
   precedence because people do enter on someone else's behalf.

**Rejected by the owner, recorded so it is not reopened by accident:** addressee from the entities
register, and composing contents from letters in the system. Both stay typed.

**My own mistake during this session, and what it cost.** I set `PETTY_CASH_SHEETS_DRY_RUN=true`
before restarting the backend, yet a live write still happened. Cause: `yarn kill` stops the process
holding port 3000 but not the `nodemon` supervisor, which respawns it. Four supervisors had
accumulated across my restarts, and one of them still held the old `false`. A test block and a petty
cash row were written to the copies and then removed; both files are back to their prior state, with
the August aggregate at `1 027,23`. Lesson for the runbook: verify the supervisor, not the port.

That accidental write did confirm three fixes against the live sheets: the payer label lands as
`got. Michal`, both marker columns are hidden, and inserting rows pushed the address book down
without touching it.

`PETTY_CASH_SHEETS_DRY_RUN` currently stands at `true`. The owner had set it to `false`; it is left
on deliberately after the above, and flipping it back is one line.

Verified this session: HTTP round trip with a session cookie — `POST /pettyCash/entries` with the
exact payload the form builds returns 201 with both target rows, and a mismatched sum returns 400
with the difference named. `GET /pettyCash/reconcile` returns real data over HTTP.

**Tabela stała się drugą powierzchnią edycji** (na życzenie właściciela, ten sam dzień).
Podgląd pod formularzem nie jest już tylko do oglądania: białe komórki edytuje się wprost,
a formularz i tabela czytają oraz zapisują ten sam stan, więc nie ma dwóch kopii danych do
synchronizowania. Szare komórki zostają zablokowane i po najechaniu mówią dlaczego — liczy je
arkusz formułą (wydatek, suma, kolumna wpływu przy karcie), nadaje arkusz (numer bloku),
albo składają się z kilku pól („kto zapłacił” = sposób płatności + osoba). Wyjątek: przy
wypłacie zaliczki kolumna wpływu staje się polem do wpisania, bo tam jest daną wejściową.

Formularz zostaje wąski (640 px, bo powstaje na telefonie), a tabela dostaje pełną szerokość
strony — na komputerze to ona jest powierzchnią roboczą.

### 2026-08-13 — Session 11, uwagi po drugim przejrzeniu ekranu

Wszystko z listy właściciela, wszystko zrobione:

1. **Walidacja jak w reszcie aplikacji.** Formularz przepisany na `react-hook-form` + `yupResolver`
   (`PettyCashValidationSchema.ts`), komunikat pod polem, przycisk zablokowany dopóki formularz nie
   jest poprawny. Poprzednie rozwiązanie — jeden komunikat pod przyciskiem — było świadomym
   odstępstwem od konwencji repo i właściciel je cofnął. Schemat odbija reguły modelu domenowego,
   łącznie ze zgodnością sumy listów z kwotą faktury. 14 nowych testów.
2. **Zawijanie i szerokości kolumn.** „OPIS”, „co wysłano” i „uwaga” zawijają się w komórce
   (textarea rosnąca do sześciu wierszy) zamiast ucinać treść. Kolumna numeru nadania poszerzona do
   190 px, bo ucięta ostatnia cyfra wygląda jak poprawny numer; data i kwota zwężone, bo więcej nie
   potrzebują. Szerokości w `CASH_WIDTHS` i `REGISTER_WIDTHS`, tabela `table-layout: fixed`.
3. **Wyrównanie.** Formularz i tabela stoją na wspólnej osi (oba wyśrodkowane w kontenerze 1180 px,
   formularz w kolumnie 640 px). Wcześniej formularz był dosunięty do lewej krawędzi wyśrodkowanej
   tabeli.
4. **Linki do arkuszy** na górze zakładki, z nowego `GET /pettyCash/links`. Adresy budowane
   z identyfikatorów w env, więc w dev prowadzą do kopii, a na produkcji do plików żywych — bez
   zaszywania czegokolwiek we froncie.

Odpowiedzi na pytania właściciela zapisane, żeby nie zginęły:

- **Rozpoznawanie faktur i paragonów nie zostało porzucone.** Odrzucone było wyłącznie łączenie
  z KSeF. Rozpoznawanie paragonów spoza KSeF stoi w `plan.md` §5 jako jedyny zaplanowany ciąg dalszy:
  skan albo zdjęcie, tekst z `tesseract`, tekst (nigdy obraz) do modelu, wypełnienie formularza
  z oceną pewności pola, z bramką która nie woła modelu, gdy w tekście brakuje kotwic. Odłożone
  celowo, żeby najpierw działała ścieżka zapisu — teraz formularz istnieje, więc jest co wypełniać.
- **„Zgodność arkuszy”** czyta obie zakładki i pokazuje wysyłki, przy których czegoś brakuje: blok
  w rejestrze bez wiersza w zaliczkach (można dopisać przyciskiem) albo wiersz bez bloku (tylko do
  wiadomości — z wiersza nie da się odtworzyć, do kogo poszły listy).

### 2026-08-13 — Session 12, usuniecie uzgadniania i przeglad kodu

Na zyczenie wlasciciela usuniete w calosci: `PettyCashReconciler.ts` z testem,
`PettyCashReconcilePage.tsx`, trasy `GET/POST /pettyCash/reconcile`, metody kontrolera
`reconcile` i `completeFromRegister`, klient API i typ `DispatchSyncState`.

Skutek do zapamietania: gdy blok w rejestrze powstanie, a wiersz w zaliczkach nie, nikt
tego juz nie wykryje automatycznie. Komunikat bledu mowi wprost, ktory blok i wiersz
powstal, i prosi o dopisanie recznie — to jedyne, co po tej zmianie zostaje.

Przeglad kodu (skill `ponytail`) znalazl cztery rzeczy:

1. **`PettyCashWriter.buildRangeExpansion` byl martwy** — napisany i otestowany, ale
   `plan()` nigdy go nie wolal; pelny miesiac konczyl sie odmowa zapisu. Najgorszy stan:
   martwy kod z testem dajacym falszywe poczucie pokrycia. Podpiety zamiast skasowany, bo
   usuwa realna awarie: gdy w miesiacu nie ma wolnego wiersza, writer wstawia go wewnatrz
   zakresu sumy.
2. **`isRobotMarker` w obu modelach** — nigdy nie uzyte. Powstalo pod regule „nie ruszaj
   wiersza czlowieka”, ale nic nie edytuje istniejacych wierszy, wiec nie ma czego chronic.
   Znacznik sluzy wylacznie jednokrotnosci; komentarz poprawiony, funkcje usuniete.
3. **`WALLET_LABEL`** — stala nigdy nie uzyta; blok miesiaca poznajemy po formule sumy.
4. **Trzy kopie tej samej funkcji do kwot** we froncie (`parseAmount`, `toNumber`,
   `toAmount`) — zostal jeden `toAmount` (NaN dla nie-liczby, potrzebne walidacji) i cienki
   `toNumber` (zero, wygodniejsze dla podgladu). Przy okazji znikl pasek sumy w sekcji
   listow: te sama sume pokazuje wiersz sumy w podgladzie, a niezgodnosc zglasza walidacja
   pod polem — trzy miejsca liczyly to samo.

Dodane w tej samej sesji: linki do obu arkuszy jako przyciski (`GET /pettyCash/links`,
adresy z env, wiec w dev prowadza do kopii) oraz skrot osoby w zapisie arkuszowym —
pierwsza litera imienia i trzy pierwsze nazwiska, wielkimi (`Anna Dorosinska` → `ADOR`).

Testy: 50 w dotknietych plikach backendu, 68 we froncie, oba typechecki czyste.

**Menu „Biuro”.** Na zyczenie wlasciciela zaliczki przestaly byc pozycja najwyzszego poziomu.
Powstalo rozwijane menu „Biuro” z „Kilometrowka” (przeniesiona z „Kontraktow”) i „Zaliczki”.
Kazda pozycja zostaje za swoja bramka uprawnien, a samo menu pokazuje sie tylko wtedy, gdy
zostaje w nim cokolwiek — inaczej uzytkownik bez zadnego z dwoch uprawnien widzialby pusty
przycisk. Sprawdzone po rozwinieciu w przegladarce: dokladnie dwie pozycje, `#/mileage`
i `#/pettyCash`, po jednym wystapieniu kazdej w calym navbarze.

**Sprostowany komentarz w `.env.development`.** Nad `PETTY_CASH_SHEETS_DRY_RUN=false` stalo
„Zapis wylaczony”, co jest odwrotnoscia stanu faktycznego — `false` znaczy, ze wiersze naprawde
leca do arkuszy (bezpiecznie tylko dlatego, ze identyfikatory wskazuja kopie). Ten rozjazd
wspoltworzyl wpadke z sesji 10; opis mowi teraz, co wartosc robi.

Przy okazji sprzatniete trzy osierocone instancje backendu (`ts-node` bez zywego nadzorcy),
dzialajace rownolegle z ta wlasciwa. To dokladnie ta narosl, ktora w sesji 10 doprowadzila do
niechcianego zapisu.

### 2026-08-13 — Session 14, usuniecie trybu probnego

Na zyczenie wlasciciela `PETTY_CASH_SHEETS_DRY_RUN` znika w calosci: `Setup.PettyCash.dryRun`,
parametr `dryRun` w obu writerach, pole w `CommitResult`, rozroznienie 200/201 w routerze, wpis
w `.env.example` i `.env.development`, typ `dryRun` w kliencie API oraz niebieski komunikat
„Tryb probny" w formularzu. Przy okazji zniknely aliasy `WriteOutcome` i `RegisterOutcome` —
istnialy wylacznie po to, zeby doklejic do planu pole `dryRun`, wiec bez niego byly juz tylko
drugim imieniem dla `WritePlan` i `RegisterPlan`.

Skutek do zapamietania, bo zmienia procedure P7: **jedynym zabezpieczeniem przed zapisem
w niewlasciwy plik zostaja dwa identyfikatory w env.** Wczesniej mozna bylo wycelowac w pliki
zywe i patrzec, co by sie stalo; teraz wycelowanie w pliki zywe **jest** przelaczeniem. Ta
zdolnosc nie ginie calkiem: `yarn pettycash:inspect` czyta dowolny arkusz bez zapisu i pokazuje
dokladnie te strukture, na ktorej opieraja sie writery, wiec proba na zywym pliku przenosi sie
z writera do inspektora. Kroki P7 przestawione tak, zeby inspekcja szla przed zmiana env.

Warto odnotowac, ze flaga nie byla neutralna: jedyny niechciany zapis w calym module (sesja 10)
poszedl **z wlaczona** flaga w pliku, bo wartosc trzymal przedawniony nadzorca `nodemon`.
Przelacznik, ktory mowi „nie zapisuje", a czasem zapisuje, jest gorszy niz jego brak — teraz
odpowiedz na pytanie „czy to pojdzie do arkusza" brzmi zawsze tak samo.

Testy: 99 backendu (5 suit), 68 frontu (6 plikow), oba typechecki czyste. Zadnego testu nie
trzeba bylo poprawiac — zaden nie dotykal flagi, co samo w sobie mowi, ile ona wnosila.

### 2026-08-14 — Session 15, odblokowanie wdrozen

Nie dotyczy samego modulu, ale blokowalo jego wdrozenie. Release phase na Heroku
(`migrate.js verify`) konczyl sie `ECONNRESET` przy nawiazywaniu polaczenia; trzy wdrozenia
z rzedu odrzucone. Po odrzuceniu czterech hipotez (modul zaliczek, liczba migracji,
uprawnienia MySQL, blokada po adresie) zostala jedna, potwierdzona pomiarem: **zestawienie
nowego polaczenia z baza zawodzi losowo, w ponad polowie prob**. Rozstrzygajacy dowod: z tego
samego adresu, w odstepie dwoch sekund, jedna proba dostala reset, a druga przeszla.

Aplikacja tego nie odczuwa, bo trzyma pule polaczen. Dyno wydania mialo jedno podejscie bez
ponowienia, wiec wdrozenie bylo rzutem moneta.

Zmiana: `connectWithRetry` w `src/scripts/migrate.ts` (osiem prob, przerwa rosnaca, ponawiane
tylko bledy gniazda). Potwierdzone na produkcji - pierwsze wdrozenie po zmianie pokazalo dwie
nieudane proby i sukces w trzeciej, calosc w 2,06 s.

**Skutek dla P7:** wydanie zostalo promowane, wiec backend modulu zaliczek **jest juz na
produkcji**, razem ze zmienna `PETTY_CASH_SPREADSHEET_ID` ustawiona 13.08. Poniewaz tryb
probny zostal usuniety w sesji 14, zapis jest od tej chwili rzeczywisty i kieruje sie
wylacznie tym, na co wskazuja identyfikatory w konfiguracji Heroku. Do zweryfikowania przez
wlasciciela, zanim ktokolwiek uzyje formularza.

Checkpoint status: P7 still open.
