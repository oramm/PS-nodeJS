-- FIN jest osobnym wyborem dostępu, niezależnym od FIDmana.
ALTER TABLE PersonAccounts
    ADD COLUMN IF NOT EXISTS FinEnabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Czy osoba ma konto w FIN';
