import { PUBLIC_PROFILE_PRIVACY_NOTICE, PRIVACY_ADMINISTRATOR_SECTION, PRIVACY_CONTACT_SECTION } from '../publicProfileSubmission/publicProfileSubmissionPrivacyNotice';
export type PrivacyScope = 'SYSTEM' | 'PUBLIC_PROFILE';
export type PrivacyNotice = {
    scope: PrivacyScope; version: string; revision: string; title: string;
    sections: { heading: string; text: string }[]; isPlaceholder: boolean;
};
// Change version for material changes, revision only for editorial changes.
// Published snapshots must never be replaced.
// Revision 2 removes release-review metadata; version stays unchanged so saved acknowledgements remain valid.
export function currentNotice(scope: PrivacyScope): PrivacyNotice {
    if (scope === 'PUBLIC_PROFILE') return {
        ...PUBLIC_PROFILE_PRIVACY_NOTICE, scope, version: '2026-09-14', revision: '2',
    };
    return {
        scope, version: '2026-09-14', revision: '3', isPlaceholder: false,
        title: 'Informacja o przetwarzaniu danych osobowych w witrynie projektów',
        sections: [
            PRIVACY_ADMINISTRATOR_SECTION,
            { heading: 'Jakie dane i w jakim celu przetwarzamy?',
              text: 'Przetwarzamy dane identyfikacyjne i kontaktowe, dane konta i uprawnień oraz informacje o działaniach w systemie PS. Służą one obsłudze dostępu, organizacji współpracy, prowadzeniu projektów, zadań i korespondencji oraz zapewnieniu bezpieczeństwa i rozliczalności operacji. Zakres danych zależy od Twojej roli i używanych funkcji.' },
            { heading: 'Na jakiej podstawie przetwarzamy dane?',
              text: 'Dane przetwarzamy w celu realizacji prawnie uzasadnionych interesów ENVI, obejmujących organizację współpracy, bezpieczeństwo systemu i dokumentowanie działań (art. 6 ust. 1 lit. f RODO). W zakresie niezbędnym do wykonania umowy lub obowiązku prawnego podstawą jest odpowiednio art. 6 ust. 1 lit. b lub c RODO. Potwierdzenie zapoznania się z tą informacją nie jest zgodą na przetwarzanie danych.' },
            { heading: 'Jak długo przechowujemy dane?',
              text: 'Dane konta przechowujemy przez okres jego prowadzenia. Dokumentację współpracy i historię działań przechowujemy również po zakończeniu dostępu, przez czas uzasadniony realizacją kontraktów, obowiązkami przechowywania dokumentacji oraz ustalaniem, dochodzeniem lub obroną roszczeń. Wylogowanie lub wyłączenie konta nie usuwa tej dokumentacji.' },
            { heading: 'Kto może otrzymać dane?',
              text: 'Dane udostępniamy uprawnionym osobom uczestniczącym w obsłudze ENVI i realizacji kontraktów, w zakresie ich zadań. Korzystamy z dostawców usług: Heroku (utrzymanie aplikacji), Kylos (baza danych), MongoDB Atlas (sesje użytkowników) oraz Google Workspace (firmowy Dysk Google). Użycie funkcji analizy dokumentu przez AI wiąże się z przekazaniem analizowanego pliku do usługi OpenAI.' },
            { heading: 'Jakie masz prawa?',
              text: 'Możesz żądać dostępu do danych, ich sprostowania, usunięcia lub ograniczenia przetwarzania, w przypadkach przewidzianych w RODO. Możesz wnieść sprzeciw wobec przetwarzania opartego na prawnie uzasadnionym interesie, z przyczyn związanych z Twoją szczególną sytuacją.' },
            PRIVACY_CONTACT_SECTION,
        ],
    };
}
export class PrivacyError extends Error {
    constructor(message: string, public code: string, public httpStatus: number) { super(message); }
}

