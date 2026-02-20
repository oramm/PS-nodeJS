# Public Profile Submission Link Recovery Runbook

## Purpose

Operacyjny runbook dla sytuacji, gdy link do publicznego uzupe³nienia profilu:

- nie dotar³ mailem,
- zosta³ zgubiony,
- by³ wys³any na b³êdny adres.

Celem jest szybkie odblokowanie procesu bez rêcznej ingerencji w bazê danych.

## Scope

Dotyczy backend flow w module:

- `src/persons/publicProfileSubmission/*`

Endpointy:

- `POST /v2/persons/:personId/public-profile-submissions/link`
- `POST /v2/persons/:personId/public-profile-submissions/search`
- `GET /v2/persons/:personId/public-profile-submissions/:submissionId`

## Preconditions

1. Operator ma uprawnienia staff (sesja backendowa).
2. W œrodowisku dzia³a SMTP (jeœli u¿ywamy `sendNow=true`).
3. Migracja `005_add_public_profile_submission_last_link_event.sql` jest zastosowana.

## Quick Recovery (recommended)

### Scenario A: u¿ytkownik zgubi³ link lub mail nie dotar³

1. Wygeneruj nowy link i od razu wyœlij mail:

```http
POST /v2/persons/:personId/public-profile-submissions/link
Content-Type: application/json

{
  "recipientEmail": "user@example.com",
  "sendNow": true
}
```

2. PotwierdŸ w odpowiedzi:

- `dispatch.status`:
    - `LINK_SENT` (wysy³ka OK), albo
    - `LINK_SEND_FAILED` (wysy³ka nieudana  proces nadal ma nowy link).

3. Jeœli `LINK_SEND_FAILED`, skopiuj `url` z odpowiedzi i przeka¿ u¿ytkownikowi innym kana³em.

### Scenario B: literówka w pierwotnym adresie

1. Powtórz wywo³anie create-link z poprawnym `recipientEmail`.
2. U¿yj `sendNow=true`, aby wys³aæ nowy link od razu.

### Scenario C: nie znamy poprawnego adresu e-mail

1. Wywo³aj create-link z `sendNow=false` (zwróci sam URL):

```http
POST /v2/persons/:personId/public-profile-submissions/link
Content-Type: application/json

{
  "sendNow": false
}
```

2. Przeka¿ link u¿ytkownikowi rêcznie (np. telefon/komunikator).

## Verification

Po akcji recovery sprawdŸ status submission:

```http
POST /v2/persons/:personId/public-profile-submissions/search
Content-Type: application/json

{}
```

lub szczegó³y konkretnego submission:

```http
GET /v2/persons/:personId/public-profile-submissions/:submissionId
```

SprawdŸ pola:

- `lastLinkRecipientEmail`
- `lastLinkEventAt`
- `lastLinkEventType` (`LINK_GENERATED` / `LINK_SENT` / `LINK_SEND_FAILED`)
- `lastLinkEventByPersonId`

## Error handling

- `INVALID_EMAIL`:
    - przekazany `recipientEmail` ma niepoprawny format.
- `RECIPIENT_EMAIL_REQUIRED`:
    - u¿yto `sendNow=true`, ale brak adresu docelowego (ani w payload, ani fallback z `Persons`).
- `LINK_RECOVERY_RATE_LIMITED`:
    - create-link zosta³ wywo³any zbyt szybko po poprzedniej akcji; odczekaj kilka sekund i ponów.
- `FORBIDDEN`:
    - brak uprawnieñ staff.

## Operational notes

1. System nie odzyskuje starego linku  generuje nowy i uniewa¿nia poprzedni aktywny.
2. Przechowujemy ostatnie zdarzenie linku (MVP), bez pe³nego audytu historii prób.
3. W razie awarii SMTP proces i tak mo¿e byæ odblokowany przez rêczne przekazanie `url`.

## Escalation

Eskaluj do zespo³u backend, gdy:

- `LINK_SEND_FAILED` powtarza siê mimo poprawnej konfiguracji SMTP,
- endpoint create-link zwraca b³êdy 5xx,
- pola `lastLink*` nie s¹ zwracane mimo wdro¿onej migracji.
