import { makeProjectScopeCondition } from '../ProjectScope';

describe('makeProjectScopeCondition', () => {
    it('bez zakresu nie filtruje - role nieograniczone widzą jak dotąd', () => {
        expect(makeProjectScopeCondition('Contracts.ProjectOurId')).toBe('1');
        expect(
            makeProjectScopeCondition('Contracts.ProjectOurId', undefined)
        ).toBe('1');
    });

    it('pusta lista przypisań nie widzi NICZEGO', () => {
        // Kluczowa własność: brak przypisań nie może zdegradować się do braku filtra.
        // Gdyby zwróciło '1', konto bez projektów zobaczyłoby całą bazę.
        expect(
            makeProjectScopeCondition('Contracts.ProjectOurId', {
                projectOurIds: [],
            })
        ).toBe('0');
    });

    it('buduje warunek IN z listy przypisanych projektów', () => {
        const condition = makeProjectScopeCondition(
            'Contracts.ProjectOurId',
            { projectOurIds: ['2023.10', '2024.01'] }
        );

        expect(condition).toBe(
            "Contracts.ProjectOurId IN ('2023.10', '2024.01')"
        );
    });

    it('escapuje wartości - OurId trafia do SQL jako parametr, nie jako tekst', () => {
        const condition = makeProjectScopeCondition('Contracts.ProjectOurId', {
            projectOurIds: ["2023.10' OR '1'='1"],
        });

        expect(condition).not.toContain("OR '1'='1'");
        expect(condition).toBe(
            "Contracts.ProjectOurId IN ('2023.10\\' OR \\'1\\'=\\'1')"
        );
    });

    it('respektuje podaną kolumnę - każde zapytanie ma inny alias', () => {
        expect(
            makeProjectScopeCondition('Projects.OurId', {
                projectOurIds: ['2023.10'],
            })
        ).toBe("Projects.OurId IN ('2023.10')");
        expect(
            makeProjectScopeCondition('mainContracts.ProjectOurId', {
                projectOurIds: ['2023.10'],
            })
        ).toBe("mainContracts.ProjectOurId IN ('2023.10')");
    });
});
