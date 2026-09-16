const NUMBER_SEPARATOR = '|';

export function datePart(date: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Warsaw',
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)?.value;
    return `${part('day')}${part('month')}${part('year')}`;
}

export function numberSeriesMember(baseNumber: string, number: string): boolean {
    if (number === baseNumber) return true;
    const suffix = number.slice(`${baseNumber}${NUMBER_SEPARATOR}`.length);
    return (
        number.startsWith(`${baseNumber}${NUMBER_SEPARATOR}`) &&
        /^\d+$/.test(suffix)
    );
}

export function nextDuplicateNumber(
    baseNumber: string,
    existingNumbers: string[]
): string {
    const suffixes = existingNumbers
        .filter((number) => numberSeriesMember(baseNumber, number))
        .map((number) => {
            if (number === baseNumber) return 1;
            return Number(number.slice(`${baseNumber}${NUMBER_SEPARATOR}`.length));
        });
    if (!suffixes.length) return baseNumber;
    return `${baseNumber}${NUMBER_SEPARATOR}${Math.max(...suffixes) + 1}`;
}

export function generatedNumberPrefix(
    contractNumber: string,
    date: Date = new Date()
): string {
    return `${contractNumber.trim()}/${datePart(date)}`;
}

export function nextGeneratedNumber(
    prefix: string,
    existingNumbers: string[]
): string {
    const prefixWithSeparator = `${prefix}${NUMBER_SEPARATOR}`;
    const sequences = existingNumbers
        .filter((number) => number.startsWith(prefixWithSeparator))
        .map((number) => number.slice(prefixWithSeparator.length))
        .filter((sequence) => /^\d+$/.test(sequence))
        .map(Number);
    const next = (sequences.length ? Math.max(...sequences) : 0) + 1;
    return `${prefixWithSeparator}${String(next).padStart(2, '0')}`;
}
