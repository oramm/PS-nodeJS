## Summary

<!-- What changed and why -->

## Operational Documentation Checklist

- [ ] Zmiana dotyczy DB/env/deploy: zaktualizowano `documentation/team/operations/post-change-checklist.md`
- [ ] Dodano/zmieniono env: zaktualizowano `.env.example`
- [ ] Dotyczy Heroku: opisano config vars i kroki wdrozeniowe
- [ ] Wymagane akcje lokalne sa opisane (np. `yarn install`/migracje)
- [ ] Dodano migracje SQL: wskazano plik(i) migracji i sposob uruchomienia
- [ ] Dodano lub zmieniono migration gate: opisano baseline/verify rollout i wynik `yarn migrate:verify`
- [ ] Zmiana dotyka klienta: potwierdzono, czy potrzebny jest frontend pointer albo UI-only docs w `ENVI.ProjectSite`
- [ ] Dotyczy GitHub Pages/build klienta: odpowiedzialnosc pozostaje po stronie `ENVI.ProjectSite`, nie Heroku

## Verification

<!-- What was tested/verified -->
