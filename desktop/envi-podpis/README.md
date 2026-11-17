# ENVI Podpis

Program Windows do podpisywania PDF z PS ENVI, komputera, Dysku Google i poczty kartą kwalifikowaną.
Tu tylko budowanie; reszta jest w kodzie (`src\`).

## Wydanie 1.3.1 (2026-10-24)

Kanal dystrybucji: PS ENVI -> menu uzytkownika -> Narzedzia -> ENVI Podpis.
Do assets/signing/EnviPodpis.exe trafia kompletny EnviPodpisSetup.exe, nie sam plik aplikacji.
Numer pobieranej paczki pokazuje istniejacy ekran PS; frontend i MIN_PROGRAM_VERSION bez zmian.
Przed kazdym wydaniem zbuduj release i instalator, sprawdz ekstrakcje, manifest, izolowana instalacje i trase pobierania.
Publikacja tej poprawki zostala zlecona przez ownera 2026-10-24; odbior Dysku i karty pozostaje osobny.

Ikona pulpitu ma turbine ENVI pod skosem -25 stopni i pioro w rogu. Edytowalny znak to
assets/envi-podpis.svg; assets/envi-podpis.ico zawiera rozmiary 16/24/32/48/64/128/256 px z przezroczystym marginesem.
Nie zmieniac grafiki podpisu w PDF przy wymianie ikony aplikacji.

Instrukcja pracownika jest utrzymywana w wiki SB: 40_wiki/firma/systemy/ps-envi/envi-podpis.md.
Ponizsze sekcje D1-D4 zachowuja kontekst historycznych prob; aktualny odbior i wydanie prowadzi plan obiegu w SB.

## Budowanie

Potrzebny jest tylko kompilator wbudowany w Windows (.NET Framework 4.x), bez NuGet i bez dodatków.

```
build.cmd           -> bin\EnviPodpis.exe        (wersja produkcyjna, rozmawia tylko z PS na Heroku)
build.cmd debug     -> bin\EnviPodpis.debug.exe  (wersja testowa: dodatkowo lokalny PS na localhost:3000 i tryb /selftest)
```

Kod pisz w C# 5 (kompilator z .NET Framework nie zna nowszej składni).
Do `bin\` nic nie wpisujemy ręcznie; folder jest ignorowany przez git.

## Wersja

Numer wersji jest w `src\AssemblyInfo.cs` (jedno miejsce). Po zmianie zwiększ go i zbuduj ponownie.
Normalne uruchomienie aplikacji otwiera lokalne PDF; aktualizację wykonuje osobny instalator.

## Publikacja nowej wersji

Użytkownicy pobierają program z PS (`GET /signing/program/download`), a serwer oddaje plik
`assets/signing/EnviPodpis.exe` z repozytorium PS. `bin\` jest ignorowany przez git, więc nowa wersja
programu wymaga trzech kroków w jednym commicie:

1. podnieś numer w `src\AssemblyInfo.cs`, zbuduj `build.cmd` (release) i kompletny instalator według sekcji D3,
2. dopiero po zgodzie na publikację skopiuj `EnviPodpisSetup.exe` do `assets\signing\EnviPodpis.exe` (nazwa pobierania pozostaje zgodna z PS),
3. jeśli stare wersje przestają działać z serwerem, podnieś `MIN_PROGRAM_VERSION` w
   `src\signing\jobs\SigningJobsConfig.ts` (stary program pokaże wtedy komunikat „pobierz nową wersję”).

## Testy bez karty (wersja testowa)

```
EnviPodpis.debug.exe /selftest wynik.txt unit
EnviPodpis.debug.exe /selftest wynik.txt soft <token>   (cały przebieg kluczem programowym, wymaga PS lub atrapy na localhost:3000)
EnviPodpis.debug.exe /selftest wynik.txt card <token>   (prawdziwy certyfikat, kończy przed PIN-em)
EnviPodpis.debug.exe /selftest wynik.txt ui <katalog>   (zrzuty okien)
```

## Proba samodzielnego silnika PDF (D1)

Proba D1 uzywa paczki testowej Windows x64. Lokalny przeplyw D2 opisano ponizej; instalator pozostaje poza ta proba.
Nie kopiowac jej do aktywnej instalacji. Budowanie wymaga istniejacych zaleznosci repozytorium;
pierwszy przebieg pobiera oficjalne archiwum Node i sprawdza przypieta sume SHA-256.

```
yarn node desktop/envi-podpis/pdf-worker/build.cjs
```

Ostatnia linia wskazuje nowy katalog `desktop/envi-podpis/bin/pdf-worker-*`.
Test uruchamiamy na Node z tego katalogu (dodanym tylko do PATH biezacej sesji):

```
yarn node desktop/envi-podpis/pdf-worker/test.cjs <katalog-paczki>
yarn test src/signing/__tests__ --runInBand --testTimeout=30000
```

Test wypisuje katalog dowodow: wygenerowany dokument, przygotowany PDF, PNG podgladu i
wynik podpisany jednorazowym kluczem programowym. Nie uzywa karty ani PIN-u.
Paczka zawiera `THIRD-PARTY.json`, licencje zaleznosci i pelny manifest SHA-256;
kontrola startowa obejmuje wszystkie pliki z manifestu przed zaladowaniem silnika.
Izolacja testowa blokuje API sieci JavaScript i dostep do repozytorium. Nie zastepuje proby
na czystym koncie Windows z siecia wylaczona na poziomie systemu. Owner zawezil D1 do swojego komputera; szersza dystrybucja wymaga osobnej weryfikacji srodowiska.


## Lokalny przeplyw PDF — wersja rozwojowa D2

Bez instalowania i bez podmiany aktywnej wersji:

```
bin\EnviPodpis.debug.exe /local "<katalog zbudowanej paczki pdf-worker>"
```

Przed proba z karta: zatwierdz podglad kazdego wybranego pliku, wybierz katalog kopii.
Testy automatyczne uzywaja tylko generowanych PDF i jednorazowego klucza programowego:

```
bin\EnviPodpis.debug.exe /selftest wynik.txt local "<katalog paczki>" "<katalog wygenerowanych fixtures>"
```

Od D3 EXE bez argumentow otwiera lokalne pliki, bez instalowania. Podpis karta wymaga osobnej proby ownera w D6. Podglad stron obroconych
lub z innym CropBox jest mozliwy; grafike wybierz na zwyklej stronie albo ja wylacz.

## Kompletny instalator (D3, do przegladu)

Windows x64, .NET Framework 4.8 jak w dotychczasowym programie; Node i biblioteki PDF sa dolaczone.
Nie zakladamy obecnosci zaleznosci z instalatora SB. Build na Node dolaczonym do workera, dodanym do PATH tylko na czas komendy:

```
build.cmd
yarn node desktop/envi-podpis/package.cjs <katalog-paczki-pdf-worker>
```

Komenda Yarn jest wykonywana z root repo i ponownie buduje release, aby uniknac starego EXE w nowym instalatorze. Ostatnia linia wskazuje `bin/installer-*`.
Do dostarczenia jest tylko `EnviPodpisSetup.exe`; `payload/`, ZIP i SHA256 pozostaja materialem kontroli.
Nie podmieniac aktywnej instalacji ani publikowanego zasobu przed zgoda ownera na konkretny build.

- Instalacja/naprawa: uruchom instalator, zamknij okna programu i potwierdz. Anulowanie przed potwierdzeniem niczego nie zapisuje.
- Zwykly start: skrot `ENVI Podpis` na pulpicie albo zainstalowany `EnviPodpis.exe`, bez argumentow.
- Cofniecie: uruchom ten sam instalator z `/rollback`; poprzednia wersja zostaje zachowana do ponownego przywrocenia. Naprawa tej samej wersji nie nadpisuje zachowanej poprzedniej wersji.
- Usuniecie: Ustawienia Windows -> Aplikacje -> ENVI Podpis. Wlasne wpisy i skrot znikaja; pliki programu sa usuwane po zamknieciu okna potwierdzenia. Pomocniczy EXE moze pozostac w katalogu tymczasowym Windows.
- Nie przerywaj procesu w trakcie podmiany. Proby awarii zasilania/przymusowego zabicia procesu nie sa testem tej wersji.
- Wlasne dokumenty trzymaj poza katalogiem programu. Dodatkowe pliki w instalacji lub zachowanej poprzedniej wersji blokuja podmiane/usuniecie, aby chronic je przed skasowaniem.

Testy bez aktywnej instalacji, produkcji i karty:

```
bin\EnviPodpis.debug.exe /selftest wynik.txt installer <katalog-payload>
yarn node desktop/envi-podpis/ps-test.cjs desktop/envi-podpis/bin/EnviPodpis.debug.exe <katalog-dowodow>
```

Pierwszy test uzywa odrebnego katalogu, testowych wpisow HKCU i testowego skrotu. Drugi potrzebuje wolnego `localhost:3000`, uruchamia wylacznie atrape PS i weryfikuje podpisy kluczem programowym. Opcjonalne `--ui` otwiera syntetyczne wygasle zlecenie do przegladu; zamknij je w ciagu trzech minut.
Dwuklik ownera, rzeczywiste zachowanie SmartScreen/Defender oraz ewentualna wymiana aktywnej instalacji to osobny odbior; testy agenta ich nie zastepuja.

## Konto Google (D4, lokalna wersja do odbioru)

W nowej wersji otwórz „Konto Google…” → „Wybierz JSON…”. Wskaż lokalnie pobrany plik klienta Desktop z projektu `envi-podpis`; nie wklejaj jego zawartości do czatu ani repo. Potem wybierz „Zaloguj Google” i osobiście dokończ logowanie oraz zgodę w przeglądarce kontem organizacji ENVI. Zakres `drive` jest szeroki; jego wybór zatwierdzono w decyzji projektu. To jeszcze nie jest obsługa folderów i podpisów na Dysku (D5).

Źródłowy JSON nie jest usuwany ani modyfikowany. Po imporcie pozostaje nieszyfrowaną kopią w miejscu pobrania; przechowuj go poufnie. Lokalnych danych konta w `%LOCALAPPDATA%\ENVI\PodpisData\GoogleDrive` nie kopiuj między użytkownikami Windows ani do paczki instalacyjnej. „Wyloguj lokalnie” usuwa zapamiętaną zgodę z tego magazynu, ale zachowuje konfigurację aplikacji. Zgodę po stronie Google cofniesz w ustawieniach konta Google → Połączenia z aplikacjami. Nie obiecujemy, że szyfrowanie dyskowe chroni przed programami uruchomionymi na tym samym koncie Windows.

Test D4 bez Google, sekretów właściciela i karty (wyłącznie syntetyczna konfiguracja, lokalny powrót przeglądarki i mock wymiany tokenów):

```
build.cmd debug
bin\EnviPodpis.debug.exe /selftest <plik-wyniku> oauth
```

Podgląd pustego, izolowanego okna: tryb `oauthui`; opcjonalny ostatni argument `configured` lub `remembered` pokazuje stan z syntetycznymi danymi w wąskim oknie. Nigdy nie używaj rzeczywistego JSON-a jako fixture. Odbiór D4 wymaga osobnego, osobistego logowania właściciela; test mock go nie zastępuje. Nowej paczki nie instalować ani nie publikować bez zgody na konkretny build.
