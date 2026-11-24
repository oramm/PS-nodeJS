ALTER TABLE BankTransfers
    ADD COLUMN IF NOT EXISTS VersionConfirmedThrough DATE NULL,
    ADD COLUMN IF NOT EXISTS VersionSourceFrom DATE NULL,
    ADD COLUMN IF NOT EXISTS VersionSourceTo DATE NULL,
    ADD COLUMN IF NOT EXISTS ReviewAsPayment TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ImportNeedsReview TINYINT(1) NOT NULL DEFAULT 0;

-- Preserve state from the legacy envelope and leave candidate arrays and SQL NULL untouched.
UPDATE BankTransfers
SET VersionConfirmedThrough = COALESCE(JSON_VALUE(MatchingCandidates, '$.confirmedThrough'), VersionConfirmedThrough),
    VersionSourceFrom = COALESCE(JSON_VALUE(MatchingCandidates, '$.importSource.from'), VersionSourceFrom),
    VersionSourceTo = COALESCE(JSON_VALUE(MatchingCandidates, '$.importSource.to'), VersionSourceTo),
    ReviewAsPayment = GREATEST(ReviewAsPayment, COALESCE(JSON_VALUE(MatchingCandidates, '$.reviewAsPayment') = 1, 0)),
    ImportNeedsReview = GREATEST(ImportNeedsReview, COALESCE(JSON_VALUE(MatchingCandidates, '$.importNeedsReview') = 1, 0)),
    MatchingCandidates = CASE
        WHEN JSON_TYPE(JSON_EXTRACT(MatchingCandidates, '$.candidates')) = 'ARRAY'
        THEN JSON_EXTRACT(MatchingCandidates, '$.candidates')
        ELSE NULL
    END
WHERE JSON_TYPE(MatchingCandidates) = 'OBJECT';
