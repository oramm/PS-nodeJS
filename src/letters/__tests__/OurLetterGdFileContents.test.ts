import { DocumentTemplateData, OurLetterData } from '../../types/types';
import OurLetterGdFile from '../OurLetterGdFIle';
import OurLetterContract from '../OurLetterContract';

/** Minimalna konkretna klasa - testujemy wyłącznie budowę danych dla namedRanges,
 *  bez dotykania Dysku Google. */
class TestOurLetterGdFile extends OurLetterGdFile {
    protected makeCasesList(): string {
        return 'sprawa: TEST';
    }
    protected letterContextLabel(): string {
        return 'projekt: TEST';
    }
    /** odsłania metodę chronioną na potrzeby testu */
    public getNamedRangesData() {
        return this.makeDataforNamedRanges();
    }
}

const HEADER_RANGES = [
    'creationDate',
    'number',
    'address',
    'description',
    'projectContext',
    'addressCc',
];

function makeLetterData(_contents?: unknown): OurLetterData {
    return {
        id: 1,
        number: 1,
        isOur: true,
        status: 'CREATED',
        creationDate: '2026-07-30',
        registrationDate: '2026-07-30',
        description: 'Opis pisma',
        _cases: [{ id: 1 } as any],
        _entitiesMain: [{ id: 1, name: 'ENVI', address: 'ul. Testowa 1' }],
        _entitiesCc: [],
        _editor: { id: 1 } as any,
        ...(_contents === undefined ? {} : { _contents }),
    } as unknown as OurLetterData;
}

function namedRangesFor(_contents?: unknown) {
    return new TestOurLetterGdFile({
        enviDocumentData: makeLetterData(_contents),
    }).getNamedRangesData();
}

function findRange(
    data: { rangeName: string; newText: string }[],
    rangeName: string
) {
    return data.find((item) => item.rangeName === rangeName);
}

function header(data: { rangeName: string; newText: string }[]) {
    return data.filter((item) => HEADER_RANGES.includes(item.rangeName));
}

describe('OurLetterGdFile.makeDataforNamedRanges - zakres contents', () => {
    it('nie dokłada zakresu contents, gdy treści nie podano (tag zostaje w dokumencie)', () => {
        const data = namedRangesFor(undefined);

        expect(findRange(data, 'contents')).toBeUndefined();
        expect(data.map((item) => item.rangeName)).toEqual(HEADER_RANGES);
    });

    it('nie dokłada zakresu contents dla treści pustej lub złożonej z samych białych znaków - pusty tekst skasowałby tag', () => {
        for (const emptyish of ['', '   ', '\r\n\n  ']) {
            expect(
                findRange(namedRangesFor(emptyish), 'contents')
            ).toBeUndefined();
        }
    });

    it('dokłada zakres contents z treścią, dzieląc akapity znakiem \\n i normalizując CRLF', () => {
        const data = namedRangesFor(
            '\r\nPierwszy akapit.\r\n\r\nDrugi akapit.\r\n'
        );

        expect(findRange(data, 'contents')).toEqual({
            rangeName: 'contents',
            newText: 'Pierwszy akapit.\n\nDrugi akapit.',
        });
    });

    it('nie rusza zakresów nagłówka niezależnie od tego, czy treść podano', () => {
        const bezTresci = header(namedRangesFor(undefined));
        const zTrescia = header(namedRangesFor('Treść pisma.'));

        expect(zTrescia).toEqual(bezTresci);
        expect(findRange(bezTresci, 'description')).toEqual({
            rangeName: 'description',
            newText: 'Opis pisma',
        });
    });
});

describe('OurLetter - pole _contents', () => {
    const template = {
        id: 1,
        name: 'Papier firmowy',
        gdId: 'gd-template-id',
    } as DocumentTemplateData;

    function makeContractLetter(_contents?: unknown) {
        return new OurLetterContract({
            ...(makeLetterData(_contents) as any),
            _template: template,
            _project: { id: 46, ourId: 'TEST.01' },
        });
    }

    it('odrzuca treść, która nie jest tekstem, zamiast po cichu jej gubić', () => {
        expect(() => makeContractLetter(123)).toThrow(
            '_contents musi być tekstem'
        );
    });

    it('przekazuje treść do generatora przy TWORZENIU pisma (jest _template)', () => {
        const letter = makeContractLetter('Treść pisma.');
        const gdFile = letter.makeLetterGdFileController(template) as any;

        expect(gdFile.enviDocumentData._contents).toBe('Treść pisma.');
    });

    it('NIE przekazuje treści do generatora przy EDYCJI pisma (brak _template) - dokument jest źródłem prawdy', () => {
        const letter = makeContractLetter('Treść pisma.');
        const gdFile = letter.makeLetterGdFileController() as any;

        expect(gdFile.enviDocumentData._contents).toBeUndefined();
    });
});
