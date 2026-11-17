/**
 * Stale zlecen podpisu (SIG-2). Zmiana ktorejkolwiek wartosci to decyzja produktowa, nie techniczna.
 */

/** Jak dlugo token zlecenia jest wazny od zalozenia. Plan: "kilka minut". */
export const JOB_TTL_MS = 10 * 60 * 1000;

/**
 * Najstarsza wersja programu ENVI Podpis, ktora obsluzy zlecenie. Zapisywana w zleceniu w chwili
 * zalozenia; podnosimy ja dopiero wtedy, gdy kontrakt miedzy programem a serwerem sie zmieni.
 * Zrodlo prawdy o wersji programu: desktop/envi-podpis (AssemblyInfo.cs).
 */
export const MIN_PROGRAM_VERSION = '1.0.0';

/** Maksymalna liczba plikow w jednym zleceniu (pismo + zalaczniki). */
export const MAX_FILES_PER_JOB = 20;

/**
 * Maksymalny rozmiar pojedynczego pliku zrodlowego/przygotowanego PDF (bajty). PDF jest trzymany
 * w bazie (LONGBLOB) miedzy krokiem certyfikatu a podpisem, a polaczenie ma max_allowed_packet
 * (domyslnie 16 MB w MariaDB 10.6), wiec limit musi byc wyraznie nizszy.
 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Limit wgrania recznego ("Wgraj podpisany"). */
export const MAX_UPLOAD_BYTES = MAX_PDF_BYTES;

/** Ile pism naraz mozna zapytac o podpisy (plakietki na liscie pism). */
export const MAX_LETTERS_PER_SUMMARY = 500;

/** Token: 32 losowe bajty w base64url = 43 znaki; program akceptuje [A-Za-z0-9_-]{20,128}. */
export const TOKEN_BYTES = 32;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

/** Link otwierajacy program. Host i lista plikow NIE sa w linku - tylko token. */
export const PROTOCOL_PREFIX = 'envi-podpis://job/';

/** Strefa czasowa do sufiksu nazwy przy powtornym podpisie (D-SIG-4). */
export const FILE_NAME_TIME_ZONE = 'Europe/Warsaw';

/** Kod MIME plikow, ktore mozna podpisac (po eksporcie do PDF). */
export const MIME_PDF = 'application/pdf';
export const MIME_GOOGLE_DOC = 'application/vnd.google-apps.document';
export const MIME_GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';
export const MIME_GOOGLE_FOLDER = 'application/vnd.google-apps.folder';
