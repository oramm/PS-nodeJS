# Petty cash entries with postal register extension — implementation plan

Primary deliverable: a petty-cash entry (`zaliczka` / `wydatek`) of **any** kind is created in the
app and written as one row into the petty-cash spreadsheet, preserving the formatting of manually
entered rows.

Postal dispatch is one **kind** of that entry. Selecting it unlocks an additional step that also
writes a block of letters into the postal register spreadsheet.

Status: planning pack created 2026-08-12; restructured the same day after owner correction (the
entry is the aggregate, postal is a feature of it). **P0 completed 2026-08-12** — sections 2.4 and
2.5 now carry values read from the live structure, not guesses. Execution of P1 onward requires
owner approval per root `CLAUDE.md`.

---

## 1. Mandatory context for every execution session

Read before touching code:

- `AGENTS.md` — repo hygiene, `yarn` only, mandatory updates for DB/env changes
- `CLAUDE.md` — layer flow, deprecated patterns, env rules
- `documentation/team/architecture/clean-architecture.md` — layer rules (hard requirement)
- `documentation/team/architecture/testing-per-layer.md` — what to mock at which layer
- `documentation/team/operations/db-changes.md` — migration workflow
- `documentation/team/operations/post-change-checklist.md` — mandatory entry after DB/env change
- `.github/instructions/architektura.instructions.md` — target vs legacy enforcement
- `.github/instructions/srodowiska.instructions.md` — `loadEnv()` rule, `.env.example` rule
- `.github/instructions/client-guidelines.instructions.md` — frontend work only

### Path corrections (docs are stale)

| Repo | Documented | Actual |
|---|---|---|
| backend | `C:\Apache24\htdocs\PS-nodeJS` | `D:\GitHub\PS-nodeJS` |
| frontend | `C:\Apache24\htdocs\ENVI.ProjectSite` | `C:\xampp\htdocs\envi\ENVI.ProjectSite` |

Fixing those docs is out of scope here; do not rely on the documented paths.

### Running tests on a new test file

`yarn test` on a **newly added** test file dies with `JavaScript heap out of memory` on this machine —
ts-jest has to build the TS program from scratch and the default 2 GB heap is not enough. Existing
suites pass because they are cached. Until the jest config is fixed, run new suites as:

```
node --max-old-space-size=6144 node_modules/jest/bin/jest.js src/pettyCash --runInBand
```

This is an environment limitation, not a symptom of the code under test. Verified P1: a test file
with no imports at all reproduces it, in any directory.

---

## 2. Business context

### 2.1 The aggregate

A petty-cash entry is one row in the petty-cash spreadsheet. It always carries: date, description,
amounts, settlement method and payer. Depending on its kind it fills different amount columns and
may own a detail record.

The spreadsheet is a wallet and company-card reconciliation, not a ledger. That is why the
settlement method drives which columns are filled.

### 2.2 Entry kinds

| Kind | Example | Amount columns used | Detail record |
|---|---|---|---|
| `POSTAL` | `poczta - listy` | net = gross (VAT-exempt service) | postal register block |
| `INVOICE` | `paliwo do FORD OP8105L` | net ≠ gross, invoice number | none |
| `RECEIPT` | `zimowy płyn do spryskiwaczy` | net/gross, receipt number | none |
| `NO_DOCUMENT` | `p.Irena 12/2025`, `kelner obsługa` | `BEZ FV / PARAGON` column only | none |
| `ADVANCE` | `zaliczka` | inflow column only, expense `0,00` | none |

### 2.3 Settlement rule (drives wallet balance)

- `CASH` → inflow column empty, the expense reduces the wallet
- `CARD` → inflow column mirrors the expense, so the wallet balance is unaffected
- `ADVANCE` → inflow column = amount handed over, expense `0,00`

Confirmed in the live tab: `karta …` rows carry `=G<r>` in the inflow column; `got. …` rows leave it
empty. Breaking this silently corrupts `POZOSTAŁO W PORTFELU`. The validator enforces it.

### 2.4 Target sheet A — petty cash — CONFIRMED (P0, 2026-08-12)

Live spreadsheet id: supplied via env, never hardcoded. Owner-confirmed live id, referenced from the
register sheet header: `1mF4GmVdWwPTfuwLawFk261xGzAibw1_eRD1wKHROdII`.
Read-only development copy used for P0: `1ZF5aVskj4g7hcLGu_tDtIjbyoYBYl06HF3LtJf6ANLY`
("Kopia dokumentu Rozliczenie zaliczki ENVI 2026").

Current tab: **`zaliczki 2026`**, `sheetId` **166741251**, 1016 rows × 26 columns, 1 frozen row,
9 merges, **0 protected ranges**.

Tabs present: `zaliczki 2026`, `ZALICZKI 2025`, `ZALICZKI 2024`, `ZALICZKI 2023`, `ZALICZKI 2022`,
`zaliczki 2021`, `ZALICZKI 2020 ` (trailing space), `zaliczki 2019`, plus `Rozliczenie zaliczek` and
`Zaliczki do września 2011 arch.`.

**Tab resolution must be case-insensitive and whitespace-tolerant, matched on the year** — the live
titles mix casing and one carries a trailing space.

#### Column map

| Col | Header (row 1) | Content |
|---|---|---|
| A | `2026` | entry date, format `DATE yyyy-mm-dd` (19 legacy rows use `dd.mm.yyyy`) |
| B | `ZALICZKA, zapałata kartą (wpływ)` | `=G<r>` for `CARD`, amount for `ADVANCE`, empty for `CASH`. Format `#,##0.00` |
| C | `OPIS` | description |
| D | `NETTO` | literal, or `=E<r>/1,23` when 23% VAT is derived. Format `0.00` |
| E | `BRUTTO` | literal. Format `0.00` |
| F | `BEZ FV / PARAGON` | amount for `NO_DOCUMENT`. Format `0.00` |
| G | `wydatek` | **always** `=E<r>+F<r>`. Format `#,##0.00` |
| H | `saldo / Nr faktury` | document number |
| I | (no header) | payer and method, e.g. `got. Karolina`, `karta Krzysiek` |
| J | (no header) | free-text note |
| K–M | — | occasional ad-hoc notes (4, 3 and 1 cell in the whole tab) |
| **N–Z** | — | **entirely empty across the tab — N is the robot marker column** |

Payer labels mix given names (`Karolina`, `Krzysiek`, `Michał`) with initials (`ADOR`, `DKAF`,
`ABRO`, `KPyj`) and even `karta. Krzyś`. Treat as free text; do not normalise, do not derive from
the session user.

#### Month blocks and formulas

Each month opens with an aggregate row. Confirmed rows for 2026:

| Aggregate row | Month | Data range |
|---|---|---|
| 2 | `sty 2026` | 3–29 |
| 30 | `lut 2026` | 31–51 |
| 52 | `mar 2026` | 53–81 |
| 82 | `kwi 2026` | 83–105 |
| 106 | `maj 2026` | 107–137 |
| 138 | `cze 2026` | 139–165 |
| 166 | `lip 2026` | 167–187 |
| 188 | `sie 2026` | 189–228 |

September to December **do not exist yet** — the owner creates each month's aggregate row when the
month starts. The writer must never create one.

Aggregate row formulas, columns B, D, E, F, G: `=SUM(<col><first>:<col><last>)`.
Aggregate column H: `=B<r>-G<r>+<H of the previous aggregate row>`; January chains to the previous
year's tab, `=B2-G2+'ZALICZKI 2025'!H300`. Column I holds the label `POZOSTAŁO W PORTFELU`.

#### Insert strategy — write into a free slot, do not insert

Closed months are exactly full; the current month is pre-sized with spare rows. On 2026-08-12 the
August range is 189–228, filled through row 198, **first free row 199**, and rows 199–228 are already
formatted.

Primary path: **write values into the first free row inside the current month's range.** No
`insertDimension`, no row shifting, the SUM range already covers the row and the formatting is
already there.

Fallback, only when the range is full: `insertDimension` with `inheritFromBefore: true` at a position
**strictly inside** the range, never at its last row, so the SUM expands. Inserting at or past the
range end silently drops the row from the month total.

The writer emits formulas, not values, for columns B and G — a row of literals would look wrong and
break when someone later edits a neighbouring cell.

### 2.5 Target sheet B — postal register — CONFIRMED (P0, 2026-08-12)

Live spreadsheet id via env. Read-only development copy used for P0:
`12wijgpEnGa3cxSXYeEFzsDTc-wdp51xFlfNP5X4fmmk`
("Kopia dokumentu Zestawienie listów poczta 2026-2023").

Current tab: **`poczta wych. 2026`**, `sheetId` **155183121**, 1107 rows × 29 columns, 0 frozen rows,
203 merges, **0 protected ranges**.

Visible tabs: `poczta wych. 2026`, `Poczta wych. 2025`, `Poczta wych. 2024`, `Poczta wych. 2023`;
older years hidden. Same case-insensitive, whitespace-tolerant year matching as section 2.4.

Rows 2 and 3 hold helper links — to the live petty-cash spreadsheet and to the app. **Never touched.**

#### Block shape

| Row | A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|---|
| header | block number | Poczta invoice number, **B:D merged** | | | `nr listu` | `data ` | `kwota ` | |
| item | | item index | addressee | contents | tracking number `(00)7590077…` | date, **merged vertically across the block's items** | amount | |
| sum | | | | | | | `=SUM(G<first>:G<last>)` | payer, e.g. `got. Michał` |

The tracking number in column E is a GS1 SSCC: the `(00)` application identifier followed by
**18 digits**, the last of which is a mod-10 check digit. Verified against 22 real numbers spanning
2011–2026 — all 18 digits long, all passing the check. Stored form drops the `(00)`.

One separator row follows each block. The block number appears **only on the header row** — the
apparent repetition in a flattened export is an artifact of expanding merges.

Blocks 1–81 are continuous with no gaps. Block 81: header row 432, item row 433, sum row 434,
separator 435. Insert position for a new block = **last block's sum row + 2**.

#### The trap that bans `values.append`

Rows 436–456 are empty **and carry no formatting**. Rows 457–463 hold an unrelated address book of
e-mail contacts for electronic invoicing (`ZGK Jelcz Laskowice | faktury elektroniczne | …`).

`values.append` targets the row after the last non-empty row of the whole tab — row 464 — writing a
dispatch block into or below that address book. This is not a theoretical objection: it is what the
obvious API call does to this specific tab.

#### Format strategy — copy, do not inherit

Rows below the last block have no formatting, so `inheritFromBefore` inherits nothing useful. Use
`ToolsSheets.copyPasteRows` with `pasteType: 'PASTE_FORMAT'` from the previous block:
header row → new header row, one item row tiled across the N new item rows, sum row → new sum row.
Then apply the merges: B:D on the header row and column F vertically across the item rows.

#### Marker column

Columns **I–AC are entirely empty** across the tab. **I is the robot marker column.**

#### Pre-existing defect — do not replicate, do not fix

Block 2 (`fry elektroniczne`, row 12) has the sum `=SUM(G12)`, pointing at its own header row rather
than the item row. Harmless there because the amount is the text `-`. Out of scope.

#### Coupling with petty cash

Register block 1 sums to `39,70` under invoice `F00005G012600999273P`; the petty-cash tab carries
exactly that pair on `2026-01-07` (row 4). The Poczta invoice number is known at dispatch time
(owner-confirmed 2026-08-12), so a `POSTAL` entry is always complete at creation.

---

## 3. Locked decisions

| Topic | Decision | Rationale |
|---|---|---|
| Module path | `src/pettyCash/`, postal detail under `src/pettyCash/postal/` | the entry is the aggregate, postal is a feature |
| Aggregate | `PettyCashEntry` with `EntryKind` discriminator | one write path for every kind |
| Detail | `PostalDispatch` + `PostalDispatchItem`, owned by the entry | only `POSTAL` has it |
| **Persistence** | **none — the module has no tables and no repositories** | the spreadsheets are the source of truth; a DB copy would drift silently the first time somebody edits a row by hand, and nobody would notice |
| Duplicate detection | scan the target tab before writing: document number in column H (petty cash), invoice number in column B (register) | the sheet already holds the key; the tab is read anyway to find the insertion point |
| Row ownership | hidden marker column, `auto:<key>` | distinguishes robot rows from human rows without a database |
| In-flight state | derived by reconciling both tabs, never stored | also catches a human deleting or editing a row, which a stored state never would |
| Layering | Router → Validator → Controller → sheet writers → Model | `clean-architecture.md` flow with the Repository layer absent, because there is no database |
| Spreadsheet ids | env only, via `Setup.PettyCash` / `Setup.PostalRegister` | copies in dev, live in prod, no code change at cutover |
| Tab resolution | by year, case-insensitive and trimmed | live titles mix casing and one has a trailing space |
| Petty-cash write | into the first free row inside the current month's SUM range | rows are pre-formatted and already inside the range; no shifting at all |
| Petty-cash fallback | `insertDimension` + `inheritFromBefore`, strictly inside the range | only when the month range is full |
| Petty-cash month creation | never — the owner creates each aggregate row | Sept–Dec 2026 do not exist yet |
| Postal write | new block at last sum row + 2, then `copyPaste` `PASTE_FORMAT` from the previous block, then merges | rows below the last block carry no formatting to inherit |
| Postal block number | `max(col A) + 1` read from the tab | numbering restarts yearly, a DB counter would drift |
| Formulas | the robot writes `=G<r>`, `=E<r>+F<r>`, `=SUM(...)`, not literals | matches every manually entered row |
| Cell writing | `updateCells`, `fields: 'userEnteredValue'`, robot-owned columns only | never overwrite a note typed into a trailing column |
| Forbidden call | `values.append` | on the postal tab it writes into an unrelated address book at row 464 |
| Aggregate rows | never written, only read | month totals and `POZOSTAŁO W PORTFELU` are formulas |
| Marker column | petty cash `N`, postal `I` (both verified empty across the tab); rows without the marker are never edited or deleted | manual rows untouchable by construction |
| Protected ranges | none exist today; do not assume any, do not add without asking | both tabs report zero |
| Write order | postal register first, petty-cash row second | the postal write is the riskier operation; failing first leaves nothing written |
| Tracking number | 18-digit GS1 SSCC, stored without the `(00)` application identifier, **check digit validated** | a scanner returns `00` + 18 digits; a misread fails the mod-10 check instead of producing a plausible wrong number that nobody would spot |
| Barcode source | live camera in the browser, at the moment of entry | owner confirmed confirmations are not scanned today, so a scan-file pipeline would add a step instead of removing one |
| Barcode library | one browser library, `@zxing/browser` or `zbar-wasm`, chosen in P3 | decoding happens client-side; the server never sees an image |
| Manual fallback | the tracking-number field stays typeable | a dead camera must not block the work |
| OCR / AI | not used in stage 1 | tracking numbers come from the barcode; every other field is typed |
| Payer label | free text chosen by the user | live data mixes names and initials; normalising would rewrite history |
| Dry-run | **removed 2026-08-13 at the owner's request**; every write is real | the flag had shipped one accidental write of its own (a stale `nodemon` held the old value) and was never used deliberately after P6. The guard that remains is `PETTY_CASH_SPREADSHEET_ID` / `POSTAL_REGISTER_SPREADSHEET_ID` — dev points at copies, production at the live files |

---

## 4. Checkpoints

Each checkpoint is independently executable in one session. IDs are stable.

### P0 — Read live sheet structure and lock the column maps — DONE 2026-08-12

Delivered: `src/scripts/pettycash-inspect-sheets.ts` (read-only), the `pettycash:inspect` yarn
script, `tmp/pettycash-sheet-structure.json` and `tmp/pettycash-sheet-structure-deep.json`, and the
confirmed maps in sections 2.4 and 2.5.

### P1 — Domain model and consistency rules — DONE 2026-08-12

Originally specified as "database and domain model". The owner rejected the persistence layer:
the spreadsheets stay the single source of truth, so a table holding a copy of every entry would be
a second truth that drifts the first time somebody edits a row by hand. The checkpoint was rebuilt
without any database.

Delivered:
- `src/pettyCash/pettyCashTypes.ts` — `EntryKind`, `SettlementMethod`, and `DispatchSyncState`
  (the last one **derived from the sheets, never stored**)
- `src/pettyCash/PettyCashEntry.ts` — the aggregate as a pure domain object: expense derived as
  gross + no-document amount (mirroring the sheet formula `=E+F`), expected inflow derived from the
  settlement method, per-kind amount rules, content key and sheet marker
- `src/pettyCash/postal/PostalDispatch.ts` — items total and the check that it equals the invoice
  gross, duplicate tracking-number detection, block marker
- `src/pettyCash/postal/PostalDispatchItem.ts` — SSCC normalisation and GS1 check-digit validation
- 37 unit tests across two suites

Not delivered, deliberately: migration, repositories, `WriteState` column. Removed from the plan.

Evidence: `npx tsc --noEmit` clean; `node --max-old-space-size=6144 node_modules/jest/bin/jest.js
src/pettyCash --runInBand` → 37 passed; `yarn check:cycles` → the only cycles are the pre-existing
`ScrumSheet ↔ PersonsController` ones, none in `pettyCash`.

### P2 — Petty-cash sheet writer with dry-run — DONE 2026-08-12

> Superseded 2026-08-13: the dry-run switch was removed at the owner's request. `write()` now always
> sends. Everything else below still describes the shipped code.

Goal: any entry kind produces a correct row without disturbing existing rows. No postal yet.

Tasks:
1. `src/pettyCash/sheets/PettyCashWriter.ts`
   - `resolveTab(auth, year)` → `{ sheetTabName, sheetId }`, case-insensitive and trimmed
   - `resolveMonthBlock(auth, date)` → reads the aggregate rows, returns
     `{ aggregateRow, firstDataRow, lastDataRow }` parsed from the `=SUM(...)` formula, **not** from
     row positions
   - `findFreeRow(block)` → first row in the range with no content in A, C or G
   - `buildRequests(entry, rowNumber)` → a single `updateCells` limited to
     `fields: 'userEnteredValue'` on the columns that this kind owns, with formulas
     `=G<r>` (card), `=E<r>+F<r>` (always) and the marker in column `N`
   - `buildFallbackInsert(block)` → `insertDimension` with `inheritFromBefore: true` strictly inside
     the range, used only when `findFreeRow` returns nothing
   - `write(auth, entry)` returns the request payload without sending when dry-run is on
2. Refuse to write when the target month's aggregate row does not exist — the owner has not opened
   that month yet. Fail loudly, do not create it.
3. Idempotency: scan the marker column for the key before building; if present return
   `{ skipped: true }`
4. Tests assert the payload exactly for each of the five kinds: target row number, the `fields` mask,
   which columns are populated, the emitted formulas, and that no request targets an aggregate row
   or a row lacking the marker

Acceptance:
- dry-run issues zero API writes
- with dry-run off against the **development copy**, one row per kind lands in the first free row of
  the current month, the month aggregate still balances, and formatting is unchanged
- re-running the same entry changes nothing
- a date in a month with no aggregate row is rejected with a clear message

Evidence: `yarn test src/pettyCash`, before/after screenshots of the copy, logged payloads.

**Access prerequisite (resolved 2026-08-12).** The backend authenticates as `oramwp@gmail.com` (the
account behind `REFRESH_TOKEN`). The development copies are owned by `kotalamichal02@gmail.com` and
were initially shared read-only, so the first `batchUpdate` returned *The caller does not have
permission*. The owner granted edit rights and the live test then passed. The same grant will be
needed on the live files before P7.

**Result of the live test.** One row written per entry kind into `zaliczki 2026`, each verified
against the August aggregate and then removed:

| Entry kind | Wallet change | Expected | Result |
|---|---|---|---|
| invoice, card | 0,00 | 0,00 | pass |
| receipt, cash | −19,99 | −19,99 | pass |
| no document, cash | −500,00 | −500,00 | pass |
| advance | +2 000,00 | +2 000,00 | pass |
| postal, cash | −9,80 | −9,80 | pass |

The aggregate returned to `1 027,23` and row 199 to empty, so the copy is byte-identical to its
pre-test state. Re-running the same entry returned `skip`, confirming idempotency against a live tab.

### P3 — Live barcode scanning in the browser — DONE 2026-08-12

Repo: `C:\xampp\htdocs\envi\ENVI.ProjectSite`.

Delivered: `src/Erp/PettyCash/trackingNumber.ts` (SSCC normalisation, GS1 check digit, rejection
classification), `useBarcodeScanner.ts` (camera hook plus the pure `evaluateScan`),
`BarcodeScanPanel.tsx`, `BarcodeScanProbePage.tsx` at route `/pettyCash/scan-test`, and 23 tests.
Library: `@zxing/browser` + `@zxing/library`, restricted to Code 128.

`BarcodeDetector` was measured as absent in a current Chromium build, so the native fast path was
dropped rather than carried as a second code path.

Added beyond the original task list: an `unsupported-code` rejection for S10 codes
(`EE389519375PL` — Pocztex and parcels). Without it those scans reported "incomplete read, try
again" and a person would keep re-presenting a code that can never be accepted in stage 1.

**Hardware result (owner, 2026-08-12): the laptop webcam does not read the barcode; a phone does.**
The risk flagged since P3 was written is real, and it is a lens limitation, not a software one — a
fixed-focus webcam cannot resolve bars at this density. The decoder itself is proven: the same code
reads the same confirmation on a phone.

**Owner decision the same day: the phone becomes the working device for postal entries.** No USB
reader is being bought and no phone-to-laptop handoff will be built — the latter would need
somewhere to park numbers between devices, and this module deliberately has no database.

Consequence carried into P6: the entry form is designed for a 375 px screen, and reducing typing
becomes part of that checkpoint rather than a refinement, because typing is now the only friction
left in the flow.

Owner confirmed 2026-08-12 that confirmations are **not** scanned today, so a scan-file pipeline
would add a step rather than remove one. The barcode is read live from a camera at the moment of
entry, in the browser. No PDF, no upload, no server round-trip, no `pdftoppm`.

Tasks:
1. `yarn add @zxing/browser` (or `zbar-wasm`; pick in this checkpoint, carry only one)
2. `src/Erp/PettyCash/useBarcodeScanner.ts` — opens `getUserMedia` with `facingMode: 'environment'`,
   decodes continuously, emits each accepted code once
3. `src/Erp/PettyCash/BarcodeScanButton.tsx` — button opens a small live-preview panel; a decoded
   code appends a row and stays open for the next confirmation, so a stack of letters is scanned
   without reopening
4. Client-side guard mirroring the server rule: 18 digits after dropping `(00)`, GS1 mod-10 check
   digit. A code that fails is ignored with a visible hint, never appended
5. Duplicate guard: the same code scanned twice in one dispatch flashes a warning instead of adding
   a second row
6. Manual fallback: the tracking-number cell stays typeable, so a dead camera never blocks the work
7. Tests for the guard functions with the real numbers used in the backend suite

Acceptance:
- scanning four confirmations in sequence produces four rows without touching the keyboard
- a code from a different symbology, and a deliberately corrupted digit, are both refused
- the same confirmation scanned twice does not create two rows
- with the camera denied or absent, the number can still be typed and the form works

Evidence: `yarn test`, a short screen recording or screenshots of the scan panel in
`tmp/ui-browser-loop/`.

Notes:
- `getUserMedia` needs a secure context. Production is `https://ps.envi.com.pl`, dev is
  `localhost:9000` — both qualify, so there is no blocker.
- A laptop webcam is usually fixed-focus and struggles at the distance a dense GS1-128 needs. A
  phone works well. A USB barcode reader — roughly 150–250 zł, behaves as a keyboard — would work
  with no code change at all, because the field accepts typed input. Worth trying if the webcam
  frustrates; it is a purchase, not a rewrite.
- Server-side validation still runs on commit (`PostalDispatchItem.normalizeTrackingNumber`,
  delivered in P1). The browser check is for feedback speed, not trust.

### P4 — Postal register writer — DONE 2026-08-12

> Superseded 2026-08-13 on two points: the dry-run switch is gone (see P2), and the occupancy guard
> in task 2 was replaced in session 10 by inserting rows, which are empty by construction.

Goal: the `POSTAL` extension writes its block.

Tasks:
1. `src/pettyCash/postal/PostalRegisterWriter.ts`
   - `resolveTab(auth, year)` → `{ sheetTabName, sheetId }`
   - `findLastBlock(auth)` → scans column A for the highest numeric block number and its header row,
     then locates that block's sum row; returns `{ blockNumber, headerRow, sumRow }`
   - `insertRow = sumRow + 2`; the new block occupies `1 + N + 1` rows plus a separator
   - `buildRequests(dispatch)` → `updateCells` for values and formulas
     (`=SUM(G<first>:G<last>)` on the sum row, marker in column `I`), then `copyPaste` with
     `PASTE_FORMAT` from the previous block (header→header, one item row tiled over N rows,
     sum→sum), then `mergeCells` for B:D on the header and column F across the items
   - dry-run behaves as in P2
2. Guard: refuse to write if any target row already has content in columns A–H — this is what keeps
   the address book at rows 457+ safe
3. Idempotency by Poczta invoice number
4. Tests assert the payload, the target rows, the merge ranges, that the sum row equals the item
   total, and that the guard trips on an occupied row

Acceptance: dry-run issues zero writes; against the development copy a block lands directly below
the previous one with correct numbering and copied formatting; re-running changes nothing; a
simulated occupied target row aborts the write.

**Merge contract, measured on the live tab (P4).** A block carries exactly three merges and the
writer reproduces them:

| Merge | Span | When |
|---|---|---|
| column A | header row through sum row | always |
| B:D on the header row | one row | always — holds the Poczta invoice number |
| column F across the item rows | first to last item | only when the block has two or more letters |

Counts over the 2026 tab: 81 `B:D` merges for 81 blocks, 80 vertical `A` merges, 39 `F` merges.
Because `copyPaste` with `PASTE_FORMAT` may carry merges from the source rows, the request list
issues `unmergeCells` over the whole target block before applying its own three — the block shape is
then identical regardless of what the copy brought.

**Result of the live test.** Block 82 written at rows 436–439 of the development copy:
merges came out `A436:A439`, `B436:D436`, `F437:F438`; the date rendered as a real date; the sheet
computed the sum as `19,60`; the e-mail address book at rows 457+ was untouched; a re-run returned
`skip`. Cleanup (`unmergeCells` + reset `userEnteredFormat` + `clearValues`) left the tail of the
register byte-identical to its prior state.

Evidence: `node --max-old-space-size=6144 node_modules/jest/bin/jest.js src/pettyCash --runInBand`
→ 81 passed; console transcript of the live block written, verified and removed.

### P5 — Controller, validator, router — DONE 2026-08-12

Goal: HTTP surface with a resumable two-phase write for `POSTAL` and a single-phase write for the
rest.

Tasks:
1. `PettyCashEntryValidator.ts` — separate class handling DTO shape and access. Domain invariants
   are already in the model (`PettyCashEntry.consistencyErrors()`, delivered in P1); the validator
   calls them rather than restating the rules, so there is one place where they live.
2. `PettyCashReconciler.ts` — reads both tabs and returns, per Poczta invoice number, one of
   `NOT_WRITTEN`, `REGISTER_ONLY`, `CASH_ONLY`, `COMPLETE`. This replaces the stored write state:
   a block in the register with no matching document number in column H of the petty-cash tab is
   an unfinished dispatch, whoever or whatever left it that way.
3. `PettyCashEntryController.ts` — extends `BaseController`, uses `withAuth()`. Sequence for
   `POSTAL`: reconcile → register write → petty-cash write. Other kinds go straight to the
   petty-cash write. A failure surfaces to the caller; the next reconcile finds the half-written
   dispatch. No transaction to manage — there is no database.
4. `PettyCashRouter.ts`
   - `POST /pettyCash/entries` — create and commit
   - `GET /pettyCash/reconcile` — list inconsistencies between the two tabs
   - `POST /pettyCash/reconcile/:invoiceNumber` — finish a dispatch that is `REGISTER_ONLY`

   No upload endpoint: tracking numbers arrive already decoded from the browser (P3) and are
   re-validated server-side before anything is written.
4. Register with `require('./pettyCash/PettyCashRouter');` in `src/index.ts` alongside the existing
   router block
5. Add to `.env.example`: `PETTY_CASH_SPREADSHEET_ID`, `POSTAL_REGISTER_SPREADSHEET_ID`
   (`PETTY_CASH_SHEETS_DRY_RUN` was listed here too, and was removed on 2026-08-13)

Acceptance:
- a `POSTAL` entry whose item amounts do not sum to the gross is rejected with 400 naming the
  difference
- a `CARD` entry with an empty inflow amount is rejected
- a simulated petty-cash failure leaves the register block in place; `GET /pettyCash/reconcile`
  reports it as `REGISTER_ONLY` and the reconcile call finishes it without duplicating the block
- a register block whose petty-cash row was deleted by hand is also reported — proof that the state
  is derived from the sheets rather than remembered
- no deprecated patterns: no `addNew()`, no `getList()`, no `new Model(req.body)` in the router

Evidence: `yarn test src/pettyCash`, request/response logs for the failure and resume paths.

### P6 — Frontend entry form — DONE 2026-08-12

Repo: `C:\xampp\htdocs\envi\ENVI.ProjectSite`. Read
`.github/instructions/client-guidelines.instructions.md` and `instructions/AI_GUIDELINES.md` first.

Goal: one form for every entry kind; the postal step appears only when it is relevant.

**Phone first, by decision — not by preference.** The owner chose to make the phone the working
device (2026-08-12), because the laptop webcam cannot read the barcode and no reader is being
bought. Everything below assumes a 375 px screen held in one hand, with the desktop layout as the
wider case rather than the design target.

That choice puts all the remaining friction in typing. Reducing it is therefore part of this
checkpoint, not a nicety — every field that can be avoided is a field nobody types on a phone
keyboard while standing next to a stack of confirmations.

Tasks:
1. `src/Erp/PettyCash/PettyCashEntryPage.tsx` — kind selector first, then the fields that kind needs;
   amount columns shown or hidden per section 2.2; settlement method drives the inflow field per
   section 2.3
2. `src/Erp/PettyCash/PostalDispatchSection.tsx` — rendered only when kind is `POSTAL`. Hosts the
   scan panel from P3; each accepted code appends an item with the number already filled
3. **Items are stacked cards, never a table.** Five columns do not fit a phone; each letter gets its
   own block with the tracking number as a caption and three fields beneath it
4. A tracking-number field is read-only when scanned, editable when typed manually, and visually
   marked as such
5. Typing reducers, all local to the device, none requiring a backend or storage on the server:
   - amount offers the values used recently as one-tap choices; in practice postage is one of two
     tariffs, so this removes most amount typing
   - addressee offers recent addressees from `localStorage` as suggestions, still free text
   - payer and date default to the last used values
   - every amount field uses `inputMode="decimal"` so the numeric keypad opens
6. A live sum indicator stays red until the item amounts equal the invoice amount; `Zatwierdź` stays
   disabled until the entry is consistent and, for `POSTAL`, the sum matches
7. Route in `src/React/MainWindow/index.tsx` inside an appropriate `ProtectedRoute`, plus a
   `MainMenu.tsx` entry. Remove `/pettyCash/scan-test` and `BarcodeScanProbePage.tsx` in the same
   change — the probe has served its purpose
8. `react-hook-form` + `yup`, `RepositoryReact` for list state per repo rules

Acceptance:
- the whole flow is usable at 375 px wide with one thumb: scan four confirmations, fill them in,
  submit — without horizontal scrolling and without a pinch-zoom
- switching the kind shows and hides the right fields, and the postal section only for `POSTAL`
- scanning four confirmations produces four item blocks with numbers filled
- recent amounts and addressees appear as one-tap choices on the second entry
- the commit button stays disabled while the sum mismatches
- `yarn test` passes; screenshots captured at both 375 px and desktop width

Evidence: `yarn test`, screenshots in `tmp/ui-browser-loop/` at both widths.

### P7 — Live cutover under supervision

Goal: first real entries, owner watching.

Tasks:
1. Re-run `yarn pettycash:inspect` against the **live** ids and diff the structure against sections
   2.4 and 2.5 — the copies may have drifted from the originals. Do this **before** step 3: since
   dry-run was removed, the inspector is the only way to look at the live files without writing to
   them, and it is enough, because it reads exactly the structure the writers depend on.
2. Confirm `oramwp@gmail.com` has edit rights on both live files. **The identity question is
   closed** (owner, 2026-08-12): everything is written by that account and attribution in version
   history is not wanted. No separate robot account, no convention to agree. Row ownership is
   carried by the marker columns (`N` in petty cash, `I` in the register), not by the author.
3. Point env variables at the live spreadsheets. **This single edit is the cutover** — there is no
   second switch behind it. Restart the backend and verify the supervisor count, not just the port
   (session 10 lost that bet).
4. Record one `POSTAL` entry and one non-postal entry end to end
5. Verify by reading both sheets back through the API, not by trusting the response
6. Add `documentation/team/runbooks/petty-cash-sheets.md` covering the yearly new-tab step and the
   monthly aggregate-row step the owner performs by hand

Acceptance:
- the postal block sits directly below the previous one with correct numbering and copied formatting
- the petty-cash row sits in the current month's free slot, `POZOSTAŁO W PORTFELU` still balances
- no manually entered row changed — verified by diffing a pre-write snapshot of both tabs

Evidence: pre/post snapshots, Google version history entry, the runbook.

**Runbook content, collected 2026-08-13 when the owner asked what breaks if he edits the sheets by
hand.** The module never edits or deletes an existing row — it writes only into empty rows or rows it
inserted itself, so manual entries are safe by construction. Three things are not obvious, and all
three fail quietly:

1. **The marker column is hidden** (`N` in petty cash, `I` in the register). Clearing a robot row by
   selecting the *visible* columns leaves the marker behind. The row then looks empty but is not: it
   is never reused, and that exact entry can never be added again, because the marker is the
   idempotency key. Delete the whole row instead of clearing cells.
2. **A hand-made register block with a literal total stops the writer.** The insertion point is found
   by taking the highest block number in column A and looking for `=SUM(` below it. A total typed as
   a plain number means no sum row is found, `findLastBlock` returns null, and every later dispatch is
   refused with "nie znaleziono zadnego kompletnego bloku". A block with no number in column A is
   milder: the new block is inserted above it — wrong order, no data loss.
3. **The idempotency key is a content hash** over kind, date, document number, amounts and
   description. Two entries identical in all of those on the same day collide, and the second is
   refused. In the live sheet descriptions always differ (`p.Irena 12/2025` vs `Krzysiek 12/2025`),
   so this is a footnote rather than a defect — but it is the reason the description is in the hash.

### P8 — Podpowiadanie kwot i numeru z paragonu/faktury — IN PROGRESS 2026-08-14

Zakres zawężony przez właściciela: **wypełniane są trzy pola** — kwota brutto, kwota netto
i numer dokumentu. Reszta wpisu zostaje ręczna, bo kliknięcie rodzaju czy opisu jest szybsze
niż sprawdzanie, czy model zgadł.

Decyzja właściciela (2026-08-14): **OCR po stronie serwera**, tesseract, spójnie z pismami.
Wariant „zdjęcie prosto do modelu rozpoznającego obrazy" został odrzucony — reguła „do AI
trafia tekst, nigdy obraz" zostaje w mocy także dla paragonów.

Zrobione:
1. `ToolsAI.extractTextFromFile` przyjmuje teraz **obrazy** (`ocrImageWithTesseract`). Wcześniej
   rzucał `Unsupported file type` na wszystkim poza PDF i DOCX, więc zdjęcie z telefonu — jedyne
   wejście, jakie ma paragon papierowy — nie przechodziło w ogóle. Sprzątanie katalogu
   tymczasowego wyciągnięte do `removeTempDir`, wspólne z gałęzią PDF.
2. `src/pettyCash/documents/ReceiptAnalyzer.ts` — bramka kotwic, wywołanie modelu, normalizacja.
3. `POST /pettyCash/documents/analyze` za tą samą bramką ról co reszta modułu.
4. Front: `DocumentScanPanel.tsx` (`capture="environment"` — telefon otwiera aparat, komputer
   degraduje się do wyboru pliku) i `applySuggestion` w formularzu.
5. 13 testów części rozstrzygających bez modelu: bramka kotwic, parsowanie kwot, normalizacja.

Decyzje warte zapamiętania:
- **Bramka kotwic przed wywołaniem modelu.** Tekst musi zawierać i słowo pieniężne, i coś
  wyglądającego na kwotę z groszami. Zdjęcie nie tego dokumentu albo OCR zwracający śmieci nie
  idą dalej — model i tak nie znajdzie kwoty, której nie ma, a zapłacilibyśmy za wypełnienie
  pola czymś prawdopodobnie wyglądającym.
- **Brak wartości zostaje brakiem.** Nigdzie nie podstawiamy zera ani nie liczymy netto
  z podatku. Puste pole rzuca się w oczy bardziej niż liczba wzięta z sufitu.
- **Netto wyższe od brutto jest odrzucane** — to znak, że model pomylił pola. Zostaje samo
  brutto, bo to ono decyduje o stanie portfela.
- **Nieudany odczyt to nie błąd HTTP.** Endpoint oddaje 200 z `recognized:false` i wyjaśnieniem;
  wpis dalej da się zrobić ręcznie, tak jak dotąd.

Środowisko: zakładałem, że tesseract nie istnieje na dynie Heroku, bo standardowy buildpack Node
go nie zawiera. **Właściciel twierdzi, że działa — pisma z niego korzystają.** Do rozstrzygnięcia
`which tesseract && tesseract --list-langs` w konsoli, bo dwie rzeczy mogą to mylić:
OCR w pismach odpala się dopiero poniżej 400 znaków wyciągniętego tekstu, a większość pism to
PDF-y z warstwą tekstową i tesseract nigdy nie jest wołany; do tego kod woła `-l pol+eng`, więc
brak słownika `pol` daje pusty wynik zamiast czytelnego błędu. Paragon ze zdjęcia nie ma warstwy
tekstowej, więc tam tesseract jest jedyną drogą.

Niesprawdzone: **skuteczność na prawdziwym paragonie.** Papier termiczny, zdjęcie pod kątem
i drobny druk to najtrudniejszy materiał dla tesseracta, a błędna cyfra w kwocie jest gorsza niż
jej brak. Potrzebne zdjęcie realnego paragonu do oceny, zanim ktokolwiek na tym polegnie.

---

## 5. Out of scope for stage 1

- recognition of any kind: no OCR, no AI. Every field except the tracking number is typed
- envelope purchases where net ≠ gross inside a postal entry (a separate `INVOICE` row today, often
  merged vertically with the postal row: see merges `A4:A5`, `H4:H5`, `I4:I5`)
- electronic dispatches (`fry elektroniczne`, e-mail in column E, amount `-`)
- the e-mail address book parked at rows 457+ of the postal tab
- creating month aggregate rows or new year tabs — both stay manual
- the archived tabs in either spreadsheet
- archiving the confirmations — nothing is stored, because nothing is scanned

### Explicitly rejected by the owner (2026-08-12)

- **Any link to the KSeF cost-invoice module.** An `INVOICE` entry is typed like every other kind and
  is not prefilled from the invoices already synced into the database. Do not reintroduce this.
- **Linking postal items to the `letters` module.** The contents description stays free text typed by
  the person making the entry; no letter-to-dispatch relation is created.

### The only planned follow-up

Receipt recognition for purchases outside KSeF (`paragony`): scan or photograph, extract text with
`tesseract`, send the **text** to the model — never the image — and prefill the form with a per-field
confidence, exactly as the letter analysis form already works. Gated: if the OCR text lacks the
anchors (`SUMA`, `PLN`, NIP, a parsable date) the model is not called at all and the form opens
empty, because an honest blank beats a confidently invented amount.

## 6. Risks

| Risk | Handling |
|---|---|
| `values.append` writes into the address book at row 464 | call banned; P4 guards on target-row emptiness |
| Row lands outside the month SUM range | range parsed from the `=SUM(...)` formula, never from row arithmetic; P2 asserts the target row |
| Writing into a month the owner has not opened | writer refuses and says so; it never creates an aggregate row |
| Two sheets, no cross-file transaction | reconciliation over both tabs (P5); no stored state to go stale |
| A manual row gets overwritten | marker column N/I; `updateCells` limited to owned columns; P7 diffs a snapshot |
| Wallet balance silently corrupted | settlement rule enforced by `PettyCashEntry.consistencyErrors()` (P1, tested); aggregate rows read-only |
| Tab not found because of casing | resolution is case-insensitive and trimmed; live titles already differ |
| Barcode decode returns a wrong number | 18-digit SSCC carries a GS1 mod-10 check digit; the normaliser verifies it, so a misread fails instead of yielding a plausible wrong number (P1, tested against 22 real numbers from the sheet) |
| Every operation now reads the sheets | accepted: at roughly 30 entries a month the extra reads are irrelevant, and the tab is read anyway to find the insertion point |
| Laptop webcam cannot resolve a dense GS1-128 | the field stays typeable, so the work never blocks; a phone or a ~150–250 zł USB reader fixes it without any code change. P3 must be tested on the machine that will actually be used, not only on a developer laptop |
| Development copies drift from the live sheets | P7 step 3 re-runs the inspector against the live ids before the first real write |
