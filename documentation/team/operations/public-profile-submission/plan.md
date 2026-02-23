# Experience Update - Delivery Plan

Data startu: 2026-02-20
Status dokumentu: ACTIVE
Zakres: Backend (`PS-nodeJS`) + Frontend (`ENVI.ProjectSite`)

## Cel

Uproszczenie procesu do modelu `1 profil = 1 aktywny link` oraz przejscie na nowy kontrakt endpointow `experience-updates` bez kompatybilnosci wstecznej.

## Zasady docelowe (zamrozone)

1. Hard cut API: usuwamy `public-profile-submissions`, zostaje tylko `experience-updates`.
2. Operacyjnie widzimy pojedynczy aktywny proces, bez listy historycznych draftow.
3. Staff zawsze widzi ostatni wazny link do kopiowania (tylko do `expiresAt`).
4. Tryb review: `uzupelnij braki`; `REJECT` wymaga komentarza i ten komentarz wraca do kandydata.
5. Start implementacji jest blokowany do czasu zamkniecia fazy dokumentacyjnej po obu repo.

## Fazy

### F0 - Doc-first Gate (MUST)

- Zsynchronizowac plan/progress/activity + checklisty po stronie server i client.
- Zsynchronizowac `Flow` i `api-contract` klienta z finalnym nazewnictwem `experience-updates`.
- Potwierdzic reguly retencji linku oraz fallback operacyjny.

Warunek przejscia:

- server plan/checklist i client plan/checklist maja ten sam zakres i date `2026-02-20`.
- Brak otwartych konfliktow nazewnictwa endpointow.

### F1 - Backend (PS-nodeJS)

- Przebudowac model na pojedynczy aktywny rekord procesu per osoba.
- Utrwalic i zwracac staffowi ostatni wazny link do kopiowania (do czasu wygaœniecia).
- Dla review `REJECT` wymagac komentarza i zapisac feedback.
- Wdrozyc hard-cut endpointow:
  - `/v2/persons/:personId/experience-updates/*`
  - `/v2/public/experience-update/*`
- Dostarczyc migracje konsolidujace dane do modelu `1 profil = 1 link`.

### F2 - Frontend (ENVI.ProjectSite)

- Zmienic nazewnictwo UI na `Aktualizacja doswiadczenia`.
- Usunac liste wielu draftow; pokazac pojedynczy stan procesu.
- Pokazac zawsze: ostatni wazny link, date zdarzenia, odbiorce, status wysylki.
- Przelaczyc FE na hard-cut endpointow `experience-updates`.
- Pokazac feedback do odrzuconych elementow i mozliwosc poprawy tylko brakujacych/odrzuconych.

## Kryteria akceptacji

1. Wielokrotne generowanie linku nie tworzy wielu aktywnych rekordow procesu.
2. Poprzedni link jest uniewazniany po odswiezeniu; nowy dziala.
3. Po `expiresAt` link nie jest zwracany do kopiowania.
4. `REJECT` bez komentarza zwraca blad walidacji.
5. Kandydat widzi komentarz i poprawia tylko wymagane elementy.
6. FE nie korzysta z aliasow `public-profile-submissions`.