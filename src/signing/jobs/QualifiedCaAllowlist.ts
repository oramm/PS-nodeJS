/**
 * Lista zaufanych urzedow certyfikacji dla podpisow kwalifikowanych (SIG-2).
 *
 * Zaufanie opiera sie na ODCISKU SHA-256 CALEGO certyfikatu CA (DER), nie na nazwie wystawcy:
 * nazwe moze wpisac dowolny, odcisk wymaga klucza, ktory jest u wystawcy. Certyfikat podpisujacego
 * jest przyjety, gdy jego lancuch (kazdy certyfikat podpisany kluczem nastepnego) dochodzi do CA
 * z tej listy.
 *
 * Wpisy pochodza z prawdziwej karty (SIG-0, 2026-10-09): lancuch KIR / Szafir. Kolejnych
 * wystawcow (Certum, EuroCert, Sigillum) dopisujemy po zobaczeniu ich prawdziwych lancuchow
 * (SIG-5), nie "na wiare" z nazw.
 *
 * Odwolania (CRL/OCSP) NIE sa sprawdzane w v1 - ryzyko zapisane w planie SIG.
 */
export interface TrustedCa {
    /** SHA-256 DER certyfikatu CA, 64 znaki hex, wielkie litery. */
    sha256: string;
    /** Tylko do logow i komunikatow; NIE jest uzywane do decyzji o zaufaniu. */
    label: string;
}

export const QUALIFIED_CA_ALLOWLIST: readonly TrustedCa[] = [
    {
        // COPE SZAFIR - Kwalifikowany (Krajowa Izba Rozliczeniowa S.A.), wystawca pod NCCert
        sha256: '9773E45D7BF11D2AE9211447496673B4E46D074FD5BA2AB271B7D07197DEF895',
        label: 'COPE SZAFIR - Kwalifikowany (KIR)',
    },
    {
        // Narodowe Centrum Certyfikacji (Narodowy Bank Polski), korzen samopodpisany
        sha256: '7589DE11E0F590FE2559888E2252529DB1834EC972FEC293FD1E1A8576C12BEA',
        label: 'Narodowe Centrum Certyfikacji (NBP)',
    },
];
