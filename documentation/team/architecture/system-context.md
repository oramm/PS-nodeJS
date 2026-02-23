# System Context (C4)

Ten dokument przedstawia wysokopoziomowy diagram kontekstu systemu (C4 System Context) dla aplikacji ENVI.ProjectSite oraz jej backendu PS-nodeJS.

## Diagram Kontekstu

```mermaid
C4Context
    title System Context diagram for ENVI.ProjectSite & PS-nodeJS

    Person(user, "Użytkownik", "Pracownik firmy korzystający z systemu do zarządzania projektami, umowami i fakturami.")

    System_Boundary(envi_boundary, "ENVI System") {
        System(frontend, "ENVI.ProjectSite", "Aplikacja kliencka (Frontend) w React. Zapewnia interfejs użytkownika.")
        System(backend, "PS-nodeJS", "Aplikacja serwerowa (Backend) w Node.js/Express. Realizuje logikę biznesową i udostępnia API.")
    }

    SystemDb(mariadb, "MariaDB", "Główna relacyjna baza danych. Przechowuje dane biznesowe (umowy, projekty, faktury).")
    SystemDb(mongodb, "MongoDB", "Baza danych NoSQL. Przechowuje sesje użytkowników.")

    System_Ext(google_apis, "Google APIs", "Zewnętrzne usługi Google (Drive, Docs, Gmail, Sheets) do zarządzania dokumentami i komunikacją.")
    System_Ext(ksef, "KSeF", "Krajowy System e-Faktur. Integracja w zakresie wystawiania i pobierania faktur ustrukturyzowanych.")
    System_Ext(openai, "OpenAI", "Zewnętrzne usługi AI wykorzystywane do analizy i przetwarzania danych.")

    Rel(user, frontend, "Korzysta z", "HTTPS")
    Rel(frontend, backend, "Wysyła żądania API do", "JSON/HTTPS")

    Rel(backend, mariadb, "Odczytuje i zapisuje dane w", "TCP/IP")
    Rel(backend, mongodb, "Zarządza sesjami w", "TCP/IP")

    Rel(backend, google_apis, "Integruje się z (OAuth2)", "HTTPS")
    Rel(backend, ksef, "Wysyła/pobiera faktury z", "HTTPS")
    Rel(backend, openai, "Wysyła zapytania do", "HTTPS")
```

## Opis Elementów

- **ENVI.ProjectSite**: Frontendowa część systemu, z którą bezpośrednio wchodzi w interakcję użytkownik.
- **PS-nodeJS**: Serce systemu, realizujące architekturę Clean Architecture, odpowiedzialne za autoryzację, walidację i logikę biznesową.
- **MariaDB**: Główne źródło prawdy dla danych biznesowych.
- **MongoDB**: Wykorzystywane głównie do przechowywania sesji Express.
- **Google APIs**: Kluczowa integracja dla generowania dokumentów (Docs), przechowywania plików (Drive) oraz wysyłania powiadomień (Gmail).
- **KSeF**: Integracja z polskim systemem e-Faktur.
- **OpenAI**: Wsparcie procesów biznesowych poprzez sztuczną inteligencję.
