-- Skrot tokenu urzadzenia jednoznaczny (poprawka po przegladzie planu SBD).
-- Instalator wchodzi do PS samym tokenem, wiec osoba jest wyszukiwana po DeviceTokenHash:
-- indeks przyspiesza to wyszukiwanie, a UNIQUE wyklucza dwie osoby z tym samym skrotem.
-- NULL (brak tokenu) moze wystapic wielokrotnie - tak dziala UNIQUE w MariaDB.

ALTER TABLE SbAccess
    ADD UNIQUE KEY IF NOT EXISTS uq_sbaccess_devicetokenhash (DeviceTokenHash);
