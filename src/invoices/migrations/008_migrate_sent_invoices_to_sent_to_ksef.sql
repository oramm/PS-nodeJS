-- Migracja: faktury "Wysłana" z danymi KSeF → "Wysłana do KSeF"
--
-- Kryterium: faktura ma status "Wysłana" ORAZ posiada co najmniej jeden z:
--   - KsefSessionId  (sesja wysyłki - faktura była wysłana, nawet jeśli jeszcze nie potwierdzona)
--   - KsefNumber     (numer KSeF - faktura przyjęta przez KSeF)
--
-- Faktury "Wysłana" bez żadnych danych KSeF (stary flow - tylko papier/email) pozostają bez zmian.

-- ============================================================
-- 1. Podgląd - co zostanie zmienione (uruchom najpierw SELECT)
-- ============================================================
/*
SELECT Id, Number, Status, KsefSessionId, KsefNumber
FROM Invoices
WHERE Status = 'Wysłana'
  AND (KsefSessionId IS NOT NULL OR KsefNumber IS NOT NULL)
ORDER BY Id;
*/

-- ============================================================
-- 2. Właściwa migracja
-- ============================================================
UPDATE Invoices
SET Status = 'Wysłana do KSeF'
WHERE Status = 'Wysłana'
  AND (KsefSessionId IS NOT NULL OR KsefNumber IS NOT NULL);

-- ============================================================
-- 3. Weryfikacja po migracji
-- ============================================================
/*
SELECT Status, COUNT(*) AS Ilosc
FROM Invoices
WHERE Status IN ('Wysłana', 'Wysłana do KSeF')
GROUP BY Status;
*/

-- ============================================================
-- 4. Rollback (jeśli trzeba cofnąć)
-- ============================================================
/*
UPDATE Invoices
SET Status = 'Wysłana'
WHERE Status = 'Wysłana do KSeF';
*/
