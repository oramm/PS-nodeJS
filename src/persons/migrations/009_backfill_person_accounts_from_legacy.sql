-- ROD-5 krok 1 (pack ROD, decyzja ownera D-ROD-9, 2026-09-08).
-- PersonAccounts staje się JEDYNYM źródłem roli, e-maila logowania i konta Google. Kod przestaje
-- czytać zaszłe kolumny Persons (SystemRoleId, SystemEmail, GoogleId, GoogleRefreshToken), więc
-- wszystko, co do dziś było TYLKO tam, musi trafić do konta ZANIM wyjdzie nowy kod - inaczej te
-- osoby dostałyby „Nie masz dostępu do systemu".
--
-- Tylko dodaje i uzupełnia puste pola; niczego nie nadpisuje ani nie kasuje. Idempotentna.
-- Raport tego, co zrobi (numery osób, bez nazwisk): `yarn persons:legacy-report`.
-- Kolejność na produkcji: `migrate apply` -> push backendu (bramka release tylko weryfikuje).
-- Krok 2 (DROP zaszłych kolumn) to osobna migracja po tygodniu ciszy - NIE tutaj.

-- 1) Osoba bez konta, której zaszłe kolumny niosą coś realnego: e-mail logowania, konto Google
--    albo rolę inną niż 5. Rola 5 (EXTERNAL_USER) to wartość DOMYŚLNA kolumny, której nikt nie
--    wybierał - osoba z samą domyślną rolą konta NIE dostaje (decyzja ownera: bez konta = nie jest
--    użytkownikiem). E-mail zajęty przez inne konto zostaje pusty (UNIQUE) - trafia do raportu.
INSERT INTO PersonAccounts (PersonId, SystemRoleId, SystemEmail, GoogleId, GoogleRefreshToken)
SELECT p.Id,
       p.SystemRoleId,
       CASE WHEN taken.Id IS NULL THEN NULLIF(TRIM(p.SystemEmail), '') ELSE NULL END,
       NULLIF(TRIM(p.GoogleId), ''),
       NULLIF(p.GoogleRefreshToken, '')
FROM Persons p
LEFT JOIN PersonAccounts existing ON existing.PersonId = p.Id
LEFT JOIN PersonAccounts taken ON taken.SystemEmail = TRIM(p.SystemEmail)
WHERE existing.Id IS NULL
  AND (NULLIF(TRIM(p.SystemEmail), '') IS NOT NULL
       OR NULLIF(TRIM(p.GoogleId), '') IS NOT NULL
       OR p.SystemRoleId <> 5);

-- 2) Konto z pustym e-mailem logowania, a zaszła kolumna ma adres, którego żadne konto nie używa:
--    ta osoba loguje się dziś po zaszłej kolumnie - adres przechodzi do konta, żeby nie straciła
--    dostępu. Adres zajęty przez inne konto zostaje w raporcie do decyzji ręcznej.
UPDATE PersonAccounts a
JOIN Persons p ON p.Id = a.PersonId
LEFT JOIN PersonAccounts taken ON taken.SystemEmail = TRIM(p.SystemEmail)
SET a.SystemEmail = TRIM(p.SystemEmail)
WHERE NULLIF(TRIM(a.SystemEmail), '') IS NULL
  AND NULLIF(TRIM(p.SystemEmail), '') IS NOT NULL
  AND taken.Id IS NULL;

-- 3) Konto bez roli: do dziś przy logowaniu obowiązywała rola z zaszłej kolumny (COALESCE),
--    więc przechodzi do konta. Zaszła kolumna jest NOT NULL, rola zawsze się znajdzie.
UPDATE PersonAccounts a
JOIN Persons p ON p.Id = a.PersonId
SET a.SystemRoleId = p.SystemRoleId
WHERE a.SystemRoleId IS NULL;
