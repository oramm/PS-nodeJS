# Public Profile Submission Plan

## Purpose

Utrzymanie jednego, prostego i operacyjnie bezpiecznego procesu udostępniania publicznego linku do uzupełnienia profilu osoby.

## Scope

Moduł backendowy `src/persons/publicProfileSubmission/*` obejmuje:

- generowanie linku publicznego,
- walidację e-mail (kod),
- zapis draftu i submit,
- wewnętrzny review elementów,
- operacje staff dla linku i statusu procesu.

## Current product decisions (frozen)

1. Przy utracie linku używamy prostego mechanizmu: generacja nowego linku (bez odzyskiwania starego URL).
2. System przechowuje i pokazuje ostatnie zdarzenie linku, bez pełnej tabeli audytu.
3. Endpoint staff create-link obsługuje:
    - `recipientEmail` (opcjonalny),
    - `sendNow` (opcjonalny; wysyłka maila od razu).
4. Dla `sendNow=true` i braku `recipientEmail` system próbuje fallback na e-mail osoby z `Persons`.
5. Jeżeli brak odbiorcy dla `sendNow`, request kończy się kontrolowanym `400` bez modyfikacji stanu procesu.

## Data model (active)

`PublicProfileSubmissions` przechowuje ostatni znany stan wysyłki:

- `LastLinkRecipientEmail`
- `LastLinkEventAt`
- `LastLinkEventType` (`LINK_GENERATED` | `LINK_SENT` | `LINK_SEND_FAILED`)
- `LastLinkEventByPersonId`

## API contract highlights

- `POST /v2/persons/:personId/public-profile-submissions/link`
    - request: `{ recipientEmail?: string, sendNow?: boolean }`
    - response: zawiera `token`, `url`, `expiresAt`, `submissionId` oraz sekcję `dispatch`.
- `POST /v2/persons/:personId/public-profile-submissions/search` i
  `GET /v2/persons/:personId/public-profile-submissions/:submissionId`
    - zwracają pola `lastLink*` do UI.

## Next steps

1. Dodać testy jednostkowe dla nowych ścieżek `createOrRefreshLink` (`sendNow`, fallback, fail-path).
2. Po stronie UI wyświetlić: ostatni e-mail, datę ostatniej akcji i status ostatniej wysyłki.
3. Dodać akcję „Wyślij ponownie” opartą o ten sam endpoint create-link z `sendNow=true`.
