-- =====================================================
-- Migracja: PersonProjects - przypisanie osoby do projektów
-- Baza: MariaDB / MySQL
-- Źródło zakresu danych dla roli CONTRACT_WORKER: wszystkie odczyty i zapisy tej
-- roli są filtrowane po liście ProjectOurId z tej tabeli. Brak wierszy = brak dostępu.
-- =====================================================

-- Kluczem jest ProjectOurId (a nie Projects.Id), bo cała reszta schematu wiąże
-- projekt z kontraktem przez Contracts.ProjectOurId - dzięki temu filtr zakresu
-- nie wymaga dokładania JOIN-a z Projects w kilkunastu zapytaniach.
-- Kolacja utf8_polish_ci musi być zgodna z Projects.OurId, inaczej FK się nie utworzy.
CREATE TABLE IF NOT EXISTS PersonProjects (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonId INT NOT NULL,
    ProjectOurId VARCHAR(20) CHARACTER SET utf8 COLLATE utf8_polish_ci NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UQ_PersonProjects_Person_Project (PersonId, ProjectOurId),
    KEY IX_PersonProjects_ProjectOurId (ProjectOurId),
    CONSTRAINT FK_PersonProjects_Person FOREIGN KEY (PersonId)
        REFERENCES Persons(Id) ON DELETE CASCADE,
    CONSTRAINT FK_PersonProjects_Project FOREIGN KEY (ProjectOurId)
        REFERENCES Projects(OurId) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_polish_ci;
