-- Numery pism bez numeru zawieraja pelny numer kontraktu, date i licznik.
-- Dotychczasowe limity bazy byly krotsze od wartosci dopuszczanych przez formularz.

ALTER TABLE Letters
    MODIFY COLUMN Number VARCHAR(64) NULL,
    MODIFY COLUMN Status VARCHAR(30) NOT NULL,
    MODIFY COLUMN RelatedLetterNumber VARCHAR(64) NOT NULL,
    MODIFY COLUMN ResponseIKNumber VARCHAR(40) NOT NULL;

UPDATE Letters
SET Status = 'Nie wymaga odpowiedzi'
WHERE Status = 'Nie wymaga odpowiedz';
