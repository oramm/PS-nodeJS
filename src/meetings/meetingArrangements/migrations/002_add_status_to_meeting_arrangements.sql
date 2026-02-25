-- Migration 002: Add Status column to MeetingArrangements
-- Status: PLANNED -> DISCUSSED -> CLOSED
-- Default: PLANNED, NOT NULL

ALTER TABLE MeetingArrangements
    ADD COLUMN Status VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
    AFTER OwnerId;

-- Verify constraint via application layer (Controller validates transitions)
