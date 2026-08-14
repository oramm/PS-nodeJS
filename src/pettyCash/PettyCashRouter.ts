import { NextFunction, Request, Response } from 'express';
import { app, upload } from '../index';
import Setup from '../setup/Setup';
import ReceiptAnalyzer from './documents/ReceiptAnalyzer';
import { SystemRoleName } from '../types/sessionTypes';
import PettyCashEntryController, {
    PettyCashError,
} from './PettyCashEntryController';
import { PettyCashValidationError } from './PettyCashEntryValidator';

/**
 * Zaliczki i rejestr listow.
 *
 * Modul pisze do firmowych arkuszy ksiegowych, wiec jest zamkniety dla rol
 * zakresowych i uzytkownikow zewnetrznych. Bramka stoi raz, przed trasami:
 * trasa dopisana tu w przyszlosci jest domyslnie zamknieta, a nie otwarta.
 */
/** Musi odpowiadac `MainSetup.STAFF_ROLES` po stronie frontu - inaczej menu pokazuje trase, ktora oddaje 403. */
const ALLOWED_ROLES = new Set<string>([
    SystemRoleName.ADMIN,
    SystemRoleName.ENVI_MANAGER,
    SystemRoleName.ENVI_EMPLOYEE,
]);

function hasAccess(req: Request): boolean {
    const userData = (req.session as any)?.userData;
    return Boolean(userData?.enviId && ALLOWED_ROLES.has(userData.systemRoleName));
}

// Swiadomie BEZ endpointu `/pettyCash/access`. Faktury kosztowe go maja, bo tam dostep
// wynika z flagi w StaffMembers, ktorej klient nie zna. Tu bramka jest czysto rolowa,
// a role front i tak ma w sesji - pytanie serwera o cos, co juz wie, byloby zbedne.
app.use('/pettyCash', (req: Request, res: Response, next: NextFunction) => {
    if (!(req.session as any)?.userData) {
        res.status(401).json({ error: 'Uzytkownik niezalogowany' });
        return;
    }
    if (!hasAccess(req)) {
        res.status(403).json({ error: 'Brak uprawnien do modulu zaliczek' });
        return;
    }
    next();
});

function handle(error: unknown, res: Response, next: NextFunction) {
    if (error instanceof PettyCashValidationError) {
        res.status(error.status).json({ error: error.message, errors: error.errors });
        return;
    }
    if (error instanceof PettyCashError) {
        res.status(error.status).json({ error: error.message });
        return;
    }
    next(error);
}

/**
 * GET /pettyCash/links
 * Adresy obu arkuszy, zeby front mogl je pokazac bez zaszywania identyfikatorow.
 * Identyfikatory zyja w env, wiec w dev prowadza do kopii, a na produkcji do plikow zywych.
 */
app.get('/pettyCash/links', (_req: Request, res: Response) => {
    const sheetUrl = (id: string) =>
        id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
    res.json({
        pettyCashUrl: sheetUrl(Setup.PettyCash.spreadsheetId),
        registerUrl: sheetUrl(Setup.PettyCash.registerSpreadsheetId),
    });
});

/**
 * POST /pettyCash/entries
 * Tworzy wpis: dla wysylki pocztowej blok w rejestrze listow oraz wiersz w zaliczkach,
 * dla pozostalych rodzajow sam wiersz w zaliczkach.
 */
app.post('/pettyCash/entries', async (req: Request, res: Response, next) => {
    try {
        const result = await PettyCashEntryController.addFromDto(req.body);
        res.status(201).json(result);
    } catch (error) {
        handle(error, res, next);
    }
});

/**
 * POST /pettyCash/documents/analyze
 * Zdjecie albo PDF paragonu/faktury -> podpowiedzi kwot i numeru dokumentu.
 *
 * Niczego nie zapisuje: oddaje wartosci do wstawienia w formularz, ktory czlowiek
 * i tak oglada w podgladzie przed zatwierdzeniem. Blad rozpoznania nie jest wiec
 * bledem systemu - dlatego przy nieudanym odczycie odpowiadamy 200 z `recognized:false`
 * i wyjasnieniem, a nie kodem bledu.
 */
app.post(
    '/pettyCash/documents/analyze',
    upload.single('file') as any,
    async (req: Request, res: Response, next) => {
        try {
            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file) {
                res.status(400).json({ error: 'Brak pliku do analizy' });
                return;
            }
            res.json(await ReceiptAnalyzer.analyze(file));
        } catch (error) {
            // Nieobslugiwany format albo brak tesseracta to nie awaria wpisu - czlowiek
            // wpisuje dane recznie tak samo jak dotad.
            console.warn('[pettyCash] analiza dokumentu nieudana:', error);
            res.json({
                documentNumber: null,
                netAmount: null,
                grossAmount: null,
                recognized: false,
                reason:
                    'Nie udalo sie odczytac tego pliku. Wpisz kwoty i numer recznie, ' +
                    'albo sprobuj z wyrazniejszym zdjeciem.',
            });
        }
    },
);
