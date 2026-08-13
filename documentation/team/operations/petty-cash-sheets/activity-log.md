# Petty cash entries with postal register extension — activity log

Short timestamped entries. One entry per working block.

---

## 2026-08-12 — planning (pre-P0)

Summary:
- Analysed both target spreadsheets: mapped the petty-cash month-block layout and the postal
  register block layout
- Identified five entry kinds and the settlement rule that keeps `POZOSTAŁO W PORTFELU` correct
- Established that a postal entry writes to two spreadsheets with no cross-file transaction, which
  drives the `WriteState` machine and the resume endpoint
- Chose scanned-PDF barcode decoding over camera capture
- Ruled OCR and AI out of stage 1 entirely
- Verified local toolchain: `tesseract 5.5.0` (`pol`, `eng`), `pdftoppm` poppler 26.02, no `zbarimg`

Restructure the same day, after owner correction:
- The aggregate is the petty-cash entry, not the postal dispatch
- Module renamed `postalDispatches` → `pettyCash`; postal detail under `src/pettyCash/postal/`
- Checkpoints resequenced so the generic writer precedes the postal extension
- Planning folder renamed `poczta-register-sync` → `petty-cash-sheets`

Files touched:
- `documentation/team/operations/petty-cash-sheets/plan.md` (new)
- `documentation/team/operations/petty-cash-sheets/progress.md` (new)
- `documentation/team/operations/petty-cash-sheets/activity-log.md` (new)

Impact type: Docs

Notes: no code, no database and no spreadsheet modified.

---

## 2026-08-12 — P0, sheet structure inspection

**Checkpoint:** P0 — CLOSED

Summary:
- Built a strictly read-only inspector (`spreadsheets.get` only; no `ToolsSheets` import, no DB) and
  ran an inventory pass plus two deep passes over the 2026 tabs of both development copies
- Petty cash: tab `zaliczki 2026`, `sheetId` 166741251, 1016×26, 1 frozen row, 9 merges, no protected
  ranges. Month aggregate rows at 2/30/52/82/106/138/166/188 (sty–sie); Sept–Dec not yet created
- Postal register: tab `poczta wych. 2026`, `sheetId` 155183121, 1107×29, 0 frozen rows, 203 merges,
  no protected ranges. Blocks 1–81 continuous, last sum row 434
- Resolved `POZOSTAŁO W PORTFELU` = `=B<r>-G<r>+<previous month H>`, January chaining to
  `'ZALICZKI 2025'!H300`; this explains the `443,98` gap noted before P0
- Discovered that the petty-cash month range is pre-sized with formatted free rows (August: range
  189–228, first free 199) — the writer can fill a slot instead of inserting a row
- Discovered an e-mail address book parked at rows 457–463 of the postal tab, below 21 unformatted
  empty rows. `values.append` would write a dispatch block into it. The ban on `values.append` is now
  backed by evidence rather than principle
- Established that the postal writer must copy formatting from the previous block, because rows below
  the last block carry none to inherit
- Verified marker columns are empty across both tabs: petty cash `N`, postal `I`
- Noted a pre-existing wrong sum in postal block 2 (`=SUM(G12)`); left untouched

Files touched:
- `src/scripts/pettycash-inspect-sheets.ts` (new, read-only)
- `package.json` (added `pettycash:inspect`)
- `.gitignore` (added `tmp/pettycash-sheet-structure*.json` — the dumps carry addressees, letter
  contents, invoice numbers, amounts and e-mail addresses and must not be committed)
- `documentation/team/operations/petty-cash-sheets/plan.md` (sections 2.4, 2.5, 3, 4, 5, 6 updated)
- `documentation/team/operations/petty-cash-sheets/progress.md` (session 1 appended)

Impact type: Docs

Notes:
- Zero write calls to either spreadsheet. Both are development copies, not the live files.
- No database change, no migration, nothing committed.
- The inspected files are copies; P7 now re-runs the inspector against the live ids and diffs before
  the first real write.

---

## 2026-08-12 — P1, domain model

**Checkpoint:** P1 — CLOSED

Summary:
- Built the persistence layer as originally planned (migration + three repositories), then removed
  it after the owner rejected keeping a copy of the sheet in a database. Field by field, almost
  nothing needed storage: amounts and descriptions duplicate the sheet, tracking numbers sit in
  column E, idempotency comes from the tab we read anyway, authorship comes from Google version
  history, and the write state is better derived by reconciling the two tabs — which additionally
  catches manual edits that a stored state would never notice.
- Kept the models as pure domain objects carrying what the sheet does not record: netto = brutto for
  postal services, card fills the inflow column and cash does not, the item total must equal the
  invoice amount, a tracking number must be a valid SSCC.
- **Corrected the tracking-number rule from 20 digits to 18.** The live values are GS1 SSCC:
  `(00)` plus 18 digits. The first implementation would have rejected every real scan. Added GS1
  mod-10 check-digit validation and verified it against 22 real numbers from the sheet spanning
  2011–2026 — all pass.
- Corrected a bad probe that reported core tables missing from the dev database; MariaDB on Windows
  stores table names lowercase (`lower_case_table_names = 1`) and the comparison was case-sensitive.
- Diagnosed a jest limitation on this machine: any newly added test file exhausts the default 2 GB
  heap during ts-jest program construction. Reproduced with an import-free test in two directories.
  Workaround recorded in the plan; the jest config deserves a separate fix.

Files touched:
- `src/pettyCash/pettyCashTypes.ts`, `PettyCashEntry.ts` (new)
- `src/pettyCash/postal/PostalDispatch.ts`, `PostalDispatchItem.ts` (new)
- `src/pettyCash/__tests__/PettyCashEntry.test.ts`,
  `src/pettyCash/postal/__tests__/PostalDispatchItem.test.ts` (new, 37 tests)
- created then deleted: `src/pettyCash/migrations/*`, three `*Repository.ts`
- `documentation/team/operations/petty-cash-sheets/plan.md`, `progress.md` (updated)

Impact type: Docs

Notes:
- No database was created, altered or connected to for writing. No spreadsheet touched. Nothing
  committed.
- `package.json` still carries the `pettycash:inspect` script from P0; `.gitignore` still excludes
  the P0 dumps.

---

## 2026-08-12 — scope corrections

**Checkpoint:** none (plan change between P1 and P2)

Summary:
- Owner confirmed confirmations are **not** scanned today. The P3 design was built on the opposite
  assumption, which was stated as a condition when the design was presented; with the assumption
  false, the scan-file pipeline would have added work. P3 rewritten as live camera scanning in the
  browser: no upload, no `pdftoppm`, no stored file, no scan endpoint. The typed fallback stays, so
  a failing camera never blocks entry.
- Owner rejected any link to the KSeF cost-invoice module and any linking of postal items to the
  `letters` module. Both recorded under "Explicitly rejected" in the plan, not as deferred items, so
  a later session does not reintroduce them as improvements.
- Remaining follow-up after stage 1 reduced to one thing: receipt recognition outside KSeF,
  text-only to the model, gated on OCR anchors.
- Added a risk: a fixed-focus laptop webcam may not resolve a dense GS1-128. Mitigation is the typed
  fallback plus, optionally, a phone or a USB reader that needs no code change.

Files touched:
- `src/pettyCash/postal/PostalDispatch.ts` — removed `scanFileUrl`
- `documentation/team/operations/petty-cash-sheets/plan.md` — P3 rewritten, P5 and P6 adjusted,
  locked decisions, out-of-scope and risks updated
- `documentation/team/operations/petty-cash-sheets/progress.md` — session 3 appended

Impact type: Docs

Notes: no spreadsheet, database or commit touched.

---

## 2026-08-12 — P2, petty-cash sheet writer

**Checkpoint:** P2 — code complete, live write blocked

Summary:
- Built the writer that places one entry row into the petty-cash tab. The decision path is a pure
  function over a snapshot of the tab read as formulas, so every rule is unit-testable without
  calling Google.
- Month ranges come from the `=SUM(B<f>:B<l>)` formula rather than row arithmetic; a row counts as
  free only when all of A–N are empty; formatting is copied from the nearest canonical data row
  because the empty rows of a month are formatted only in column B; dates are written as serial
  numbers so they stay real dates.
- Duplicate detection covers the robot's marker and a document number typed by hand in the same
  month.
- `ToolsSheets.getValues` gained an optional `valueRenderOption` — additive, no behaviour change for
  existing callers.
- Dry-run against the development copy reproduced the P0 findings exactly: eight month blocks, target
  row 199, format source row 197. It skipped row 198, an advance entry left without the expense
  formula — evidence that "nearest canonical row" is the right rule rather than "row above".
- 26 new tests, 63 in the module, all passing.

Blocked: the one live write failed with *The caller does not have permission*. The backend acts as
`oramwp@gmail.com`; the copies are owned by `kotalamichal02@gmail.com` and shared read-only.
Confirmed afterwards that nothing was written.

Files touched:
- `src/pettyCash/sheets/pettyCashSheetConfig.ts`, `PettyCashWriter.ts` (new)
- `src/pettyCash/sheets/__tests__/PettyCashWriter.test.ts` (new)
- `src/tools/ToolsSheets.ts` — optional `valueRenderOption` on `getValues`
- `documentation/team/operations/petty-cash-sheets/plan.md`, `progress.md` (updated)

Impact type: API

Notes:
- No spreadsheet was modified. Read-only calls only; the single write attempt was rejected by Google
  before any change.
- Temporary scripts used for the dry-run and the access check were deleted after use.

---

## 2026-08-12 — P2 live verification

**Checkpoint:** P2 — CLOSED

Summary:
- Owner granted edit rights on the development copy; the live half of P2 ran.
- Wrote one row per entry kind into `zaliczki 2026`, each time reading the August aggregate before
  and after, then removing the row and restoring its formatting from the untouched row below.
- All five wallet effects matched expectation: card 0,00 · receipt −19,99 · no-document −500,00 ·
  advance +2 000,00 · postal −9,80. The card case is the meaningful one — it proves the inflow
  mirror keeps `POZOSTAŁO W PORTFELU` intact.
- The date landed as a real date and both formulas evaluated in the sheet, so the row is
  indistinguishable from a hand-typed one.
- Re-running an entry returned `skip` against the live tab, confirming idempotency outside fixtures.
- Final state byte-identical to the baseline: aggregate back to `1 027,23`, row 199 empty.

Files touched: none in `src`. Plan and progress updated. Temporary test scripts deleted.

Impact type: Docs

Notes:
- Every write went to the development copy `1ZF5aVskj4g7hcLGu_tDtIjbyoYBYl06HF3LtJf6ANLY`, never to
  a live file, and every one was removed afterwards.

---

## 2026-08-12 — P3, browser barcode scanner

**Checkpoint:** P3 — CLOSED (frontend repo)

Summary:
- Measured that `BarcodeDetector` is absent in a current Chromium build, so the zero-dependency
  native path was dropped instead of being carried as a fallback that might silently do nothing.
  Single path: `@zxing/browser` + `@zxing/library`, limited to Code 128.
- The per-read decision lives in a pure `evaluateScan`, so suppression of repeated reads, duplicate
  detection and check-digit rejection are all tested without a camera.
- The scan panel stays open after a successful read, so a stack of confirmations goes through
  without clicking between them.
- A failing test exposed a real usability defect: a Pocztex S10 label was reported as an incomplete
  read, which would have had someone re-presenting a code that can never be accepted in stage 1.
  Added an `unsupported-code` rejection that says so plainly.
- Added `/pettyCash/scan-test`, a probe page with no menu entry, so the camera can be tried on real
  hardware before the real form exists. Its typed field also accepts a USB reader.

Files touched (frontend repo `C:\xampp\htdocs\envi\ENVI.ProjectSite`):
- `src/Erp/PettyCash/trackingNumber.ts` + `.test.ts` (new)
- `src/Erp/PettyCash/useBarcodeScanner.ts` + `.test.ts` (new)
- `src/Erp/PettyCash/BarcodeScanPanel.tsx`, `BarcodeScanProbePage.tsx` (new)
- `src/React/MainWindow/index.tsx` — one import and one route
- `package.json`, `yarn.lock` — two dependencies added

Impact type: UI

Notes:
- 23 tests pass, typecheck clean, webpack compiled the whole app.
- No spreadsheet, database or commit touched. The dev server was stopped after the screenshot.
- Whether the camera reads a real confirmation is still unverified and only the owner can settle it.

---

## 2026-08-12 — P3 hardware verdict

**Checkpoint:** P3 — verified on hardware

Summary:
- Owner tried the probe page: the laptop webcam does not read the barcode, a phone does. The decoder
  is therefore proven and the limitation is optical — a fixed-focus webcam cannot resolve bars at
  this density.
- Owner chose to make the phone the working device: no USB reader, no phone-to-laptop handoff. The
  handoff would have needed somewhere to park numbers between devices, and this module deliberately
  has no database.
- P6 rewritten as a phone-first screen: items as stacked cards rather than a five-column table,
  numeric keypads, and local typing reducers (recent amounts as one-tap choices, recent addressees
  from `localStorage`, payer and date defaulting to last used). With the phone as the working
  device, typing is the only friction left, so cutting it belongs in the checkpoint.

Files touched: plan and progress only.

Impact type: Docs

---

## 2026-08-12 — P4, postal register writer

**Checkpoint:** P4 — CLOSED

Summary:
- Measured two things that no text export preserves: the merge contract of a block (column A across
  the whole block, `B:D` on the header, column F across the items and only when there are two or
  more) and the cell types (the date is a real date; single-item blocks use `=SUM(G429)` without a
  range). Both are now reproduced exactly.
- Built the writer: tab resolution by year, last-block detection via the vertically merged column A,
  placement two rows below the previous sum row, format copied per row kind from the previous block,
  and an occupancy guard that refuses to write into any row with content in A–H.
- `copyPaste` can carry merges from its source, so the request list unmerges the target block before
  applying its own three. Block shape is deterministic regardless of what the copy brings.
- Header labels are copied character for character, trailing spaces included — a "corrected" label
  would make the robot's blocks visibly different from the human ones.
- Extracted `sheetDates.ts` so both writers share the serial-date helpers instead of the postal
  writer importing the petty-cash writer for a date conversion.
- Live test: block 82 written at rows 436–439 of the development copy, merges exactly as intended,
  sum computed by the sheet, the e-mail address book at rows 457+ untouched, re-run skipped, and
  cleanup restored the register byte-identical.

Files touched:
- `src/pettyCash/sheets/postalRegisterConfig.ts`, `PostalRegisterWriter.ts`, `sheetDates.ts` (new)
- `src/pettyCash/sheets/__tests__/PostalRegisterWriter.test.ts` (new, 18 tests)
- `src/pettyCash/sheets/PettyCashWriter.ts` — date helpers moved to the shared module
- plan and progress updated

Impact type: API

Notes:
- The only write went to the development copy `12wijgpEnGa3cxSXYeEFzsDTc-wdp51xFlfNP5X4fmmk` and was
  removed afterwards. No live file touched, nothing committed.
- Temporary scripts used for the merge probe, the type probe and the live test were deleted.

---

## 2026-08-12 — P5 and P6, wiring and the entry screen

**Checkpoint:** P5 — CLOSED, P6 — CLOSED

Summary:
- Backend: validator (DTO shape only, domain rules delegated to the model), reconciler (dispatch
  state derived by comparing the two tabs, plus rebuilding a complete entry from a register block),
  controller (register first, cash second), router with one gate in front of all routes, `Setup`
  block and `.env.example` keys.
- The controller deliberately does not extend `BaseController` — that class requires a repository and
  this module has no database. There is no transaction to own either, because Google has none across
  files; the reconciler is what takes its place.
- Frontend: API client, `localStorage` suggestions, dispatch section with item cards, and the entry
  page. Probe page removed, route `/pettyCash` added under `STAFF_ROLES`, menu entry "Zaliczki".
- Phone-first as decided: one column, cards instead of a five-column table, numeric keypads,
  recent payers/addressees/amounts as one-tap choices. Two fields were removed rather than laid out —
  net is derived from gross for postal entries, and the card inflow is computed — because on a phone
  the cheapest field is the one that is not there.
- Corrected: the backend gate allowed `ENVI_COOPERATOR`, which the frontend's `STAFF_ROLES` does not
  include, so the menu would have shown a link that answered 403. Both sides now agree.
- Corrected after reading the phone screenshot: the description was not prefilled on first load,
  only on a kind change, so the first entry of the day would have needed it typed for nothing.

Files touched — backend `D:\GitHub\PS-nodeJS`:
- `src/pettyCash/PettyCashEntryValidator.ts`, `PettyCashEntryController.ts`, `PettyCashRouter.ts`,
  `sheets/PettyCashReconciler.ts`, `sheets/sheetsAuth.ts` (new)
- `src/pettyCash/__tests__/PettyCashEntryValidator.test.ts`,
  `src/pettyCash/sheets/__tests__/PettyCashReconciler.test.ts` (new)
- `src/setup/Setup.ts`, `src/index.ts`, `.env.example`

Files touched — frontend `C:\xampp\htdocs\envi\ENVI.ProjectSite`:
- `src/Erp/PettyCash/pettyCashApi.ts`, `recentValues.ts` (+ test), `PostalDispatchSection.tsx`,
  `PettyCashEntryPage.tsx` (new); `BarcodeScanProbePage.tsx` deleted
- `src/React/MainWindow/index.tsx`, `MainMenu.tsx`

Impact type: API, UI

Notes:
- 101 backend tests, 32 frontend tests, both typechecks clean, no new circular dependency.
- No spreadsheet was written in this session. No database. Nothing committed.
- The browser-to-sheets round trip has not been exercised yet; both writers were proven live in P2
  and P4, but the form has never submitted against a running backend. That is P7.

---

## 2026-08-12 — wiring verified, two defects fixed

**Checkpoint:** P7 preparation

Summary:
- `.env.development` now points at the development copies with `PETTY_CASH_SHEETS_DRY_RUN=true`.
- Identity question closed by the owner: everything is written by `oramwp@gmail.com` and version
  history attribution is not wanted. Row ownership stays with the marker columns.
- Exercised the whole path in dry-run from a DTO in the shape the form builds: postal entry with two
  letters, card invoice, and a postal entry with a mismatched sum (correctly rejected). Backend
  starts clean and all three routes answer 401 without a session.
- Fixed: the reconciler reported `fry elektroniczne` blocks as unfinished dispatches. They cost
  nothing and can never have a petty-cash row, so a permanent false item would have trained people
  to ignore the reconcile screen. Zero-total blocks are now excluded, with a test.
- Removed: `GET /pettyCash/access`, added by analogy with cost invoices but pointless here — that
  module gates on a `StaffMembers` flag the client cannot see, this one gates on a role the client
  already holds.
- **Found a real gap in the records.** Invoice `F00043G012600999273P` — a postal expense of `10,30`
  entered in petty cash on 2026-01-20 by `got. ADu` — has no block in the letters register, in
  either the 2026 or the 2025 tab. A letter that was paid for and never registered.

Files touched:
- `.env.development` (gitignored)
- `src/pettyCash/sheets/PettyCashReconciler.ts`, `src/pettyCash/PettyCashRouter.ts`
- `src/pettyCash/sheets/__tests__/PettyCashReconciler.test.ts`
- plan and progress updated

Impact type: API

Notes:
- 102 tests pass, typecheck clean, no spreadsheet written (dry-run), nothing committed.
- Temporary verification scripts deleted after use.

---

## 2026-08-13 — fixes from the owner's own testing

**Checkpoint:** post-P6 fix round

Summary:
- The owner ran the form for real against the copies and found in an hour more than the whole test
  suite had. Six defects fixed, two features added on request.
- Payment method now reaches the sheet: `got. Michał` / `karta Krzysiek` in one cell, prefix
  de-duplicated and corrected when it contradicts the chosen method. Before this, robot rows were
  distinguishable at a glance — the opposite of the goal.
- Marker columns are hidden by an idempotent request in both writers; verified live as
  `hiddenByUser: true`.
- The register now inserts the rows it needs instead of consuming the 21 free ones before the
  e-mail address book. Verified live: the address book moved down and back. Occupancy guard removed
  as redundant.
- Scanner teardown made explicit and stepwise, fixing the unhandled `setPhotoOptions failed`.
- `SheetPreview` shows, live under the form, the exact row and block that will be created, in the
  sheets' own column order.
- `PettyCashReconcilePage` at `/pettyCash/reconcile` lists dispatches needing attention and finishes
  a `REGISTER_ONLY` one. `CASH_ONLY` stays informational — a petty-cash row cannot be expanded back
  into letters.
- Added: tracking link in the letter-number column via `POSTAL_TRACKING_URL_TEMPLATE` (URL
  unconfirmed, hence env not constant); payer defaults to the logged-in user's first name.

My own error, recorded because it caused a live write: `yarn kill` stops the process on port 3000
but not the `nodemon` supervisor. Four supervisors had accumulated across restarts and one still
held `PETTY_CASH_SHEETS_DRY_RUN=false`, so a dispatch was written to the copies despite the file
saying `true`. Removed; both copies verified back to their prior state. Check the supervisor, not
the port.

Files touched — backend:
- `src/pettyCash/PettyCashEntry.ts` (`sheetPayerLabel`), `postal/PostalDispatchItem.ts` (tracking URL
  helpers), `sheets/PettyCashWriter.ts`, `sheets/PostalRegisterWriter.ts`,
  `sheets/PettyCashReconciler.ts`, `PettyCashEntryController.ts`, `PettyCashRouter.ts`
- `src/setup/Setup.ts`, `.env.example`, three test files

Files touched — frontend:
- `src/Erp/PettyCash/previewRows.ts` + test, `SheetPreview.tsx`, `PettyCashReconcilePage.tsx` (new)
- `useBarcodeScanner.ts`, `PettyCashEntryPage.tsx`, `src/React/MainWindow/index.tsx`

Impact type: API, UI

Notes:
- Backend suites for the changed areas: 51 tests pass. Frontend: 44 tests pass. Both typechecks clean.
- Both copies verified byte-identical to their prior state after cleanup.
- `PETTY_CASH_SHEETS_DRY_RUN` left at `true`; the owner had set `false`.

Follow-up the same day, on request: the preview table became a **second editing surface**. Cells
carry the form field they change, so form and table read and write the same state — no second copy
to keep in sync. Derived cells stay locked and explain themselves on hover: computed by a sheet
formula (expense, sum, card inflow), assigned by the sheet (block number), or composed of two form
fields (payer plus method). The advance inflow is the one exception — there it is an input, so it
stays editable. Page widened to 1100 px for the table while the form column stays at 640 px, since
the form is the phone surface and the table the desktop one. 50 frontend tests pass.

---

## 2026-08-13 — uwagi po drugim przejrzeniu ekranu

Podsumowanie:
- Walidacja przepisana na konwencję repo: `react-hook-form` + `yupResolver`, komunikat pod polem,
  przycisk zablokowany do czasu poprawnego formularza. Poprzednie odstępstwo właściciel cofnął.
- Zawijanie treści w komórkach opisowych (textarea do sześciu wierszy) i nowe szerokości kolumn:
  numer nadania poszerzony, data i kwota zwężone. Ucięta ostatnia cyfra numeru wygląda jak
  poprawny numer, więc to nie jest kwestia estetyki.
- Formularz i tabela ustawione na wspólnej osi.
- Linki do obu arkuszy na górze zakładki, z nowego `GET /pettyCash/links`; adresy budowane
  z identyfikatorów w env, więc w dev prowadzą do kopii.

Files touched — backend:
- `src/pettyCash/PettyCashRouter.ts`, `PettyCashEntryController.ts`

Files touched — frontend:
- `src/Erp/PettyCash/PettyCashValidationSchema.ts` (new) + test, `PettyCashEntryPage.tsx`,
  `SheetPreview.tsx`, `previewRows.ts`, `pettyCashApi.ts`

Impact type: API, UI

---

## 2026-08-13 — usunięcie uzgadniania, przegląd kodu, menu „Biuro”

Podsumowanie:
- **Funkcja „Zgodność arkuszy” usunięta w całości** na życzenie właściciela: reconciler z testem,
  strona, dwie trasy, dwie metody kontrolera, klient API i typ `DispatchSyncState`. Skutek do
  zapamiętania: blok w rejestrze bez wiersza w zaliczkach nie zostanie już wykryty automatycznie —
  zostaje komunikat błędu, który nazywa powstały blok i prosi o ręczne dopisanie wiersza.
- Przegląd skillem `ponytail`: martwy `buildRangeExpansion` **podpięty** zamiast skasowanego (usuwa
  realną awarię przy pełnym miesiącu), usunięte nieużywane `isRobotMarker` w obu modelach
  i `WALLET_LABEL`, trzy kopie funkcji do kwot sprowadzone do jednej pary `toAmount`/`toNumber`,
  zniknął pasek sumy w sekcji listów (tę samą sumę pokazywał podgląd, a niezgodność zgłasza
  walidacja).
- Linki do arkuszy jako przyciski zamiast gołych odnośników.
- Skrót osoby w zapisie arkuszowym: pierwsza litera imienia i trzy pierwsze nazwiska, wielkimi
  (`Anna Dorosinska` → `ADOR`).
- **Nowe menu „Biuro”** w navbarze: „Kilometrówka” przeniesiona z „Kontraktów”, „Zaliczki”
  z pozycji najwyższego poziomu. Każda pozycja ma własną bramkę uprawnień, a samo menu pokazuje
  się tylko wtedy, gdy zostaje w nim cokolwiek.

Files touched — backend:
- usunięte: `src/pettyCash/sheets/PettyCashReconciler.ts` + test
- `src/pettyCash/PettyCashRouter.ts`, `PettyCashEntryController.ts`, `PettyCashEntry.ts`,
  `postal/PostalDispatch.ts`, `sheets/PettyCashWriter.ts`, `sheets/pettyCashSheetConfig.ts`
- `.env.development` — sprostowany komentarz przy `PETTY_CASH_SHEETS_DRY_RUN` (mówił „zapis
  wyłączony”, a wartość to `false`, czyli zapis włączony na kopie; ten rozjazd współtworzył
  wcześniejszą wpadkę)

Files touched — frontend:
- usunięte: `src/Erp/PettyCash/PettyCashReconcilePage.tsx`
- `PettyCashEntryPage.tsx`, `PostalDispatchSection.tsx`, `previewRows.ts`, `pettyCashApi.ts`,
  `personShortcut.test.ts` (new), `src/React/MainWindow/MainMenu.tsx`,
  `src/React/MainWindow/index.tsx`

Impact type: API, UI

Notes:
- 50 testów backendu w dotkniętych plikach, 68 we froncie, oba typechecki czyste.
- Menu sprawdzone w przeglądarce po rozwinięciu: „Biuro” zawiera dokładnie „Kilometrówka”
  (`#/mileage`) i „Zaliczki” (`#/pettyCash`), po jednym wystąpieniu każdej w całym navbarze.
- Osierocone procesy backendu (trzy instancje `ts-node` bez żywego nadzorcy) usunięte. To ta sama
  narośl, która wcześniej spowodowała niechciany zapis — warto sprawdzać nadzorcę, nie port.

---

## 2026-08-13 — usunięcie trybu próbnego

Podsumowanie:
- `PETTY_CASH_SHEETS_DRY_RUN` usunięty w całości na życzenie właściciela: konfiguracja, parametr
  w obu writerach, pole w `CommitResult`, rozróżnienie 200/201 w routerze, oba pliki env, typ
  w kliencie API i komunikat „Tryb próbny" w formularzu.
- Przy okazji zniknęły aliasy `WriteOutcome` / `RegisterOutcome` — bez pola `dryRun` były już tylko
  drugim imieniem dla `WritePlan` / `RegisterPlan`.
- Zaktualizowany plan: wiersz w tabeli decyzji, banery „Superseded" nad zamkniętymi P2 i P4, lista
  zmiennych w P5 oraz **przestawione kroki P7** — inspekcja żywych arkuszy idzie teraz przed zmianą
  env, bo to ona przejmuje rolę próby.

Files touched — backend:
- `src/setup/Setup.ts`, `src/pettyCash/sheets/PettyCashWriter.ts`,
  `src/pettyCash/sheets/PostalRegisterWriter.ts`, `src/pettyCash/PettyCashEntryController.ts`,
  `src/pettyCash/PettyCashRouter.ts`, `.env.example`, `.env.development`
- `documentation/team/operations/petty-cash-sheets/plan.md`

Files touched — frontend:
- `src/Erp/PettyCash/pettyCashApi.ts`, `src/Erp/PettyCash/PettyCashEntryPage.tsx`

Impact type: API, UI, Config

Notes:
- 99 testów backendu (5 suit) i 68 frontu (6 plików) przechodzi, oba typechecki czyste. Żaden test
  nie wymagał poprawki — nic nie dotykało flagi.
- Zabezpieczeniem przed zapisem w niewłaściwy plik zostają wyłącznie `PETTY_CASH_SPREADSHEET_ID`
  i `POSTAL_REGISTER_SPREADSHEET_ID`. `yarn pettycash:inspect` pozostaje odczytem bez zapisu i to on
  służy do obejrzenia żywego arkusza przed przełączeniem.
