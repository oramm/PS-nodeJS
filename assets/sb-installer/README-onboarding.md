# Second Brain ENVI — pierwsze uruchomienie na Twoim komputerze

Ten dokument prowadzi Cię przez pierwsze uruchomienie firmowego Second Brain na nowym komputerze. Zanim uruchomisz instalator, wykonaj cztery krótkie kroki poniżej — każdy robisz raz, na początku. Piąty krok (logowanie do agenta) robisz przy pierwszym użyciu narzędzia.

Jeśli utkniesz na którymś kroku — nic straconego, patrz sekcja "Jeśli coś wygląda na zawieszone" na końcu.

## Krok 1 — Konto GitHub

Potrzebujesz konta na GitHub (to serwis, przez który Twój komputer pobiera aktualną wiedzę firmową).

- Jeśli masz już konto GitHub — świetnie, przejdź do kroku 2.
- Jeśli nie masz — załóż je na [github.com/signup](https://github.com/signup). Wystarczy zwykłe, prywatne konto (nie musi być firmowe) — koszt ewentualnego planu pokrywa firma, w ramach pilotażu.

## Krok 2 — Dostęp do odczytu wiedzy firmowej

Tego kroku **nie robisz sam** — potrzebna jest jedna czynność po stronie biura ENVI.

1. Wyślij swoją nazwę użytkownika GitHub do <właściciel repozytorium / biuro@envi.com.pl>.
2. Poczekaj na e-mail z zaproszeniem od GitHuba do zespołu (organizacji) **envi-konsulting**.
3. Otwórz ten e-mail i kliknij, żeby przyjąć zaproszenie.

Po przyjęciu zaproszenia masz dostęp do wiedzy firmowej w ramach zespołu **envi-konsulting** — zwykle **tylko do odczytu**, więc nie możesz nic w niej przypadkowo zepsuć ani nadpisać. (Jeśli Twoja rola to wyjątkowo współautorska, biuro poinformuje Cię o tym osobno.)

## Krok 3 — Logowanie do Dysku Google

Zainstaluj (lub zaloguj się, jeśli już masz zainstalowany) Dysk Google na komputerze, używając firmowego konta ENVI, które ma dostęp do folderu z narzędziami (skillami).

Po zalogowaniu na Twoim komputerze pojawi się dysk `G:` — to z niego instalator pobiera narzędzia dla agenta.

**To normalne:** jeśli uruchomisz instalator zanim zdążysz się zalogować do Dysku Google, instalator grzecznie Cię o tym poinformuje i zatrzyma tylko ten jeden etap — nie jest to błąd. Po zalogowaniu wystarczy uruchomić plik jeszcze raz.

## Krok 4 — Wyłączenie trenowania AI na Twoim koncie GitHub Copilot

W ustawieniach swojego konta GitHub wyłącz wykorzystywanie Twoich danych do trenowania modeli/produktów:

- Ustawienia konta → **Copilot** → **Features** (nazwa i lokalizacja tej opcji może się nieznacznie zmieniać w interfejsie GitHuba).
- Wyłącz opcję dotyczącą używania Twojej aktywności/kodu do trenowania modeli.

Robimy to, bo treści firmowe nie powinny trafiać do trenowania modeli zewnętrznych dostawców — to prosta zasada firmowa, nie dotyczy samej pracy z Second Brain, ale konta GitHub jako takiego.

## Krok 5 — Logowanie do agenta (Claude Code / Codex)

Na komputerze zainstalowany jest agent (Claude Code i/lub Codex — używasz tego, który pasuje do zadania, nie ma znaczenia który akurat wybierzesz). Przy pierwszym uruchomieniu narzędzie poprosi Cię o zalogowanie się — na start używasz swojego prywatnego konta, koszt pokrywa firma w ramach pilotażu.

To logowanie robisz raz na narzędzie — potem działa samo.

## Co robi instalator (jeden plik)

Całą resztę załatwia jeden plik: **`bootstrap.cmd`**.

1. Uruchamiasz `bootstrap.cmd` (dwuklik).
2. W pewnym momencie w przeglądarce pojawi się prośba o zalogowanie do GitHuba — to jednorazowa, bezpieczna autoryzacja (tzw. logowanie kodem urządzenia). Potwierdzasz i to wszystko — nie wpisujesz żadnych haseł do samego instalatora.
3. Dalej wszystko dzieje się automatycznie:
   - na komputerze pojawia się **jeden** folder — Twój Second Brain — a w Menu Start skrót, który go otwiera w Obsidianie,
   - w tym folderze jest wiedza firmowa (**tylko do odczytu**) oraz — jeśli pracujesz zespołowo nad projektami — osobny obszar projektowy, w którym możesz zapisywać zmiany,
   - wiedza firmowa sama, cicho, odświeża się w tle co kilka godzin (i przy każdym logowaniu) — nie musisz nic klikać, nie zobaczysz żadnego czarnego okienka konsoli,
   - do niczego z tego nie są potrzebne uprawnienia administratora ani znajomość komend git — ich w ogóle nie zobaczysz.

**Ważne — koniecznie przeczytaj:** w Twoim vaultcie jedna część (wiedza firmowa) jest **tylko do czytania** — to materiał referencyjny, nie da się jej przypadkowo zepsuć. Druga część (obszar projektowy) jest edytowalna, jeśli pracujesz w zespole nad projektami. Swoje własne, prywatne notatki możesz zapisywać po prostu **w tym samym vaultcie**, w dowolnym innym miejscu — nie musisz zakładać ani wybierać żadnego drugiego vaultu.

**Jeśli pracujesz zespołowo:** instalator sam rozpoznaje, że masz dostęp do wspólnego obszaru projektowego, i nie musisz nic w tej sprawie wybierać ani ustawiać. Dostajesz wtedy dodatkowo skrót **"Synchronizuj teraz (Second Brain)"** w dwóch miejscach: **na pulpicie** i w Menu Start. Kliknij go, kiedy chcesz od razu wysłać swoje zmiany i pobrać zmiany innych osób, zamiast czekać na automatyczne odświeżenie w tle. Po kliknięciu zobaczysz krótkie powiadomienie z wynikiem: wysłano, nie było nic nowego do wysłania, albo trzeba czyjejś pomocy. Nic więcej nie musisz robić.

Dwie rzeczy, które zaskakują przy pierwszym użyciu tego skrótu. Po pierwsze **nie otwiera żadnego okna** - jest uruchamiany celowo bez konsoli, więc jedynym znakiem, że zadziałał, jest to powiadomienie. Po drugie **wyszukiwarka w Menu Start może go przez jakiś czas nie znajdować**, bo Windows indeksuje nowe skróty z opóźnieniem; dlatego ta sama ikona leży od razu na pulpicie. Jeśli wolisz mieć ją na pasku zadań, kliknij ikonę na pulpicie prawym przyciskiem, wybierz "Pokaż więcej opcji", potem "Przypnij do paska zadań" - tego jednego kroku instalator nie zrobi za Ciebie, bo Windows blokuje przypinanie do paska z poziomu programu.

Plik jest bezpieczny do uruchomienia wielokrotnie — jeśli coś przerwiesz w połowie albo któryś krok wcześniej pominiesz, po prostu uruchom `bootstrap.cmd` jeszcze raz.

## Jeśli coś wygląda na zawieszone

Najczęstsza przyczyna to zwykle jedna z dwóch rzeczy:

- nie jesteś jeszcze zalogowany(a) do Dysku Google (krok 3), albo
- nie przyjęłaś/przyjąłeś jeszcze zaproszenia do zespołu (organizacji) envi-konsulting na GitHubie (krok 2).

W obu przypadkach: dokończ brakujący krok i uruchom `bootstrap.cmd` ponownie — to bezpieczne i nic nie nadpisze.
