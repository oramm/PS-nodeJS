-- Persons V2 backfill (P1-B: backfill only, idempotent)
-- Date: 2026-02-09
-- Scope:
--   1) PersonAccounts from legacy Persons account fields
--   2) PersonProfiles for ENVI staff/cooperators and AchievementsExternal owners
--   3) PersonProfileExperiences 1:1 from AchievementsExternal

START TRANSACTION;

-- 1) Accounts backfill (idempotent upsert by UNIQUE PersonId).
--    If legacy SystemEmail duplicates exist, keep account row but store NULL email
--    to avoid violating uq_personaccounts_systememail.
INSERT INTO PersonAccounts (
    PersonId,
    SystemRoleId,
    SystemEmail,
    GoogleId,
    GoogleRefreshToken,
    IsActive
)
SELECT
    p.Id AS PersonId,
    p.SystemRoleId,
    CASE
        WHEN dup.SystemEmail IS NOT NULL THEN NULL
        ELSE NULLIF(TRIM(p.SystemEmail), '')
    END AS SystemEmail,
    NULLIF(TRIM(p.GoogleId), '') AS GoogleId,
    NULLIF(p.GoogleRefreshToken, '') AS GoogleRefreshToken,
    1 AS IsActive
FROM Persons p
LEFT JOIN (
    SELECT
        SystemEmail
    FROM Persons
    WHERE SystemEmail IS NOT NULL
      AND TRIM(SystemEmail) <> ''
    GROUP BY SystemEmail
    HAVING COUNT(*) > 1
) dup
    ON dup.SystemEmail = p.SystemEmail
WHERE p.SystemRoleId IS NOT NULL
   OR NULLIF(TRIM(p.SystemEmail), '') IS NOT NULL
   OR NULLIF(TRIM(p.GoogleId), '') IS NOT NULL
   OR NULLIF(p.GoogleRefreshToken, '') IS NOT NULL
ON DUPLICATE KEY UPDATE
    SystemRoleId = VALUES(SystemRoleId),
    SystemEmail = VALUES(SystemEmail),
    GoogleId = VALUES(GoogleId),
    GoogleRefreshToken = VALUES(GoogleRefreshToken);

-- 2) Profiles backfill for ENVI staff/cooperators and AchievementsExternal owners.
INSERT INTO PersonProfiles (
    PersonId,
    IsVisible
)
SELECT DISTINCT
    p.Id AS PersonId,
    1 AS IsVisible
FROM Persons p
LEFT JOIN SystemRoles sr
    ON sr.Id = p.SystemRoleId
LEFT JOIN AchievementsExternal ae
    ON ae.OwnerId = p.Id
WHERE sr.Name IN ('ENVI_MANAGER', 'ENVI_EMPLOYEE', 'ENVI_COOPERATOR')
   OR ae.Id IS NOT NULL
ON DUPLICATE KEY UPDATE
    PersonId = VALUES(PersonId);

-- 3) Experience backfill 1:1 from AchievementsExternal (idempotent by UNIQUE source ID).
INSERT INTO PersonProfileExperiences (
    PersonProfileId,
    SourceLegacyAchievementExternalId,
    OrganizationName,
    PositionName,
    Description,
    DateFrom,
    DateTo,
    IsCurrent,
    SortOrder
)
SELECT
    pp.Id AS PersonProfileId,
    ae.Id AS SourceLegacyAchievementExternalId,
    NULLIF(TRIM(ae.Employer), '') AS OrganizationName,
    NULLIF(TRIM(ae.RoleName), '') AS PositionName,
    NULLIF(TRIM(ae.Description), '') AS Description,
    ae.StartDate AS DateFrom,
    ae.EndDate AS DateTo,
    CASE WHEN ae.EndDate IS NULL THEN 1 ELSE 0 END AS IsCurrent,
    0 AS SortOrder
FROM AchievementsExternal ae
JOIN PersonProfiles pp
    ON pp.PersonId = ae.OwnerId
WHERE ae.OwnerId IS NOT NULL
ON DUPLICATE KEY UPDATE
    PersonProfileId = VALUES(PersonProfileId),
    OrganizationName = VALUES(OrganizationName),
    PositionName = VALUES(PositionName),
    Description = VALUES(Description),
    DateFrom = VALUES(DateFrom),
    DateTo = VALUES(DateTo),
    IsCurrent = VALUES(IsCurrent),
    SortOrder = VALUES(SortOrder);

COMMIT;
