/**
 * Rozpoznanie, czy mail niesie pismo i ile go niesie (PRZ-4).
 *
 * Funkcja czysta, bez zależności — decyzja zapada po stronie agenta, który czyta skrzynkę przez
 * MCP `mail-imap-search`; serwer dostaje już gotowy payload. Mieszka w tym module, bo tu stoi
 * reszta koperty i tu jest uruchamiany test; nic serwerowego jej nie woła.
 *
 * Kryterium jest celowo prymitywne: typ MIME, nazwa pliku i słowo zapowiadające w temacie/treści.
 * Zmierzone na 34 prawdziwych mailach ze skrzynki firmowej 2026-07-31 — decyzje automatyczne
 * (PISMO/BRAK) trafiły 34/34, bo pomyłki spływają do `DO_DECYZJI`. Bogatsze sygnały (otwieranie
 * PDF-a, klasyfikator uczony) nie miały czego poprawić i nie zostały dołożone.
 *
 * Progiem z bramki `G-PRZ-5` jest tu **jednoznaczność struktury**, nie prawdopodobieństwo:
 * agent rejestruje pismo tylko wtedy, gdy kandydat jest dokładnie jeden i mail sam zapowiada
 * pismo. Każdy inny układ to `DO_DECYZJI` — koperta bez pisma plus wpis na liście dla ownera.
 * Niepewność nie zatrzymuje przebiegu.
 */

export type WerdyktKlasyfikacji = 'PISMO' | 'BRAK' | 'DO_DECYZJI';

export interface ZalacznikMaila {
    filename: string;
    contentType: string;
    size?: number;
}

export interface MailDoKlasyfikacji {
    subject: string;
    body: string;
    attachments: ZalacznikMaila[];
}

export interface WynikKlasyfikacji {
    werdykt: WerdyktKlasyfikacji;
    /** Pliki do zarejestrowania jako dokument pisma. Przy `PISMO` zawsze dokładnie jeden. */
    pisma: ZalacznikMaila[];
    /** Reszta plików niosących treść — idą przy piśmie jako załączniki. Grafiki tu nie trafiają. */
    zalaczniki: ZalacznikMaila[];
    /** Jedno zdanie do raportu i do listy „do decyzji”. */
    powod: string;
}

/**
 * Słowa, którymi nadawca zapowiada pismo. Zawężone do korespondencji formalnej — `pisemnie`
 * czy `oferty` mają się NIE łapać, dlatego końcówki są wyliczone, a nie `\w*`.
 */
const ZAPOWIEDZ_PISMA =
    /\b(pism(?:o|a|em|ie|ach|om)?|wezwani(?:e|a|em|u)|zawiadomieni(?:e|a|em|u)|postanowieni(?:e|a|em|u)|decyzj(?:a|i|ę|ą)|nakaz(?:u|em)?|monit(?:u|em)?)\b/i;

/**
 * Korespondencja, która ma własny obieg i nie jest pismem. Wyklucza cały mail, ale tylko wtedy,
 * gdy nikt nie zapowiedział pisma — inaczej „wezwanie do wystawienia faktury” wpadłoby do kosza.
 */
const WYKLUCZAJACY_TEMAT = /(faktur|proform|invoice|\boferta\b)/i;

/** To samo na poziomie pliku: wizualizacja faktury albo wysłana oferta nie są pismem. */
const WYKLUCZAJACA_NAZWA = /(faktur|proform|invoice|\bfv[-_ ]?\d|\boferta\b)/i;

const TYP_PISMA = 'application/pdf';

/**
 * Grafiki odpadają w całości. W próbce wszystkie 40+ załączników `image/*` było stopką
 * nadawcy albo wklejonym zrzutem — ani jeden nie był dokumentem. Odpadają też z listy
 * załączników pisma, bo inaczej folder pisma na Dysku zapełnia się logotypami.
 *
 * Świadoma ślepa plamka: pismo przysłane jako skan JPG/PNG zostanie uznane za brak pisma.
 * W próbce nie wystąpiło ani razu, więc reguły na rozmiar obrazka nie ma na czym oprzeć.
 */
const isGrafika = (a: ZalacznikMaila) => a.contentType.startsWith('image/');

const isKandydatNaPismo = (a: ZalacznikMaila) =>
    a.contentType === TYP_PISMA && !WYKLUCZAJACA_NAZWA.test(a.filename);

export function classifyIncomingMail(
    mail: MailDoKlasyfikacji
): WynikKlasyfikacji {
    const zapowiedziano = ZAPOWIEDZ_PISMA.test(
        `${mail.subject} ${mail.body}`
    );
    const tresciowe = mail.attachments.filter((a) => !isGrafika(a));

    if (!zapowiedziano && WYKLUCZAJACY_TEMAT.test(mail.subject))
        return {
            werdykt: 'BRAK',
            pisma: [],
            zalaczniki: [],
            powod: 'Temat wskazuje na fakturę albo ofertę, nikt nie zapowiedział pisma.',
        };

    const kandydaci = tresciowe.filter(isKandydatNaPismo);
    const reszta = tresciowe.filter((a) => !isKandydatNaPismo(a));

    if (kandydaci.length === 0)
        return zapowiedziano
            ? {
                  werdykt: 'DO_DECYZJI',
                  pisma: [],
                  zalaczniki: reszta,
                  powod: 'Mail zapowiada pismo, ale w załącznikach nie ma dokumentu PDF — pismo bywa w treści maila, w linku albo nadawca zapomniał załącznika.',
              }
            : {
                  werdykt: 'BRAK',
                  pisma: [],
                  zalaczniki: reszta,
                  powod: 'Brak załącznika, który mógłby być pismem.',
              };

    if (kandydaci.length === 1 && zapowiedziano)
        return {
            werdykt: 'PISMO',
            pisma: kandydaci,
            zalaczniki: reszta,
            powod: 'Jeden dokument PDF i mail wprost zapowiada pismo.',
        };

    if (kandydaci.length === 1)
        return {
            werdykt: 'DO_DECYZJI',
            pisma: [],
            zalaczniki: tresciowe,
            powod: 'Jest dokument PDF, ale mail nie nazywa go pismem — bywa raportem, protokołem albo opracowaniem.',
        };

    return {
        werdykt: 'DO_DECYZJI',
        pisma: [],
        zalaczniki: tresciowe,
        powod: `Kandydatów na pismo jest ${kandydaci.length} — z samej koperty nie widać, czy to kilka pism, czy jedno pismo z załącznikami.`,
    };
}
