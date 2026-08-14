import OpenAI from 'openai';
import ToolsAI from '../../tools/ToolsAI';

/**
 * Podpowiadanie kwot i numeru dokumentu z paragonu albo faktury.
 *
 * Zakres jest waski celowo: wypelniamy trzy pola, ktore trzeba przepisywac z papieru.
 * Reszta wpisu (opis, kto zaplacil, rodzaj) i tak jest wybierana recznie i szybciej
 * jest ja kliknac niz sprawdzac, czy model zgadl.
 *
 * Do modelu trafia WYLACZNIE tekst - obraz konczy zycie na tesseractcie po stronie
 * serwera. To decyzja wlasciciela, ta sama co przy pismach.
 *
 * Wynik jest PODPOWIEDZIA, nie prawda: ladzie w polach formularza, ktore czlowiek widzi
 * w podgladzie arkusza przed zatwierdzeniem. Dlatego nigdzie nie zgadujemy - brak wartosci
 * zostaje brakiem, zeby puste pole rzucalo sie w oczy bardziej niz liczba wzieta z sufitu.
 */

export type ReceiptFields = {
    documentNumber: string | null;
    netAmount: number | null;
    grossAmount: number | null;
};

export type ReceiptSuggestion = ReceiptFields & {
    /** false = nie wywolalismy modelu albo nic nie znalazl; `reason` mowi dlaczego */
    recognized: boolean;
    reason?: string;
    /** Zuzycie modelu, tak jak przy pismach. Brak, gdy bramka nie przepuscila do modelu. */
    _model?: string;
    _usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
};

const EMPTY: ReceiptFields = {
    documentNumber: null,
    netAmount: null,
    grossAmount: null,
};

/**
 * Slowa, ktore w polskim paragonie albo fakturze wystepuja zawsze, oraz cokolwiek
 * wygladajace na kwote z groszami.
 */
const MONEY_WORDS =
    /(suma|razem|do zap[lł]aty|warto[sś][cć]|brutto|netto|podatek|PLN|z[lł]|NIP|paragon|faktura|fiskalny)/i;
const AMOUNT_PATTERN = /\d[\d\s ]*[.,]\d{2}/;

/**
 * Bramka przed wywolaniem modelu. Zdjecie nie tego dokumentu albo OCR, ktory zwrocil
 * smieci, nie ma po co isc dalej: model i tak nie znajdzie kwoty, ktorej nie ma w tekscie,
 * a zaplacimy za probe i dostaniemy pole wypelnione czyms prawdopodobnie wygladajacym.
 */
export function hasReceiptAnchors(text: string): boolean {
    return MONEY_WORDS.test(text) && AMOUNT_PATTERN.test(text);
}

/** Kwota z tekstu: '1 234,56 PLN' i '1234.56' to ta sama liczba. */
export function parseAmount(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const cleaned = String(value)
        .replace(/[\s ]/g, '')
        .replace(',', '.')
        // Minus zostaje celowo: kwota ujemna ma zostac odrzucona nizej, a nie po cichu
        // zamieniona na dodatnia przez wyciecie znaku.
        .replace(/[^0-9.-]/g, '');
    if (!cleaned) return null;
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100) / 100;
}

function parseDocumentNumber(value: unknown): string | null {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || trimmed.length > 100) return null;
    // Sama kwota w polu numeru to typowa pomylka przy paragonie bez numeru.
    if (/^\d+[.,]\d{2}$/.test(trimmed)) return null;
    return trimmed;
}

/**
 * Odpowiedz modelu w postaci, ktorej mozna zaufac na tyle, zeby wlozyc ja do formularza.
 * Netto wyzsze od brutto znaczy, ze model pomylil pola; zostawiamy wtedy samo brutto,
 * bo to ono decyduje o stanie portfela, a walidacja formularza i tak odrzucilaby taka pare.
 */
export function normalizeFields(aiResult: unknown): ReceiptFields {
    const raw = (aiResult ?? {}) as Record<string, unknown>;
    const grossAmount = parseAmount(raw.brutto);
    let netAmount = parseAmount(raw.netto);
    if (netAmount !== null && grossAmount !== null && netAmount > grossAmount)
        netAmount = null;

    return {
        documentNumber: parseDocumentNumber(raw.numer),
        netAmount,
        grossAmount,
    };
}

function buildPrompt(text: string): string {
    return `
Analizujesz tekst odczytany z paragonu albo faktury zakupowej polskiej firmy.
Tekst pochodzi z OCR, wiec moze zawierac literowki i pociete wiersze.

Zwroc obiekt JSON z dokladnie trzema polami:
- "brutto": laczna kwota do zaplaty, jako liczba (np. 123.45). To wartosc przy napisie
  SUMA, RAZEM, DO ZAPLATY albo SUMA PLN. Jesli nie ma, null.
- "netto": kwota netto, jesli dokument ja podaje osobno. Na paragonie zwykle jej nie ma
  wprost - wtedy null. NIE licz jej samodzielnie z podatku.
- "numer": numer faktury albo paragonu, przepisany doslownie (np. "FV/2026/08/123").
  Jesli dokument go nie ma, null.

Zasady bezwzglednie obowiazujace:
- Nie wymyslaj zadnej wartosci. Czego nie ma w tekscie, to null.
- Nie przeliczaj, nie zaokraglaj, nie poprawiaj kwot. Przepisz to, co widzisz.
- Kwota bez groszy tez jest kwota (np. 50 to 50.00).

Tekst:
---
${text.substring(0, 4000)}
---
`;
}

const EXAMPLES: Array<{ input: string; output: Record<string, unknown> }> = [
    {
        input: 'SKLEP ABC NIP 1234567890\nCHLEB 1 x 4,50\nSUMA PLN 4,50\nPARAGON FISKALNY',
        output: { brutto: 4.5, netto: null, numer: null },
    },
    {
        input: 'Faktura VAT nr FV/2026/08/123\nNetto 100,00 VAT 23,00 Brutto 123,00',
        output: { brutto: 123.0, netto: 100.0, numer: 'FV/2026/08/123' },
    },
    {
        input: 'Dziekujemy za zakupy. Zapraszamy ponownie.',
        output: { brutto: null, netto: null, numer: null },
    },
];

export default class ReceiptAnalyzer {
    /** Wolane przez kontroler: plik wchodzi, podpowiedzi wychodza. */
    static async analyze(file: Express.Multer.File): Promise<ReceiptSuggestion> {
        const text = await ToolsAI.extractTextFromFile(file);

        if (!hasReceiptAnchors(text))
            return {
                ...EMPTY,
                recognized: false,
                reason:
                    'W odczytanym tekscie nie widac kwot ani slow typowych dla paragonu. ' +
                    'Sprobuj zrobic zdjecie prosto z gory, w lepszym swietle - albo wpisz dane recznie.',
            };

        const { aiResult, _model, _usage } = await this.askModel(text);
        const fields = normalizeFields(aiResult);
        const foundAnything =
            fields.grossAmount !== null ||
            fields.netAmount !== null ||
            fields.documentNumber !== null;

        return {
            ...fields,
            recognized: foundAnything,
            reason: foundAnything
                ? undefined
                : 'Tekst odczytano, ale nie udalo sie z niego wyjac kwoty ani numeru.',
            _model,
            _usage,
        };
    }

    private static async askModel(text: string): Promise<{
        aiResult: unknown;
        _model?: string;
        _usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        };
    }> {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const messages: any[] = [
            {
                role: 'system',
                content:
                    'Zwracaj tylko i wylacznie poprawny obiekt JSON, bez dodatkowego tekstu.',
            },
        ];
        for (const example of EXAMPLES) {
            messages.push({ role: 'user', content: `Przykladowy tekst: ${example.input}` });
            messages.push({ role: 'assistant', content: JSON.stringify(example.output) });
        }
        messages.push({ role: 'user', content: buildPrompt(text) });

        const completion = await ToolsAI.callOpenAiWithRetry(openai, {
            model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
            messages,
            temperature: 0,
            response_format: { type: 'json_object' },
        });

        const content = completion?.choices?.[0]?.message?.content;
        if (!content) throw new Error('Model nie zwrocil odpowiedzi');

        const { _model, _usage } = ToolsAI.extractCompletionMeta(completion);
        return { aiResult: JSON.parse(content), _model, _usage };
    }
}
