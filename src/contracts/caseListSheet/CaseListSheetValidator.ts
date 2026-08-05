import {
    CaseListSheetParams,
    CaseListSheetProjectParams,
} from './CaseListSheetTypes';

/** Walidacja parametrów generowania spisu spraw (body requestu). */
export default class CaseListSheetValidator {
    static parseParams(body: any): CaseListSheetParams {
        const contractId = Number(body?.contractId);
        if (!Number.isInteger(contractId) || contractId <= 0)
            throw new Error('Nieprawidłowy identyfikator kontraktu');

        const personIds = CaseListSheetValidator.parsePersonIds(
            body?.personIds
        );

        return {
            contractId,
            includeFinished: body?.includeFinished === true,
            personIds,
        };
    }

    /** Spis projektu — projekt identyfikuje OurId (tak samo wiąże kontrakty z projektem). */
    static parseProjectParams(body: any): CaseListSheetProjectParams {
        const raw = body?.projectOurId ?? body?.projectId;
        const projectOurId = raw === undefined || raw === null ? '' : String(raw).trim();
        if (!projectOurId)
            throw new Error('Nieprawidłowy identyfikator projektu');

        return {
            projectOurId,
            includeFinished: body?.includeFinished === true,
            personIds: CaseListSheetValidator.parsePersonIds(body?.personIds),
        };
    }

    private static parsePersonIds(raw: any): number[] {
        if (raw === undefined || raw === null) return [];

        // Middleware (Tools.parseObjectsJSON) puszcza body przez JSON.parse także na
        // wartościach, które są już sparsowane: jednoelementowa tablica [5] zamienia
        // się w String([5]) === '5', a to parsuje się z powrotem na liczbę 5.
        // Dlatego pojedynczą liczbę traktujemy jak listę jednoelementową.
        const rawList = Array.isArray(raw) ? raw : [raw];
        if (rawList.some((value) => typeof value === 'object' && value !== null))
            throw new Error('personIds musi być tablicą identyfikatorów');

        const ids = rawList.map((value) => Number(value));
        if (ids.some((id) => !Number.isInteger(id) || id <= 0))
            throw new Error('Nieprawidłowy identyfikator osoby');

        // Duplikaty rozdmuchałyby nazwę pliku i kolumnę „Osoba" bez żadnego zysku.
        // Sortowanie daje ten sam zestaw osób niezależnie od kolejności zaznaczania,
        // dzięki czemu opis konfiguracji w arkuszu jest powtarzalny.
        return [...new Set(ids)].sort((a, b) => a - b);
    }
}
