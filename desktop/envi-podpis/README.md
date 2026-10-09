# ENVI Podpis

Mały program dla Windows, który podpisuje pliki z PS kartą z podpisem kwalifikowanym.
Tu tylko budowanie; reszta jest w kodzie (`src\`).

## Budowanie

Potrzebny jest tylko kompilator wbudowany w Windows (.NET Framework 4.x), bez NuGet i bez dodatków.

```
build.cmd           -> bin\EnviPodpis.exe        (wersja produkcyjna, rozmawia tylko z PS na Heroku)
build.cmd debug     -> bin\EnviPodpis.debug.exe  (wersja testowa: dodatkowo lokalny PS na localhost:3000 i tryb /selftest)
```

Kod pisz w C# 5 (kompilator z .NET Framework nie zna nowszej składni).
Do `bin\` nic nie wpisujemy ręcznie; folder jest ignorowany przez git.

## Wersja

Numer wersji jest w `src\AssemblyInfo.cs` (jedno miejsce). Po zmianie zwiększ go i zbuduj ponownie:
uruchomienie nowego pliku nad zainstalowanym go aktualizuje.

## Publikacja nowej wersji

Użytkownicy pobierają program z PS (`GET /signing/program/download`), a serwer oddaje plik
`assets/signing/EnviPodpis.exe` z repozytorium PS. `bin\` jest ignorowany przez git, więc nowa wersja
programu wymaga trzech kroków w jednym commicie:

1. podnieś numer w `src\AssemblyInfo.cs` i zbuduj `build.cmd` (wersja produkcyjna, nie `debug`),
2. skopiuj `bin\EnviPodpis.exe` do `assets\signing\EnviPodpis.exe`,
3. jeśli stare wersje przestają działać z serwerem, podnieś `MIN_PROGRAM_VERSION` w
   `src\signing\jobs\SigningJobsConfig.ts` (stary program pokaże wtedy komunikat „pobierz nową wersję”).

## Testy bez karty (wersja testowa)

```
EnviPodpis.debug.exe /selftest wynik.txt unit
EnviPodpis.debug.exe /selftest wynik.txt soft <token>   (cały przebieg kluczem programowym, wymaga PS lub atrapy na localhost:3000)
EnviPodpis.debug.exe /selftest wynik.txt card <token>   (prawdziwy certyfikat, kończy przed PIN-em)
EnviPodpis.debug.exe /selftest wynik.txt ui <katalog>   (zrzuty okien)
```
