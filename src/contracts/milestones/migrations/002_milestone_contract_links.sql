-- PS-MC-1: additional associations only; Milestones.ContractId remains authoritative.
-- No backfill. Enable application writers only after PS-MC-2 lifecycle guards.
CREATE TABLE IF NOT EXISTS MilestoneContractLinks (
    MilestoneId INT NOT NULL,
    ContractId INT NOT NULL,
    PRIMARY KEY (MilestoneId, ContractId),
    KEY IX_MilestoneContractLinks_Contract (ContractId),
    CONSTRAINT FK_MilestoneContractLinks_Milestone FOREIGN KEY (MilestoneId)
        REFERENCES Milestones (Id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT FK_MilestoneContractLinks_Contract FOREIGN KEY (ContractId)
        REFERENCES Contracts (Id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;