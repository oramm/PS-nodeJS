# Experience Update - Flow

Status: TARGET FLOW (2026-02-20)
Source of truth: backend `PS-nodeJS`, consumed by `ENVI.ProjectSite`
Naming note: `public-profile-submission` is the legacy initiative/folder name; the product/API name for this flow is `Experience Update` (`experience-update(s)` endpoints).

## Window legend

- W1 PersonProfilePage (internal, logged-in)
- W2 Modal `Wyslij link aktualizacji doswiadczenia`
- W3 Public Landing (token in URL)
- W4 Public `Weryfikacja e-mail`
- W5 Public `Edycja danych`
- W6 Public `Import CV` (optional)
- W7 Public `Wyslij do recenzji`
- W8 Staff section `Aktualizacja doswiadczenia`
- W9 Review panel per record + comment

## Staff flow

1. Staff opens person profile.
2. Staff creates or refreshes one active experience update process.
3. System stores one active link per person and returns `copyLink` plus `lastDispatch`.
4. Staff sends/copies the link to the recipient.
5. Staff reviews submitted items.
6. `ACCEPT` accepts the item.
7. `REJECT` requires a comment and sends feedback to the candidate.

Detailed UI path:

```
W1 -> W2 -> [System] generates a new active link
```

- the previous active link is invalidated,
- staff UI shows `copyLink` valid until `expiresAt`.

## Public candidate flow

1. Candidate opens `/public/experience-update/:token`.
2. Candidate verifies email when required.
3. Candidate edits draft profile data.
4. Candidate may upload/analyze a file.
5. Candidate submits the draft.
6. If staff rejects selected items, candidate sees item feedback and corrects only missing/rejected elements.

Detailed UI path:

```
W3 -> W4 -> W5 -> optional W6 -> W7
```

Review path:

```
W8 -> W9
```

- `ACCEPT` -> immediate save
- `REJECT` -> comment required and returned to the candidate

## Operational rules

- One person has one active experience update process.
- New link refresh invalidates the previous active link.
- Expired links are not returned for copying.
- UI label: `Aktualizacja doswiadczenia`.
- Legacy `public-profile-submissions` prefix is not allowed.
- Process closes after all items are resolved.
