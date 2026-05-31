# Experience Update - API Contract

Status: TARGET CONTRACT (2026-02-20)
Source of truth: backend `PS-nodeJS` module experience-updates
Naming note: `public-profile-submission` is the legacy initiative/folder name; the current product/API name is `Experience Update` (`experience-update(s)` endpoints).

## Endpoint prefixes

- Staff: `/v2/persons/:personId/experience-updates`
- Public: `/v2/public/experience-update`

## Staff endpoints

1. `POST /link`

Request:

```json
{
  "recipientEmail": "user@example.com",
  "sendNow": true
}
```

Response (target):

```json
{
  "personId": 123,
  "submissionId": 77,
  "copyLink": {
    "url": "https://...",
    "expiresAt": "2026-03-22T10:00:00.000Z"
  },
  "lastDispatch": {
    "recipientEmail": "user@example.com",
    "status": "LINK_SENT",
    "eventAt": "2026-02-20T10:00:00.000Z",
    "eventByPersonId": 2,
    "sendNowRequested": true
  }
}
```

2. `POST /search`

Response list item (target):

```json
{
  "id": 77,
  "personId": 123,
  "status": "SUBMITTED",
  "copyLink": { "url": "...", "expiresAt": "..." },
  "lastDispatch": {
    "recipientEmail": "user@example.com",
    "status": "LINK_SENT",
    "eventAt": "...",
    "eventByPersonId": 2
  }
}
```

3. `GET /:submissionId`

- Zwraca pojedynczy stan procesu + items + `copyLink` + `lastDispatch`.

4. `POST /:submissionId/items/:itemId/review`

Request:

```json
{
  "decision": "REJECT",
  "comment": "Brak daty zakonczenia i technologii"
}
```

Rules:

- `REJECT` -> `comment` required.
- `ACCEPT` -> `comment` optional.

## Public endpoints

- `GET /:token`
- `POST /:token/verify-email/request-code`
- `POST /:token/verify-email/confirm-code`
- `GET /:token/draft`
- `PUT /:token/draft`
- `POST /:token/analyze-file`
- `POST /:token/submit`

## Public draft feedback payload (target)

`GET /:token/draft` powinno zwracac feedback dla odrzuconych pozycji (na poziomie itemu), aby kandydat poprawial tylko wymagane elementy.

## Hard cut rule

- FE nie moze wywolywac zadnego endpointu z prefixem `public-profile-submissions`.
