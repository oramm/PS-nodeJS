import PersonsController from '../PersonsController';
import PersonReferencesRepository, {
    describeBlockers,
} from '../personReferences/PersonReferencesRepository';

// ROD-6, decyzja ownera D-ROD-2 = (c): „zakaz kasowania osob z powiazaniami".
// Twarde kasowanie zostaje tylko dla osoby bez sladu; osoba z powiazaniami dostaje 409 z lista.
// Mockujemy WYLACZNIE domyslny eksport (klase repozytorium), zeby prawdziwa describeBlockers
// (i uzywajacy jej PersonDeleteBlockedError) dzialaly - auto-mock calego modulu zwracalby undefined.
jest.mock('../personReferences/PersonReferencesRepository', () => {
    const actual = jest.requireActual(
        '../personReferences/PersonReferencesRepository',
    );
    return { __esModule: true, ...actual, default: jest.fn() };
});

describe('ROD-6: DELETE /person blokuje osobe z powiazaniami (D-ROD-2 = c)', () => {
    const countReferences = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (PersonReferencesRepository as unknown as jest.Mock).mockImplementation(
            () => ({ countReferences }),
        );
    });

    it('odmawia 409 z lista blockers, gdy osoba ma powiazania', async () => {
        countReferences.mockResolvedValue(
            new Map([[5, [{ ref: 'Tasks.OwnerId', count: 3 }]]]),
        );
        const deleteSpy = jest
            .spyOn(PersonsController, 'delete')
            .mockResolvedValue(undefined as never);

        await expect(
            PersonsController.deleteFromDto({ id: 5 }),
        ).rejects.toMatchObject({
            status: 409,
            blockers: [{ ref: 'Tasks.OwnerId', count: 3 }],
            // komunikat niesie czytelna liste blokad (widoczna dla czlowieka w alercie)
            message: expect.stringContaining('zadania: 3'),
        });
        expect(deleteSpy).not.toHaveBeenCalled();

        deleteSpy.mockRestore();
    });

    it('kasuje osobe bez zadnych powiazan', async () => {
        countReferences.mockResolvedValue(new Map());
        const deleteSpy = jest
            .spyOn(PersonsController, 'delete')
            .mockResolvedValue(undefined as never);

        const result = await PersonsController.deleteFromDto({ id: 7 });

        expect(result).toEqual({ id: 7 });
        expect(deleteSpy).toHaveBeenCalledTimes(1);

        deleteSpy.mockRestore();
    });

    it('oddaje 400 (nie 500), gdy w tresci brak prawidlowego id', async () => {
        const deleteSpy = jest
            .spyOn(PersonsController, 'delete')
            .mockResolvedValue(undefined as never);

        await expect(
            PersonsController.deleteFromDto({}),
        ).rejects.toMatchObject({ status: 400 });
        expect(countReferences).not.toHaveBeenCalled();
        expect(deleteSpy).not.toHaveBeenCalled();

        deleteSpy.mockRestore();
    });
});

describe('describeBlockers: czytelny opis powiazan (ROD-6)', () => {
    it('tlumaczy znane kolumny na etykiety, nieznane zostawia surowe', () => {
        const text = describeBlockers([
            { ref: 'Tasks.OwnerId', count: 3 },
            { ref: 'StaffMembers.PersonId', count: 1 },
            { ref: 'SomeNewTable.PersonId', count: 2 },
        ]);
        expect(text).toBe(
            'zadania: 3, uprawnienia w panelu: 1, SomeNewTable.PersonId: 2',
        );
    });

    it('skraca dluga liste i dopisuje licznik reszty', () => {
        const many = Array.from({ length: 8 }, (_, i) => ({
            ref: `T${i}.PersonId`,
            count: 1,
        }));
        expect(describeBlockers(many)).toContain('i inne (2)');
    });

    it('pusta lista to pusty opis', () => {
        expect(describeBlockers([])).toBe('');
    });
});
