-- Migracja: Przechowywanie rzeczywistego XML wysłanego do KSeF
-- Data: 2026-07-17
-- Cel: Podgląd/XML faktury już wysłanej ma pokazywać dane rzeczywiście wysłane
--      do KSeF, a nie generowane na nowo z aktualnego stanu faktury w bazie.

ALTER TABLE InvoiceKsefMetadata
    ADD COLUMN IF NOT EXISTS SentXml LONGTEXT NULL
    COMMENT 'Rzeczywisty XML faktury wysłany do KSeF (podgląd danych wysłanych)';
