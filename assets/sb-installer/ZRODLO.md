# Skad sa te pliki

Kopia robocza instalatora firmowego Second Brain. **Zrodlem prawdy jest repozytorium
`envi-konsulting/ENVI.SB.Rdzen`, katalog `bootstrap/`** - tu lezy kopia tylko po to, zeby PS ENVI
mialo co oddac osobie, ktora nie ma jeszcze dostepu do firmowego Dysku (to jest caly sens tej
trasy: zamkniecie zakletego kregu "zeby zainstalowac SB, musisz juz miec dostep do Dysku, ktory
SB konfiguruje").

- Zrodlo: `envi-konsulting/ENVI.SB.Rdzen`, `bootstrap/`
- Commit, z ktorego pochodzi ta kopia: `b98b5a5`
- Skopiowano: 2026-09-10 (wydanie rdzenia 0.13.0)

**Uwaga z 2026-08-27.** Ta kopia stala rozjechana od 2026-08-21 (`bootstrap.ps1` mniejszy
o 8,6 kB). Skutek byl gorszy niz sama nieaktualnosc: straznik ponizej rzuca wyjatkiem, wyjatek
konczy caly przebieg, wiec **przez szesc dni nie wykonywaly sie takze sprawdziany nastepne**
i nikt tego nie zauwazyl. Jesli widzisz tu czerwien - odswiez kopie, nie omijaj sprawdzianu.

**Nie edytuj tych plikow tutaj.** Zmiane robi sie w repo rdzenia i dopiero stamtad odswieza sie
te kopie. Rozjazd wykrywa `bootstrap/test-bootstrap-units.ps1` w repo rdzenia - sprawdza te kopie
za kazdym razem, gdy repozytorium PS ENVI jest obecne na tej samej maszynie.
