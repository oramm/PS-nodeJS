-- SPR-P: opcjonalne dane dofinansowania projektu PS -> FIDman.
ALTER TABLE Projects
    ADD COLUMN IF NOT EXISTS FundingAgreementNumber VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS Program VARCHAR(50) NULL;
