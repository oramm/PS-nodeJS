-- Osobisty klucz agenta pracownika (plan SBZ, checkpoint SBZ-1).
-- Instalator SB losuje klucz na komputerze osoby i wysyla do PS tylko jego skrot SHA-256
-- (PUT /sbAccess/me/agentKey, tokenem urzadzenia). Agent osoby wchodzi do PS tym kluczem
-- w naglowku x-envi-sb-agent-key i dziala jako ta osoba ze znakiem "agent"
-- (src/sbAccess/sbAgentKeyAuth.ts), tylko przy dostepie ACTIVE i poziomie "baza PS: zapis".
-- UNIQUE: osoba jest wyszukiwana po skrocie, dwie osoby z tym samym skrotem sa wykluczone;
-- NULL (brak klucza) moze wystapic wielokrotnie.

ALTER TABLE SbAccess
    ADD COLUMN IF NOT EXISTS AgentKeyHash CHAR(64) NULL COMMENT 'SHA-256 (hex) osobistego klucza agenta; nigdy sam klucz',
    ADD COLUMN IF NOT EXISTS AgentKeySetAt DATETIME NULL COMMENT 'Czas rejestracji klucza agenta';

ALTER TABLE SbAccess
    ADD UNIQUE KEY IF NOT EXISTS uq_sbaccess_agentkeyhash (AgentKeyHash);

INSERT IGNORE INTO SbAccessActions (Code, Name) VALUES
    ('SET_AGENT_KEY', 'Rejestracja klucza agenta');
