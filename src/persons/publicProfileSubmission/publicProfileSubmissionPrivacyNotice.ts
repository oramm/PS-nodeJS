import { PublicProfilePrivacyNoticeDto } from '../../types/types';

/**
 * KLAUZULA INFORMACYJNA publicznego formularza aktualizacji doświadczenia (RODO, art. 13).
 * Pack ROD, checkpoint ROD-7, decyzja ownera D-ROD-7 = (a).
 *
 * JEDNO ŹRÓDŁO tekstu: stąd bierze go mail z linkiem (PublicProfileSubmissionController.sendSubmissionLinkMail)
 * i strona formularza (GET /v2/public/experience-update/:token -> pole `privacyNotice`). Front tylko wyświetla.
 *
 * TREŚĆ ZATWIERDZONA PRZEZ OWNERA 2026-09-14, po korekcie redakcyjnej (bez przeglądu prawnika). Agent nie pisze treści
 * prawnej sam - każdą zmianę brzmienia zatwierdza owner (albo prawnik). Zmiana treści = edycja tego pliku:
 *  - tekst docelowy: `isPlaceholder: false` i zero znaczników PLACEHOLDER_MARKER w treści,
 *  - tekst tymczasowy (np. do czasu opinii prawnika): oznacz miejsce znacznikiem PLACEHOLDER_MARKER i ustaw
 *    `isPlaceholder: true` - strona pokaże czerwoną plakietkę, a test-strażnik
 *    `__tests__/publicProfileSubmissionPrivacyNotice.test.ts` będzie czerwony i zablokuje wydanie.
 *
 * Dane administratora = stopka maili systemu (ToolsMail.makeENVIFooter). Okres przechowywania wg decyzji ownera
 * D-ROD-10 (2026-09-08): zgłoszenia nie są kasowane po zamknięciu, zostają przez czas prowadzenia profilu osoby.
 */

export const PLACEHOLDER_MARKER = '[DO UZUPEŁNIENIA';

export const PRIVACY_ADMINISTRATOR_SECTION: PublicProfilePrivacyNoticeDto['sections'][number] = {
    "heading": "Kto jest administratorem Twoich danych?",
    "text": "Administratorem danych jest Envi Konsulting, ul. Brzechwy 3, 49-305 Brzeg, NIP 747-191-75-75. W sprawach dotyczących danych osobowych skontaktuj się z naszym biurem: biuro@envi.com.pl."
};

export const PRIVACY_CONTACT_SECTION: PublicProfilePrivacyNoticeDto['sections'][number] = {
    "heading": "Jak się z nami skontaktować?",
    "text": "Pytania i wnioski dotyczące Twoich danych osobowych kieruj do biura ENVI: biuro@envi.com.pl."
};

export const PUBLIC_PROFILE_PRIVACY_NOTICE: PublicProfilePrivacyNoticeDto = {
    isPlaceholder: false,
    title: 'Informacja o przetwarzaniu danych osobowych',
    sections: [
        PRIVACY_ADMINISTRATOR_SECTION,
        {
            "heading": "W jakim celu przetwarzamy dane?",
            "text": "Dane z formularza, dotyczące doświadczenia zawodowego, wykształcenia, umiejętności oraz adres e-mail, służą do aktualizacji Twojego profilu zawodowego w systemie ENVI. Wykorzystujemy je przy przygotowywaniu ofert i realizacji kontraktów, w których współpracujesz z ENVI. Podstawą przetwarzania jest prawnie uzasadniony interes administratora: wykazywanie potencjału kadrowego w ofertach oraz organizacja współpracy przy realizacji kontraktów (art. 6 ust. 1 lit. f RODO)."
        },
        {
            "heading": "Jak długo przechowujemy dane?",
            "text": "Dane ze zgłoszenia przechowujemy przez czas prowadzenia Twojego profilu w systemie. Termin ważności linku podajemy w wiadomości z zaproszeniem. Wygaśnięcie linku nie oznacza usunięcia przesłanych danych."
        },
        {
            "heading": "Komu możemy udostępniać dane?",
            "text": "Twój profil może być udostępniany zamawiającym w ofertach i wykazach kadry. Przy obsłudze systemu korzystamy również z usług dostawców przetwarzających dane w naszym imieniu: Heroku (utrzymanie aplikacji), Kylos (przechowywanie bazy danych), MongoDB Atlas (obsługa sesji użytkowników) i Google Workspace (przechowywanie plików na firmowym Dysku Google). Jeśli skorzystasz z funkcji importu danych z CV, plik jest analizowany przez usługę OpenAI."
        },
        {
            "heading": "Jakie masz prawa?",
            "text": "Masz prawo dostępu do swoich danych, ich sprostowania, usunięcia lub ograniczenia przetwarzania oraz wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych."
        },
        PRIVACY_CONTACT_SECTION
    ],
};

/** Klauzula jako zwykły tekst do maila: tytuł, potem „Nagłówek: treść" po jednym w wierszu. */
export function renderPrivacyNoticeText(
    notice: PublicProfilePrivacyNoticeDto = PUBLIC_PROFILE_PRIVACY_NOTICE,
): string {
    const lines: string[] = [notice.title];
    if (notice.isPlaceholder) {
        lines.push('(TEKST ZASTĘPCZY - do zastąpienia przez administratora danych)');
    }
    for (const section of notice.sections) {
        lines.push(`${section.heading}: ${section.text}`);
    }
    return lines.join('\n\n');
}

/** Czy w treści został choć jeden znacznik tekstu zastępczego. */
export function hasPlaceholderMarker(notice: PublicProfilePrivacyNoticeDto): boolean {
    if (notice.title.includes(PLACEHOLDER_MARKER)) return true;
    for (const section of notice.sections) {
        if (section.heading.includes(PLACEHOLDER_MARKER)) return true;
        if (section.text.includes(PLACEHOLDER_MARKER)) return true;
    }
    return false;
}

/** HTML maila: jawne akapity i nagłówki zachowują odstępy w klientach poczty. */
export function renderProfileSubmissionLinkMailHtml(
    url: string,
    expiresLabel: string,
): string {
    const escapeHtml = (value: string): string => value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const notice = PUBLIC_PROFILE_PRIVACY_NOTICE;
    const paragraphStyle = 'margin:0 0 16px;line-height:1.6;';
    const sections = notice.sections.map((section) =>
        '<h3 style="margin:20px 0 6px;font-size:16px;line-height:1.4;">' +
        escapeHtml(section.heading) + '</h3>' +
        '<p style="' + paragraphStyle + '">' + escapeHtml(section.text) + '</p>',
    ).join('\n');
    return '<div lang="pl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:680px;">' +
        '<p style="' + paragraphStyle + '">Otrzymujesz link do uzupełnienia profilu:<br>' +
        '<a href="' + escapeHtml(url) + '" style="overflow-wrap:anywhere;word-break:break-all;">' + escapeHtml(url) + '</a></p>' +
        '<p style="' + paragraphStyle + '">Link wygasa: ' + escapeHtml(expiresLabel) + '.</p>' +
        '<h2 style="margin:28px 0 16px;font-size:20px;line-height:1.4;">' + escapeHtml(notice.title) + '</h2>' +
        (notice.isPlaceholder ? '<p style="color:#b00020;">TEKST ZASTĘPCZY - do zastąpienia przez administratora danych</p>' : '') +
        sections + '</div>';
}
