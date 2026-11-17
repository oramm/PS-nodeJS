-- Wpisy ręcznego dostępu sprzed uruchomienia modułu. Źródłem logowania jest PersonAccounts.
-- Brak konta lub zajęty login oznacza pominięcie; istniejący stan nigdy nie jest nadpisywany.
INSERT INTO SbAccess (PersonId, StatusCode, GithubLogin, IsGrantedManually)
SELECT PersonAccounts.PersonId, 'ACTIVE', seed.GithubLogin, 1
FROM PersonAccounts
JOIN (
    SELECT _utf8mb4'oramwp@gmail.com' COLLATE utf8mb4_unicode_ci AS SystemEmail,
           _utf8mb4'oramm' COLLATE utf8mb4_unicode_ci AS GithubLogin
    UNION ALL
    SELECT _utf8mb4'kotalamichal02@gmail.com' COLLATE utf8mb4_unicode_ci,
           _utf8mb4'MicKota' COLLATE utf8mb4_unicode_ci
) seed ON PersonAccounts.SystemEmail COLLATE utf8mb4_unicode_ci = seed.SystemEmail
WHERE NOT EXISTS (SELECT 1 FROM SbAccess s WHERE s.PersonId = PersonAccounts.PersonId)
  AND NOT EXISTS (SELECT 1 FROM SbAccess s WHERE s.GithubLogin = seed.GithubLogin
                  AND s.PersonId <> PersonAccounts.PersonId);

-- Zdarzenie tylko dla istniejącego wpisu ręcznego z właściwym loginem.
-- Osoba pominięta z powodu konfliktu nie dostaje fikcyjnego zdarzenia sukcesu.
INSERT INTO SbAccessEvents (PersonId, ActionCode, RequestedByPersonId, ResultCode, Note)
SELECT PersonAccounts.PersonId, 'SEED', NULL, 'OK',
       'Wpis startowy: dostep nadany recznie przed uruchomieniem modulu'
FROM PersonAccounts
JOIN (
    SELECT _utf8mb4'oramwp@gmail.com' COLLATE utf8mb4_unicode_ci AS SystemEmail,
           _utf8mb4'oramm' COLLATE utf8mb4_unicode_ci AS GithubLogin
    UNION ALL
    SELECT _utf8mb4'kotalamichal02@gmail.com' COLLATE utf8mb4_unicode_ci,
           _utf8mb4'MicKota' COLLATE utf8mb4_unicode_ci
) seed ON PersonAccounts.SystemEmail COLLATE utf8mb4_unicode_ci = seed.SystemEmail
JOIN SbAccess s ON s.PersonId = PersonAccounts.PersonId
    AND s.GithubLogin = seed.GithubLogin AND s.IsGrantedManually = 1
WHERE NOT EXISTS (SELECT 1 FROM SbAccessEvents e
                  WHERE e.PersonId = PersonAccounts.PersonId AND e.ActionCode = 'SEED');
