/**
 * Reconciles the letter id taken from the route path with the one carried in the
 * request body.
 *
 * The id in the URL is authoritative. A body carrying a different id is a conflict,
 * not something to correct silently: `PUT /letter/6163` with `{ id: 6164 }` in the
 * body used to edit letter **6164**, including moving its Drive shortcuts between
 * case folders. Until the agent token existed that route was reachable only from a
 * logged-in browser; a headless caller makes the mismatch worth refusing outright.
 *
 * Silent correction is deliberately avoided: a caller whose body disagrees with the
 * address does not know which letter it is editing, and picking one for it would
 * hide the bug instead of surfacing it.
 */
export default function resolveRouteLetterId(
    idFromUrl: unknown,
    idFromBody: unknown
): number {
    const urlId = parseStrictPositiveInt(idFromUrl);
    if (urlId === undefined)
        throw new Error(
            `Nieprawidłowy identyfikator pisma w adresie: ${String(idFromUrl)}`
        );

    // No id in the body is the normal case for a caller that trusts the address.
    if (idFromBody === undefined || idFromBody === null || idFromBody === '')
        return urlId;

    const bodyId = parseStrictPositiveInt(idFromBody);
    if (bodyId === undefined || bodyId !== urlId)
        throw new Error(
            `Niezgodny identyfikator pisma: adres wskazuje ${urlId}, ` +
                `a treść żądania ${String(idFromBody)}. ` +
                `Rozstrzygający jest adres — popraw treść żądania.`
        );

    return urlId;
}

/**
 * Accepts only a whole positive number or its exact decimal string. `parseInt` is
 * not used on purpose: it would read `"6164 albo 6163"` as 6164 and `"6163abc"` as
 * 6163, which is precisely the kind of quiet reinterpretation this guard exists to
 * prevent.
 */
function parseStrictPositiveInt(value: unknown): number | undefined {
    if (typeof value === 'number')
        return Number.isSafeInteger(value) && value > 0 ? value : undefined;

    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        const parsed = Number(value.trim());
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
    }

    return undefined;
}
