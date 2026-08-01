-- PS ENVI - weryfikacja przelotu maskujacego (patrz scripts/mask-local-db.sql).
--
-- Zwraca wiersze `rodzaj | etykieta | liczba`:
--   ZOSTALO     - wartosci, ktore powinny byc zamaskowane, a nie sa. Kazda > 0 to blad.
--   ZAMASKOWANE - ile wartosci realnie podmieniono. Suma == 0 to TEZ blad:
--                 cichy przelot, ktory nic nie trafil, daje falszywe poczucie bezpieczenstwa.
--
-- Interpretacje i przerwanie przy bledzie robi scripts/refresh-local-db.ps1.

SELECT 'ZOSTALO' AS rodzaj, 'Entities.Name' AS etykieta, COUNT(*) AS liczba
  FROM Entities WHERE Name NOT LIKE 'Podmiot %'
UNION ALL SELECT 'ZOSTALO', 'Entities.TaxNumber', COUNT(*)
  FROM Entities WHERE TaxNumber IS NOT NULL AND TaxNumber <> '' AND TaxNumber NOT REGEXP '^[0-9]{10}$'
UNION ALL SELECT 'ZOSTALO', 'Entities.Email', COUNT(*)
  FROM Entities WHERE Email IS NOT NULL AND Email <> '' AND Email NOT LIKE '%@local.test'
UNION ALL SELECT 'ZOSTALO', 'Persons.Surname', COUNT(*)
  FROM Persons WHERE Surname IS NOT NULL AND Surname <> '' AND Surname NOT LIKE 'Nazwisko %'
UNION ALL SELECT 'ZOSTALO', 'Persons.Email', COUNT(*)
  FROM Persons WHERE Email IS NOT NULL AND Email <> '' AND Email NOT LIKE '%@local.test'
UNION ALL SELECT 'ZOSTALO', 'Persons.SystemEmail', COUNT(*)
  FROM Persons WHERE SystemEmail IS NOT NULL AND SystemEmail <> '' AND SystemEmail NOT LIKE '%@local.test'
UNION ALL SELECT 'ZOSTALO', 'Persons.GoogleRefreshToken', COUNT(*)
  FROM Persons WHERE GoogleRefreshToken IS NOT NULL
UNION ALL SELECT 'ZOSTALO', 'PersonAccounts.SystemEmail', COUNT(*)
  FROM PersonAccounts WHERE SystemEmail IS NOT NULL AND SystemEmail <> '' AND SystemEmail NOT LIKE '%@local.test'
UNION ALL SELECT 'ZOSTALO', 'PersonAccounts.tokeny', COUNT(*)
  FROM PersonAccounts WHERE GoogleRefreshToken IS NOT NULL OR MicrosoftRefreshToken IS NOT NULL
UNION ALL SELECT 'ZOSTALO', 'CostInvoices.SupplierName', COUNT(*)
  FROM CostInvoices WHERE SupplierName IS NOT NULL AND SupplierName <> '' AND SupplierName NOT LIKE 'Dostawca %'
UNION ALL SELECT 'ZOSTALO', 'BankTransfers.CounterpartyName', COUNT(*)
  FROM BankTransfers WHERE CounterpartyName IS NOT NULL AND CounterpartyName <> '' AND CounterpartyName NOT LIKE 'Kontrahent %'
UNION ALL SELECT 'ZOSTALO', 'Offers.EmployerName', COUNT(*)
  FROM Offers WHERE EmployerName IS NOT NULL AND EmployerName <> '' AND EmployerName NOT LIKE 'Zamawiajacy %'
UNION ALL SELECT 'ZOSTALO', 'PublicProfileSubmissions.Email', COUNT(*)
  FROM PublicProfileSubmissions WHERE Email IS NOT NULL AND Email <> '' AND Email NOT LIKE '%@local.test'

UNION ALL SELECT 'ZAMASKOWANE', 'Entities.Name', COUNT(*)
  FROM Entities WHERE Name LIKE 'Podmiot %'
UNION ALL SELECT 'ZAMASKOWANE', 'Entities.Email', COUNT(*)
  FROM Entities WHERE Email LIKE '%@local.test'
UNION ALL SELECT 'ZAMASKOWANE', 'Persons.Surname', COUNT(*)
  FROM Persons WHERE Surname LIKE 'Nazwisko %'
UNION ALL SELECT 'ZAMASKOWANE', 'Persons.SystemEmail', COUNT(*)
  FROM Persons WHERE SystemEmail LIKE '%@local.test'
UNION ALL SELECT 'ZAMASKOWANE', 'PersonAccounts.SystemEmail', COUNT(*)
  FROM PersonAccounts WHERE SystemEmail LIKE '%@local.test'
UNION ALL SELECT 'ZAMASKOWANE', 'CostInvoices.SupplierName', COUNT(*)
  FROM CostInvoices WHERE SupplierName LIKE 'Dostawca %'
UNION ALL SELECT 'ZAMASKOWANE', 'BankTransfers.CounterpartyName', COUNT(*)
  FROM BankTransfers WHERE CounterpartyName LIKE 'Kontrahent %'
UNION ALL SELECT 'ZAMASKOWANE', 'Offers.EmployerName', COUNT(*)
  FROM Offers WHERE EmployerName LIKE 'Zamawiajacy %';
