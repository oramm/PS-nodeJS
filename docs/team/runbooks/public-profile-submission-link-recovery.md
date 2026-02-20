# Experience Update Link Recovery Runbook

## Purpose

Runbook dla sytuacji, gdy link do `Aktualizacji doswiadczenia`:

- nie dotarl mailem,
- zostal zgubiony,
- zostal wyslany na zly adres.

Celem jest odblokowanie procesu bez recznej ingerencji w DB.

## Scope

Dotyczy modulu backend:

- `src/persons/publicProfileSubmission/*` (po rename kontraktu na experience-updates)

Endpointy:

- `POST /v2/persons/:personId/experience-updates/link`
- `POST /v2/persons/:personId/experience-updates/search`
- `GET /v2/persons/:personId/experience-updates/:submissionId`

## Preconditions

1. Operator ma role staff.
2. SMTP dziala, jesli `sendNow=true`.
3. Migracje dla experience update sa zastosowane.

## Quick Recovery

### Scenario A - zgubiony link / brak maila

1. Wygeneruj nowy link i wyslij:

```http
POST /v2/persons/:personId/experience-updates/link
Content-Type: application/json

{
  "recipientEmail": "user@example.com",
  "sendNow": true
}
```

2. Zweryfikuj `dispatch.status`:

- `LINK_SENT`, albo
- `LINK_SEND_FAILED` (proces ma nowy link, ale mail nie wyszedl).

3. Przy `LINK_SEND_FAILED` skopiuj `copyLink.url` i przekaz innym kanalem.

### Scenario B - literowka w adresie

1. Powtorz create-link z poprawnym `recipientEmail` i `sendNow=true`.

### Scenario C - brak pewnego adresu

1. Uzyj `sendNow=false`.
2. Przekaz `copyLink.url` recznie.

## Verification

Po akcji recovery sprawdz:

```http
POST /v2/persons/:personId/experience-updates/search
```

lub

```http
GET /v2/persons/:personId/experience-updates/:submissionId
```

Sprawdz pola:

- `copyLink.url` (tylko gdy `now < expiresAt`),
- `copyLink.expiresAt`,
- `lastDispatch.recipientEmail`,
- `lastDispatch.eventAt`,
- `lastDispatch.status`,
- `lastDispatch.eventByPersonId`.

## Error handling

- `INVALID_EMAIL` - niepoprawny `recipientEmail`.
- `RECIPIENT_EMAIL_REQUIRED` - `sendNow=true` bez adresu docelowego.
- `LINK_RECOVERY_RATE_LIMITED` - za szybka ponowna proba.
- `FORBIDDEN` - brak roli staff.

## Operational notes

1. System generuje nowy link i uniewaznia poprzedni aktywny.
2. Staff dostaje tylko ostatni wazny link (`copyLink`) i metadata ostatniej wysylki.
3. Po wygaœnieciu link znika z `copyLink`.

## Escalation

Eskaluj do backend team gdy:

- wielokrotne `LINK_SEND_FAILED` przy poprawnej konfiguracji SMTP,
- endpointy zwracaja 5xx,
- `copyLink` lub `lastDispatch` nie sa zwracane zgodnie z kontraktem.