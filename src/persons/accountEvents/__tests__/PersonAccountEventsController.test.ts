import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import PersonAccountEventRepository from '../PersonAccountEventRepository';
import PersonAccountEventsController, {
    serializeValue,
} from '../PersonAccountEventsController';

/**
 * ROD-3: zdarzenia konta pisze kontroler w transakcji wołającego - jedno na każdą FAKTYCZNIE
 * zmienioną wartość, z autorem z sesji i wartościami przed/po jako JSON. „Zapisz bez zmian"
 * nie zostawia śladu.
 */
describe('PersonAccountEventsController.recordChanges (ROD-3)', () => {
    const conn = { threadId: 1 } as any;
    let addInDb: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        addInDb = jest
            .spyOn(PersonAccountEventRepository.prototype, 'addInDb')
            .mockResolvedValue(undefined as any);
    });

    it('pisze jedno zdarzenie na kazda zmieniona wartosc, z autorem i JSON przed/po, w transakcji wolajacego', async () => {
        const written = await PersonAccountEventsController.recordChanges(conn, {
            personId: 613,
            editorId: 125,
            eventType: 'ACCOUNT',
            changes: [
                { field: 'systemRoleId', before: 5, after: 2 },
                { field: 'systemEmail', before: 'a@x.pl', after: 'a@x.pl' }, // bez zmiany
                { field: 'isActive', before: undefined, after: true },
            ],
        });

        expect(written).toBe(2);
        expect(addInDb).toHaveBeenCalledTimes(2);

        const [firstEvent, firstConn, firstInTx] = addInDb.mock.calls[0];
        expect(firstEvent).toMatchObject({
            personId: 613,
            editorId: 125,
            eventType: 'ACCOUNT',
            field: 'systemRoleId',
            valueBefore: '5',
            valueAfter: '2',
        });
        expect(firstConn).toBe(conn);
        expect(firstInTx).toBe(true);

        const [secondEvent] = addInDb.mock.calls[1];
        expect(secondEvent).toMatchObject({
            field: 'isActive',
            valueBefore: null,
            valueAfter: 'true',
        });
    });

    it('brak zmian = zero zdarzen i zero zapisow', async () => {
        const written = await PersonAccountEventsController.recordChanges(conn, {
            personId: 613,
            editorId: null,
            eventType: 'STAFF_FLAGS',
            changes: [{ field: 'isDriver', before: true, after: true }],
        });
        expect(written).toBe(0);
        expect(addInDb).not.toHaveBeenCalled();
    });

    it('brak autora zostawia editorId pusty (NULL w bazie) i nie blokuje zapisu; listy projektow porownywane bez kolejnosci', async () => {
        await PersonAccountEventsController.recordChanges(conn, {
            personId: 613,
            editorId: undefined,
            eventType: 'PROJECT_ASSIGNMENTS',
            changes: [
                { field: 'projectOurIds', before: ['B', 'A'], after: ['A'] },
            ],
        });
        expect(addInDb).toHaveBeenCalledTimes(1);
        const [event] = addInDb.mock.calls[0];
        expect(event.editorId).toBeUndefined();
        expect(event).toMatchObject({
            eventType: 'PROJECT_ASSIGNMENTS',
            field: 'projectOurIds',
            valueBefore: '["A","B"]',
            valueAfter: '["A"]',
        });
    });
});

describe('serializeValue', () => {
    it('null/undefined -> null; tablice sortowane; reszta jako JSON', () => {
        expect(serializeValue(undefined)).toBeNull();
        expect(serializeValue(null)).toBeNull();
        expect(serializeValue(['b', 'a'])).toBe('["a","b"]');
        expect(serializeValue(['a', 'b'])).toBe(serializeValue(['b', 'a']));
        expect(serializeValue(false)).toBe('false');
        expect(serializeValue(2)).toBe('2');
        expect(serializeValue('x@y.pl')).toBe('"x@y.pl"');
    });
});
