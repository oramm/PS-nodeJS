import { LetterData } from '../../types/types';
import { isCasesOnlyEdit, LetterDbEditContext } from '../letterEditScope';

const dbContext = (
    extra: Partial<LetterDbEditContext> = {}
): LetterDbEditContext => ({
    id: 6119,
    number: '6119',
    description: 'Opis pisma',
    creationDate: '2026-07-30',
    registrationDate: '2026-07-30',
    gdDocumentId: 'doc-1',
    gdFolderId: 'letter-folder-1',
    entityKeys: ['MAIN:659'],
    ...extra,
});

const payload = (extra: Record<string, unknown> = {}): LetterData =>
    ({
        id: 6119,
        number: 6119,
        description: 'Opis pisma',
        creationDate: '2026-07-30',
        registrationDate: '2026-07-30',
        _entitiesMain: [{ id: 659 }],
        _entitiesCc: [],
        _cases: [{ id: 20 }],
        ...extra,
    } as unknown as LetterData);

describe('isCasesOnlyEdit', () => {
    it('rozpoznaje edycję, która zmienia wyłącznie sprawy', () => {
        // payload różni się od bazy tylko listą spraw
        expect(isCasesOnlyEdit(dbContext(), payload(), 0)).toBe(true);
    });

    it('nie daje się zwieść typowi liczbowemu numeru z payloadu', () => {
        expect(isCasesOnlyEdit(dbContext({ number: '6119' }), payload(), 0)).toBe(
            true
        );
    });

    it('wykrywa zmianę opisu', () => {
        expect(
            isCasesOnlyEdit(dbContext(), payload({ description: 'Nowy opis' }), 0)
        ).toBe(false);
    });

    it('wykrywa zmianę numeru', () => {
        expect(isCasesOnlyEdit(dbContext(), payload({ number: 9999 }), 0)).toBe(
            false
        );
    });

    it('wykrywa zmianę daty utworzenia, także gdy baza zwraca obiekt Date', () => {
        expect(
            isCasesOnlyEdit(
                dbContext({ creationDate: new Date(2026, 6, 30) as any }),
                payload(),
                0
            )
        ).toBe(true);
        expect(
            isCasesOnlyEdit(
                dbContext({ creationDate: new Date(2026, 6, 30) as any }),
                payload({ creationDate: '2026-08-01' }),
                0
            )
        ).toBe(false);
    });

    it('wykrywa zmianę daty rejestracji', () => {
        expect(
            isCasesOnlyEdit(
                dbContext(),
                payload({ registrationDate: '2026-08-05' }),
                0
            )
        ).toBe(false);
    });

    it('wykrywa dodanie podmiotu', () => {
        expect(
            isCasesOnlyEdit(
                dbContext(),
                payload({ _entitiesMain: [{ id: 659 }, { id: 660 }] }),
                0
            )
        ).toBe(false);
    });

    it('wykrywa podmianę podmiotu przy tej samej ich liczbie', () => {
        expect(
            isCasesOnlyEdit(
                dbContext(),
                payload({ _entitiesMain: [{ id: 777 }] }),
                0
            )
        ).toBe(false);
    });

    it('wykrywa zmianę roli podmiotu (MAIN na CC)', () => {
        expect(
            isCasesOnlyEdit(
                dbContext(),
                payload({ _entitiesMain: [], _entitiesCc: [{ id: 659 }] }),
                0
            )
        ).toBe(false);
    });

    it('nie pomija Dysku, gdy w żądaniu są załączniki', () => {
        expect(isCasesOnlyEdit(dbContext(), payload(), 1)).toBe(false);
    });

    it('nie pomija Dysku, gdy pisma nie ma w bazie', () => {
        expect(isCasesOnlyEdit(undefined, payload(), 0)).toBe(false);
    });
});
