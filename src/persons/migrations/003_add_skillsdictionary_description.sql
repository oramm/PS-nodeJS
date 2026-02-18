-- Persons V2 schema update: SkillsDictionary description
-- Date: 2026-02-18
-- Scope: add optional Description field for dictionary skills

ALTER TABLE SkillsDictionary
    ADD COLUMN IF NOT EXISTS Description TEXT NULL AFTER NameNormalized;
