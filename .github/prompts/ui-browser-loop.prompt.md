---
agent: ask
description: Thin Copilot prompt template for ENVI.ProjectSite UI Browser Loop tasks.
---

# UI Browser Loop

Tryb: UI Browser Loop do pracy nad ENVI.ProjectSite frontend.

Ten cienki prompt jest trzymany w `PS-nodeJS`, bo stąd zwykle startują agenci; przed działaniem zawsze dociągnij canonical docs z `ENVI.ProjectSite`.

Uzupełnij i przekaż agentowi:

- Route/ekran: `#/...`
- Co jest nie tak teraz:
- Co ma być docelowo:
- Ograniczenia:
- Rola użytkownika:
- Rozdzielczość:

Zasady:

- Polecenie screenshot powinno kierować na `http://localhost:9000/docs/#/...`, a nie na ścieżkę główną.
- Frontend komunikuje z backendem na `http://localhost:3000`.
- Tymczasowe zrzuty ekranu UI trafiają do `tmp/ui-browser-loop` i muszą być usunięte po weryfikacji.
- Zrzuty ekranu są artefaktami pomocniczymi i nie mogą być commitowane do repozytorium.
- Najpierw załaduj `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\ui-browser-loop.md` jako źródło prawdy.
