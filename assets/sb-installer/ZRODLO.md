# Skad sa te pliki

Kopia robocza instalatora firmowego Second Brain. **Zrodlem prawdy jest repozytorium
`envi-konsulting/ENVI.SB.Rdzen`, katalog `bootstrap/`** - tu lezy kopia tylko po to, zeby PS ENVI
mialo co oddac osobie, ktora nie ma jeszcze dostepu do firmowego Dysku (to jest caly sens tej
trasy: zamkniecie zakletego kregu "zeby zainstalowac SB, musisz juz miec dostep do Dysku, ktory
SB konfiguruje").

- Zrodlo: `envi-konsulting/ENVI.SB.Rdzen`, `bootstrap/`
- Commit, z ktorego pochodzi ta kopia: `30668127d8cdf2d9d496b3a7100edd7b574a232b`
- Zlozono: 2026-10-08, wersja w naglowku pliku 0.14.15

**`ENVI-SB-instalator.cmd` nie jest plikiem z repo - jest skladany.** Funkcja `New-InstalatorCmd`
z `bootstrap/build-instalator.ps1` skleja naglowek wsadowy z `bootstrap.ps1` i README bajt w bajt.
Odswiezenie tej kopii (w repo rdzenia, PowerShell):

    . .\bootstrap\build-instalator.ps1
    New-InstalatorCmd -Wersja <numer wydania> -Cel <PS-nodeJS>\assets\sb-installer\ENVI-SB-instalator.cmd

Recznie skopiowany albo edytowany plik straznik uzna za rozjechany.

**Uwaga z 2026-08-27.** Ta kopia stala rozjechana od 2026-08-21 (`bootstrap.ps1` mniejszy
o 8,6 kB). Skutek byl gorszy niz sama nieaktualnosc: straznik ponizej rzuca wyjatkiem, wyjatek
konczy caly przebieg, wiec **przez szesc dni nie wykonywaly sie takze sprawdziany nastepne**
i nikt tego nie zauwazyl. Jesli widzisz tu czerwien - odswiez kopie, nie omijaj sprawdzianu.

**Nie edytuj tych plikow tutaj.** Zmiane robi sie w repo rdzenia i dopiero stamtad odswieza sie
te kopie. Rozjazd wykrywa `bootstrap/test-bootstrap-units.ps1` w repo rdzenia (TEST 5) - sklada
plik od nowa ze zrodel z wersja odczytana z naglowka tej kopii i porownuje sume, za kazdym razem,
gdy repozytorium PS ENVI jest obecne na tej samej maszynie.
