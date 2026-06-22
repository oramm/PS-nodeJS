-- Funkcjonalność podspraw:
-- 1. Cases.ParentCaseId       — powiązanie podsprawy z przypadkiem nadrzędnym (ON DELETE CASCADE)
-- 2. CaseType_SubCaseTypes    — relacja many-to-many: które typy mogą być podsprawami którego rodzica
-- 3. CaseTypes.IsSubCaseOnly  — flaga: typ przeznaczony wyłącznie jako podsprawa (nie pojawia się w selektorze zwykłych spraw)
-- 4. CaseTypes.FolderNumber   — zmiana typu na VARCHAR(8) (dotychczas INT)

ALTER TABLE Cases
    ADD ParentCaseId INT NULL,
    ADD CONSTRAINT FK_Cases_ParentCaseId
        FOREIGN KEY (ParentCaseId) REFERENCES Cases(Id) ON DELETE CASCADE;

ALTER TABLE CaseTypes
    ADD IsSubCaseOnly TINYINT(1) NOT NULL DEFAULT 0,
    MODIFY COLUMN FolderNumber VARCHAR(8) NULL;

CREATE TABLE CaseType_SubCaseTypes (
    ParentCaseTypeId INT NOT NULL,
    SubCaseTypeId    INT NOT NULL,
    PRIMARY KEY (ParentCaseTypeId, SubCaseTypeId),
    CONSTRAINT FK_CSTSubTypes_Parent FOREIGN KEY (ParentCaseTypeId) REFERENCES CaseTypes(Id) ON DELETE CASCADE,
    CONSTRAINT FK_CSTSubTypes_Sub    FOREIGN KEY (SubCaseTypeId)    REFERENCES CaseTypes(Id) ON DELETE CASCADE
);
