-- Migration: Add scrumboard hours columns to Tasks table
-- Table: Tasks
-- Purpose: Store estimated hours (dawniej kolumna "szac. czas" w arkuszu scrumboard)
--          and reported daily hours Mon-Fri (dawniej kolumny PON.-PT. w arkuszu).
--          Columns are nullable - existing records unaffected.
--          Daily hours represent the CURRENT sprint week only (no history);
--          weekly reset sets them back to NULL.

ALTER TABLE Tasks
    ADD COLUMN EstimatedHours DECIMAL(5,2) NULL DEFAULT NULL COMMENT 'szac. czas [h] - scrumboard',
    ADD COLUMN HoursMon DECIMAL(4,2) NULL DEFAULT NULL COMMENT 'godziny PON. - scrumboard',
    ADD COLUMN HoursTue DECIMAL(4,2) NULL DEFAULT NULL COMMENT 'godziny WTO. - scrumboard',
    ADD COLUMN HoursWed DECIMAL(4,2) NULL DEFAULT NULL COMMENT 'godziny SR. - scrumboard',
    ADD COLUMN HoursThu DECIMAL(4,2) NULL DEFAULT NULL COMMENT 'godziny CZW. - scrumboard',
    ADD COLUMN HoursFri DECIMAL(4,2) NULL DEFAULT NULL COMMENT 'godziny PT. - scrumboard';
