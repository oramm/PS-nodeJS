-- =====================================================
-- Migracja: rola systemowa CONTRACT_WORKER (pracownik kontraktowy)
-- Baza: MariaDB / MySQL
-- Osoba z zewnątrz pracująca operacyjnie wyłącznie na przypisanych projektach
-- (tabela PersonProjects, migracja 002). Bez faktur, ofert, dotacji i zarządzania
-- użytkownikami - egzekwuje to warstwa contractWorkerPolicy w backendzie.
-- =====================================================

-- Id jawnie 6, bo frontend trzyma własną mapę ról z numerami
-- (ENVI.ProjectSite: MainSetupReact.SystemRoles). Autoinkrement rozjechałby te dwa źródła.
-- ExtendsId = NULL: kolumna nie jest używana w kodzie, a rola nie leży w liniowej
-- hierarchii ADMIN -> ENVI_MANAGER -> ENVI_EMPLOYEE -> ENVI_COOPERATOR -> EXTERNAL_USER.
-- INSERT IGNORE: idempotentne, ponowne uruchomienie nie nadpisuje ręcznych zmian.
INSERT IGNORE INTO SystemRoles (Id, ExtendsId, Name, Description)
VALUES (
    6,
    NULL,
    'CONTRACT_WORKER',
    'Pracownik kontraktowy - praca operacyjna tylko w przypisanych projektach'
);
