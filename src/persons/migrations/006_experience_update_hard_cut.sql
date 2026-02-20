-- Experience Update hard-cut migration
-- Date: 2026-02-20

ALTER TABLE PublicProfileSubmissions
    ADD COLUMN LastActiveLinkUrl VARCHAR(2048) NULL AFTER LastLinkEventByPersonId,
    ADD COLUMN LastActiveLinkExpiresAt DATETIME NULL AFTER LastActiveLinkUrl,
    ADD INDEX idx_publicprofilesubmissions_last_active_link_expires (LastActiveLinkExpiresAt);

ALTER TABLE PublicProfileSubmissionItems
    ADD COLUMN ReviewComment TEXT NULL AFTER ReviewedAt;

-- Keep only one active process per person.
-- Latest active (UpdatedAt/Id) remains active, older active rows become closed.
UPDATE PublicProfileSubmissions s
JOIN (
    SELECT PersonId, MAX(Id) AS KeepId
    FROM PublicProfileSubmissions
    WHERE Status IN ('DRAFT', 'SUBMITTED')
    GROUP BY PersonId
) keep_row ON keep_row.PersonId = s.PersonId
SET s.Status = 'CLOSED',
    s.ClosedAt = COALESCE(s.ClosedAt, UTC_TIMESTAMP()),
    s.UpdatedAt = UTC_TIMESTAMP()
WHERE s.Status IN ('DRAFT', 'SUBMITTED')
  AND s.Id <> keep_row.KeepId;

-- Revoke links for any rows closed by the consolidation step.
UPDATE PublicProfileSubmissionLinks l
JOIN PublicProfileSubmissions s ON s.LinkId = l.Id
SET l.RevokedAt = COALESCE(l.RevokedAt, UTC_TIMESTAMP()),
    l.UpdatedAt = UTC_TIMESTAMP()
WHERE s.Status = 'CLOSED'
  AND l.RevokedAt IS NULL;
