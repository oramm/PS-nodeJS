export function parseContractSelectedPersonIds(value: unknown): number[] {
    if (!Array.isArray(value) || value.length > 50 || value.some(id => !Number.isSafeInteger(id) || id <= 0))
        throw Object.assign(new Error('Wybierz maksymalnie 50 osób z listy.'), { status: 400 });
    return [...new Set<number>(value)];
}
