-- Migracja: Nowy status faktury "Skorygowana"
-- Data: 2026-07-13
-- Cel: Faktura wysłana do KSeF, która została skorygowana, otrzymuje status
--      "Skorygowana" zamiast "Wycofana" (wycofanie zostaje dla faktur sprzed KSeF
--      lub wycofanych przed wysłaniem do KSeF).

ALTER TABLE `Invoices` CHANGE `Status` `Status` ENUM('Na później','Do zrobienia','Zrobiona','Wysłana','Gotowa do wysłania KSeF','Wysłana do KSeF','Zapłacona','Wycofana','Do korekty','Odrzucona przez KSeF','Skorygowana') CHARACTER SET utf8 COLLATE utf8_polish_ci NOT NULL;
