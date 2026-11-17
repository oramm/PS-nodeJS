-- Operational rollback: disable/revert application writers and RETAIN this table.
-- Schema rollback below is allowed only before any links are stored, with writers stopped.
-- MariaDB anonymous block; no DELIMITER directive (executed through mysql2).
-- After successful empty-table DROP remove only the matching forward migration receipt.
BEGIN NOT ATOMIC
    IF EXISTS (
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MilestoneContractLinks'
    ) THEN
        IF EXISTS (SELECT 1 FROM MilestoneContractLinks LIMIT 1) THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'PS-MC: retain populated MilestoneContractLinks on rollback';
        END IF;
        DROP TABLE MilestoneContractLinks;
    END IF;
END;