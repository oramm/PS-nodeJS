import ToolsDocs from '../ToolsDocs';

describe('ToolsDocs.splitContentsHeadings', () => {
    it('zdejmuje prefiks i wskazuje poziom nagłówka', () => {
        const { text, headings } = ToolsDocs.splitContentsHeadings(
            '## 1. Dobór parametrów stacji\nPrzedłożenie doboru.',
        );

        expect(text).toBe('1. Dobór parametrów stacji\nPrzedłożenie doboru.');
        expect(headings).toEqual([
            { start: 0, end: '1. Dobór parametrów stacji'.length, level: 2 },
        ]);
    });

    it('liczy przesunięcia od początku wstawianego tekstu, nie od początku linii', () => {
        // To jest sedno: indeksy trafiają do Google Docs jako pozycje bezwzględne
        // liczone od miejsca wstawienia. Błąd o jeden ostyluje nie ten akapit.
        const { text, headings } = ToolsDocs.splitContentsHeadings(
            'Wstęp.\n## Punkt drugi\nTreść.\n### Punkt trzeci',
        );

        expect(text).toBe('Wstęp.\nPunkt drugi\nTreść.\nPunkt trzeci');
        expect(headings).toEqual([
            { start: 7, end: 7 + 'Punkt drugi'.length, level: 2 },
            { start: 26, end: 26 + 'Punkt trzeci'.length, level: 3 },
        ]);
        for (const h of headings)
            expect(text.slice(h.start, h.end)).not.toContain('\n');
        expect(text.slice(headings[0].start, headings[0].end)).toBe(
            'Punkt drugi',
        );
        expect(text.slice(headings[1].start, headings[1].end)).toBe(
            'Punkt trzeci',
        );
    });

    it('obsługuje trzy poziomy nagłówków', () => {
        const { headings } = ToolsDocs.splitContentsHeadings(
            '# Pierwszy\n## Drugi\n### Trzeci',
        );

        expect(headings.map((h) => h.level)).toEqual([1, 2, 3]);
    });

    it('nie robi nagłówka z czwartego poziomu ani z kratki bez spacji', () => {
        // Szablon ma zdefiniowane HEADING_1..6, ale w piśmie trzy poziomy wystarczają,
        // a `#ENVI#...` i numery w rodzaju „#16" nie mogą stać się nagłówkami.
        const { text, headings } = ToolsDocs.splitContentsHeadings(
            '#### Czwarty\n#ENVI#contents#\nwniosek #16',
        );

        expect(headings).toEqual([]);
        expect(text).toBe('#### Czwarty\n#ENVI#contents#\nwniosek #16');
    });

    it('sam prefiks bez tytułu nie jest nagłówkiem', () => {
        // Zakres o zerowej długości niczego by nie ostylował, a poszedłby jako request.
        const { text, headings } = ToolsDocs.splitContentsHeadings('## \ntekst');

        expect(headings).toEqual([]);
        expect(text).toBe('\ntekst');
    });

    it('tekst bez nagłówków zostaje bit w bit', () => {
        const original =
            'Pierwszy akapit.\nDrugi akapit z myślnikiem – i liczbą 25 kW.\n';

        const { text, headings } =
            ToolsDocs.splitContentsHeadings(original);

        expect(text).toBe(original);
        expect(headings).toEqual([]);
    });
});
