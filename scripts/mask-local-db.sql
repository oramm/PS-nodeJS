-- PS ENVI - przelot maskujacy kolumny identyfikujace w LOKALNEJ kopii bazy.
--
-- URUCHAMIAC WYLACZNIE przez scripts/refresh-local-db.ps1, ktory pilnuje,
-- ze celem jest localhost i baza inna niz `envikons_myEnvi`.
-- NIGDY nie puszczac tego pliku na kylos ani na wspoldzielona kopie `envikons_myEnvi`.
--
-- Zasada: maskujemy WYLACZNIE kolumny identyfikujace (nazwy podmiotow, NIP-y,
-- adresy, dane kontaktowe osob) oraz zywe poswiadczenia. Kwoty, daty, statusy,
-- liczby wierszy i rozklad NULL-i zostaja prawdziwe - o to chodzi w tej bazie.
-- NULL i pusty lancuch zostaja nietkniete, zeby nie zmienic ksztaltu danych.
-- Wyjatek swiadomy: kolumny z tokenami odswiezajacymi sa zerowane bezwarunkowo
-- (zywe poswiadczenie nie ma prawa lezec w kopii roboczej).

SET SQL_SAFE_UPDATES = 0;

-- ---------------------------------------------------------------- Entities
UPDATE Entities SET
  Name = CONCAT('Podmiot ', LPAD(Id, 4, '0')),
  ShortName = CASE WHEN ShortName IS NULL OR ShortName = '' THEN ShortName
                   ELSE CONCAT('PDM-', LPAD(Id, 4, '0')) END,
  Address = CASE WHEN Address IS NULL OR Address = '' THEN Address
                 ELSE CONCAT('ul. Testowa 1, 00-000 Miejscowosc ', LPAD(Id, 4, '0')) END,
  TaxNumber = CASE WHEN TaxNumber IS NULL OR TaxNumber = '' THEN TaxNumber
                   ELSE LPAD(Id, 10, '0') END,
  Www = CASE WHEN Www IS NULL OR Www = '' THEN Www
             ELSE CONCAT('https://podmiot-', LPAD(Id, 4, '0'), '.local.test') END,
  Email = CASE WHEN Email IS NULL OR Email = '' THEN Email
               ELSE CONCAT('podmiot-', LPAD(Id, 4, '0'), '@local.test') END,
  Phone = CASE WHEN Phone IS NULL OR Phone = '' THEN Phone ELSE '+48 000 000 000' END,
  Fax = CASE WHEN Fax IS NULL OR Fax = '' THEN Fax ELSE '+48 000 000 000' END,
  BankAccountNumber = CASE WHEN BankAccountNumber IS NULL OR BankAccountNumber = ''
                           THEN BankAccountNumber
                           ELSE CONCAT('PL', LPAD(Id, 24, '0')) END;

-- ----------------------------------------------------------------- Persons
UPDATE Persons SET
  Name = CASE WHEN Name IS NULL OR Name = '' THEN Name
              ELSE CONCAT('Imie', LPAD(Id, 4, '0')) END,
  Surname = CASE WHEN Surname IS NULL OR Surname = '' THEN Surname
                 ELSE CONCAT('Nazwisko ', LPAD(Id, 4, '0')) END,
  Email = CASE WHEN Email IS NULL OR Email = '' THEN Email
               ELSE CONCAT('osoba-', LPAD(Id, 4, '0'), '@local.test') END,
  Cellphone = CASE WHEN Cellphone IS NULL OR Cellphone = '' THEN Cellphone
                   ELSE '+48 000 000 000' END,
  Phone = CASE WHEN Phone IS NULL OR Phone = '' THEN Phone ELSE '+48 000 000 000' END,
  SystemEmail = CASE WHEN SystemEmail IS NULL OR SystemEmail = '' THEN SystemEmail
                     ELSE CONCAT('osoba-', LPAD(Id, 4, '0'), '@local.test') END,
  GoogleId = CASE WHEN GoogleId IS NULL OR GoogleId = '' THEN GoogleId
                  ELSE CONCAT('gid-', Id) END,
  GoogleRefreshToken = NULL;

-- ---------------------------------------------------------- PersonAccounts
UPDATE PersonAccounts SET
  SystemEmail = CASE WHEN SystemEmail IS NULL OR SystemEmail = '' THEN SystemEmail
                     ELSE CONCAT('konto-', LPAD(Id, 4, '0'), '@local.test') END,
  GoogleId = CASE WHEN GoogleId IS NULL OR GoogleId = '' THEN GoogleId
                  ELSE CONCAT('gid-', Id) END,
  MicrosoftId = CASE WHEN MicrosoftId IS NULL OR MicrosoftId = '' THEN MicrosoftId
                     ELSE CONCAT('mid-', Id) END,
  GoogleRefreshToken = NULL,
  MicrosoftRefreshToken = NULL;

-- ------------------------------------------------------------ CostInvoices
UPDATE CostInvoices SET
  SupplierName = CASE WHEN SupplierName IS NULL OR SupplierName = '' THEN SupplierName
                      ELSE CONCAT('Dostawca ', LPAD(Id, 4, '0')) END,
  SupplierNip = CASE WHEN SupplierNip IS NULL OR SupplierNip = '' THEN SupplierNip
                     ELSE LPAD(Id, 10, '0') END,
  SupplierAddress = CASE WHEN SupplierAddress IS NULL OR SupplierAddress = ''
                         THEN SupplierAddress
                         ELSE CONCAT('ul. Testowa 1, 00-000 Miejscowosc ', LPAD(Id, 4, '0')) END,
  SupplierBankAccount = CASE WHEN SupplierBankAccount IS NULL OR SupplierBankAccount = ''
                             THEN SupplierBankAccount
                             ELSE CONCAT('PL', LPAD(Id, 24, '0')) END;

-- ------------------------------------------------------------ BankTransfers
UPDATE BankTransfers SET
  CounterpartyName = CASE WHEN CounterpartyName IS NULL OR CounterpartyName = ''
                          THEN CounterpartyName
                          ELSE CONCAT('Kontrahent ', LPAD(Id, 5, '0')) END,
  CounterpartyNip = CASE WHEN CounterpartyNip IS NULL OR CounterpartyNip = ''
                         THEN CounterpartyNip
                         ELSE LPAD(Id, 10, '0') END;

-- ------------------------------------------------------------------ Offers
UPDATE Offers SET
  EmployerName = CASE WHEN EmployerName IS NULL OR EmployerName = '' THEN EmployerName
                      ELSE CONCAT('Zamawiajacy ', LPAD(Id, 4, '0')) END;

-- --------------------------------------------------- Profile publiczne osob
UPDATE PersonProfileEducations SET
  SchoolName = CASE WHEN SchoolName IS NULL OR SchoolName = '' THEN SchoolName
                    ELSE CONCAT('Szkola ', LPAD(Id, 4, '0')) END;

UPDATE PersonProfileExperiences SET
  OrganizationName = CASE WHEN OrganizationName IS NULL OR OrganizationName = ''
                          THEN OrganizationName
                          ELSE CONCAT('Organizacja ', LPAD(Id, 4, '0')) END;

UPDATE PublicProfileSubmissions SET
  Email = CASE WHEN Email IS NULL OR Email = '' THEN Email
               ELSE CONCAT('zgloszenie-', LPAD(Id, 4, '0'), '@local.test') END,
  LastLinkRecipientEmail = CASE WHEN LastLinkRecipientEmail IS NULL OR LastLinkRecipientEmail = ''
                                THEN LastLinkRecipientEmail
                                ELSE CONCAT('zgloszenie-', LPAD(Id, 4, '0'), '@local.test') END;

UPDATE PublicProfileSubmissionSessions SET
  Email = CASE WHEN Email IS NULL OR Email = '' THEN Email
               ELSE CONCAT('sesja-', LPAD(Id, 4, '0'), '@local.test') END;

UPDATE PublicProfileSubmissionVerifyChallenges SET
  Email = CASE WHEN Email IS NULL OR Email = '' THEN Email
               ELSE CONCAT('wyzwanie-', LPAD(Id, 4, '0'), '@local.test') END;
