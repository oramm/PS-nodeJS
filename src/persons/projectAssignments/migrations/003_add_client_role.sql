-- =====================================================
-- Migracja: rola systemowa CLIENT (klient)
-- Baza: MariaDB / MySQL
-- Klient kontraktu: ten sam zakres pracy co CONTRACT_WORKER (migracja 001),
-- czyli wyłącznie przypisane projekty z tabeli PersonProjects, plus podgląd
-- raportów z wizyt na budowie w tych projektach. Egzekwuje to warstwa
-- projectScopedPolicy w backendzie.
-- =====================================================

-- Id jawnie 7 z tego samego powodu co przy roli 6: frontend trzyma własną mapę ról
-- z numerami (ENVI.ProjectSite: MainSetupReact.SystemRoles), a autoinkrement rozjechałby
-- te dwa źródła. ExtendsId = NULL - rola nie leży w liniowej hierarchii ADMIN -> ... ->
-- EXTERNAL_USER, mimo że zakresem tras pokrywa CONTRACT_WORKER.
-- INSERT IGNORE: idempotentne, ponowne uruchomienie nie nadpisuje ręcznych zmian.
INSERT IGNORE INTO SystemRoles (Id, ExtendsId, Name, Description)
VALUES (
    7,
    NULL,
    'CLIENT',
    'Klient - praca operacyjna tylko w przypisanych projektach, dodatkowo raporty z wizyt na budowie'
);
