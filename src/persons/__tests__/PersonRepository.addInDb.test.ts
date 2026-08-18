import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import PersonRepository from '../PersonRepository';
import Person from '../Person';
import ToolsDb from '../../tools/ToolsDb';

jest.mock('../../tools/ToolsDb');

const addInDbMock = ToolsDb.addInDb as unknown as jest.Mock;

/**
 * Regresja: `Persons` nie ma kolumn pol konta - one mieszkaja w `PersonAccounts`.
 * Generyczny INSERT w ToolsDb bierze kazde pole bez prefiksu `_`, wiec `fidmanEnabled`
 * jadace w modelu `Person` wywracalo cale dodawanie osoby na
 * 500 "Unknown column 'FidmanEnabled' in 'INSERT INTO'".
 */
describe('PersonRepository.addInDb - pola konta nie trafiaja do INSERT na Persons', () => {
    let repository: PersonRepository;

    beforeEach(() => {
        repository = new PersonRepository();
        addInDbMock.mockReset();
        addInDbMock.mockImplementation(async (_table: any, object: any) => {
            object.id = 999;
            return object;
        });
    });

    function insertedRow() {
        return addInDbMock.mock.calls[0][1] as Record<string, unknown>;
    }

    it('nie wysyla fidmanEnabled do tabeli Persons', async () => {
        await repository.addInDb(
            new Person({
                name: 'Anna',
                surname: 'Nowak',
                _entity: { id: 422 },
                fidmanEnabled: true,
            }),
        );

        expect(addInDbMock).toHaveBeenCalledTimes(1);
        expect(insertedRow()).not.toHaveProperty('fidmanEnabled');
    });

    it('nie wysyla roli ani e-maila systemowego - konto zaklada wylacznie trasa v2', async () => {
        await repository.addInDb(
            new Person({
                name: 'Anna',
                surname: 'Nowak',
                _entity: { id: 422 },
                systemRoleId: 3,
                systemEmail: 'anna@envi.com.pl',
            }),
        );

        expect(insertedRow()).not.toHaveProperty('systemRoleId');
        expect(insertedRow()).not.toHaveProperty('systemEmail');
    });

    it('przepuszcza pola osoby', async () => {
        await repository.addInDb(
            new Person({
                name: 'Anna',
                surname: 'Nowak',
                position: 'Projektant',
                cellphone: '600100200',
                _entity: { id: 422 },
                fidmanEnabled: true,
            }),
        );

        expect(insertedRow()).toMatchObject({
            name: 'Anna',
            surname: 'Nowak',
            position: 'Projektant',
            cellphone: '600100200',
            entityId: 422,
        });
    });

    it('przepisuje nadane id z powrotem na obiekt wolajacego', async () => {
        // POST /person oddaje id klientowi, ktory dopiero nim wola trase konta v2.
        // Bez przepisania id zostaloby na kopii i nowy uzytkownik nigdy nie dostalby konta.
        const person = new Person({
            name: 'Anna',
            surname: 'Nowak',
            _entity: { id: 422 },
            fidmanEnabled: true,
        });

        const result = await repository.addInDb(person);

        expect(person.id).toBe(999);
        expect(result).toBe(person);
    });
});
