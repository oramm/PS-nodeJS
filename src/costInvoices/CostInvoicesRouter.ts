import { Request, Response, NextFunction } from 'express';
import { app } from '../index';
import CostInvoiceController from './CostInvoiceController';
import { SystemRoleName } from '../types/sessionTypes';
import StaffMemberRepository from '../staff/StaffMemberRepository';
import { VALID_PAYMENT_STATUSES } from './CostInvoiceValidator';
import { PaymentMethodFilterValues } from './costInvoicePaymentMethodFilters';

const controller = new CostInvoiceController();
const allowedPaymentStatuses = new Set<string>(VALID_PAYMENT_STATUSES);
const allowedPaymentMethods = new Set<string>(Object.values(PaymentMethodFilterValues));

function assignPaymentFilters(
    source: any,
    filters: { paymentStatus?: string; paymentMethod?: string },
    res: Response,
): boolean {
    if (source.paymentStatus) {
        if (!allowedPaymentStatuses.has(source.paymentStatus)) {
            res.status(400).json({ error: 'Nieprawidłowy paymentStatus' });
            return false;
        }
        filters.paymentStatus = source.paymentStatus;
    }

    if (source.paymentMethod) {
        if (!allowedPaymentMethods.has(source.paymentMethod)) {
            res.status(400).json({ error: 'Nieprawidłowy paymentMethod' });
            return false;
        }
        filters.paymentMethod = source.paymentMethod;
    }

    return true;
}

/**
 * Operacje modyfikujące dane faktur (reparse XML, weryfikacja Białej Listy) —
 * poza samym wglądem w moduł wymagają konta wewnętrznego.
 */
function ensureWritePermission(req: Request, res: Response): number | null {
    const userData = (req.session as any)?.userData;
    if (!userData) {
        res.status(401).json({ error: 'Użytkownik niezalogowany' });
        return null;
    }
    if (userData.systemRoleName === SystemRoleName.EXTERNAL_USER) {
        res.status(403).json({ error: 'Brak uprawnień do modyfikacji faktur kosztowych' });
        return null;
    }
    return userData.enviId;
}

function parseReparseIds(raw: any, res: Response): number[] | null {
    if (!Array.isArray(raw) || raw.length === 0) {
        res.status(400).json({ error: 'Brak listy ids' });
        return null;
    }

    const ids: number[] = [];
    for (const value of raw) {
        const parsed = parseInt(String(value), 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            res.status(400).json({ error: 'Nieprawidłowe id w liście' });
            return null;
        }
        if (!ids.includes(parsed)) ids.push(parsed);
    }

    return ids;
}

// =====================================================
// DOSTĘP DO MODUŁU
// =====================================================

/**
 * Dostęp do faktur kosztowych wynika z flagi StaffMembers.HasCostInvoiceAccess,
 * nie z roli systemowej. Seed migracji nadał ją rolom 1 i 2, więc dla dotychczasowych
 * użytkowników nic się nie zmienia; nadanie jej komuś spoza tych ról (np. księgowej
 * z rolą 3) nie wymaga już podnoszenia roli, a odebranie - obniżania jej.
 *
 * ADMIN wchodzi zawsze, niezależnie od flagi: flagi ustawia się dziś wprost w bazie,
 * więc pomyłkowe wyzerowanie kolumny nie może odciąć wszystkim ścieżki naprawy.
 *
 * Rolom zakresowym (CONTRACT_WORKER, CLIENT) sama flaga nie wystarczy - ich żądania
 * odsiewa wcześniej allowlista tras w projectScopedPolicy, która nie zna /cost-invoices.
 */
async function hasModuleAccess(req: Request): Promise<boolean> {
    const userData = req.session?.userData;
    if (!userData?.enviId) return false;
    if (userData.systemRoleName === SystemRoleName.ADMIN) return true;
    return StaffMemberRepository.hasCostInvoiceAccess(userData.enviId);
}

// Czy zalogowany widzi moduł (do warunkowego menu po stronie klienta).
// Rejestrowane PRZED bramką niżej, żeby samo pytanie o dostęp nie kończyło się 403.
app.get(
    '/cost-invoices/access',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            res.json({ hasAccess: await hasModuleAccess(req) });
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Bramka całego modułu w jednym miejscu zamiast sprawdzenia powtarzanego w każdej
 * trasie: trasa dopisana tu w przyszłości jest domyślnie zamknięta, a nie domyślnie
 * otwarta. Musi stać przed rejestracją tras poniżej - Express dopasowuje w kolejności.
 */
app.use(
    '/cost-invoices',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.session?.userData) {
                res.status(401).json({ error: 'Użytkownik niezalogowany' });
                return;
            }
            if (!(await hasModuleAccess(req))) {
                res.status(403).json({
                    error: 'Brak uprawnień do faktur kosztowych',
                });
                return;
            }
            next();
        } catch (error) {
            next(error);
        }
    },
);

// =====================================================
// SYNCHRONIZACJA
// =====================================================

/**
 * POST /cost-invoices/sync
 * 
 * Synchronizacja faktur zakupowych z KSeF
 * 
 * Body:
 * - syncType: 'INCREMENTAL' | 'VERIFICATION'
 * - dateFrom?: string (ISO date) - wymagane dla VERIFICATION
 * - dateTo?: string (ISO date) - wymagane dla VERIFICATION
 */
app.post(
    '/cost-invoices/sync',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { syncType, dateFrom, dateTo } = req.body;
            const userId = (req as any).user?.id;

            let result;

            if (syncType === 'VERIFICATION') {
                if (!dateFrom || !dateTo) {
                    return res.status(400).json({
                        error: 'dateFrom i dateTo są wymagane dla synchronizacji weryfikacyjnej',
                    });
                }

                result = await controller.syncVerification(
                    new Date(dateFrom),
                    new Date(dateTo),
                    userId,
                );
            } else {
                // Domyślnie INCREMENTAL
                result = await controller.syncIncremental(userId);
            }

            res.json({
                success: true,
                message: `Synchronizacja zakończona: ${result.imported} zaimportowanych, ${result.alreadyAdded} już dodane${result.failedCount > 0 ? `, ${result.failedCount} błędne` : ''}`,
                data: {
                    ...result,
                    errorDetails: result.errors,
                },
            });
        } catch (error) {
            next(error);
        }
    },
);

// =====================================================
// LISTA I SZCZEGÓŁY FAKTUR
// =====================================================

// =====================================================
// RE-PARSE XML
// =====================================================

/**
 * POST /cost-invoices/reparse-all
 *
 * Ponownie parsuje XML ze wszystkich faktur w bazie i aktualizuje pola
 * wyprowadzane z XML: paymentStatus, paidAmount, paymentDate, paymentMethod, invoiceType.
 * Używane do naprawienia faktur zaimportowanych przed wprowadzeniem nowych pól.
 */
app.post(
    '/cost-invoices/reparse-all',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = ensureWritePermission(req, res);
            if (userId === null) return;

            const result = await controller.reparseAllFromXml();

            res.json({
                success: true,
                message: `Reparse zakończony: ${result.updated} zaktualizowanych, ${result.errors.length} błędów`,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    },
);

/**
 * POST /cost-invoices/reparse-preview
 *
 * Zwraca tylko faktury, w których parser wykryje zmiany w nagłówku (bez pozycji).
 */
app.post(
    '/cost-invoices/reparse-preview',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = ensureWritePermission(req, res);
            if (userId === null) return;

            const result = await controller.reparsePreviewFromXml();

            res.json({
                success: true,
                message: `Podgląd reparse: ${result.changed} faktur ze zmianami`,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    },
);

/**
 * POST /cost-invoices/reparse-apply
 *
 * Zastosuj reparse dla wybranych faktur (per faktura).
 * Body: { ids: number[] }
 */
app.post(
    '/cost-invoices/reparse-apply',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = ensureWritePermission(req, res);
            if (userId === null) return;

            const ids = parseReparseIds(req.body?.ids, res);
            if (!ids) return;

            const result = await controller.reparseApplyFromXml(ids);

            res.json({
                success: true,
                message: `Reparse zastosowany: ${result.updated} zaktualizowanych, ${result.errors.length} błędów`,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    },
);

/**
 * POST /cost-invoices/:id/reparse
 *
 * Ponownie parsuje XML wskazanej faktury.
 */
app.post(
    '/cost-invoices/:id/reparse',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = ensureWritePermission(req, res);
            if (userId === null) return;

            const rawId = String(req.params.id ?? '').trim();
            if (!/^[1-9]\d*$/.test(rawId)) {
                return res.status(400).json({ error: 'Nieprawidłowe id faktury' });
            }
            const id = parseInt(rawId, 10);
            const invoice = await controller.reparseFromXml(id);

            res.json({
                success: true,
                message: `Faktura ${id} przeparsowana pomyślnie`,
                data: invoice.toJson(),
            });
        } catch (error: any) {
            if (error?.statusCode) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            next(error);
        }
    },
);

/**
 * POST /cost-invoices/:id/white-list/check
 *
 * Ręczna (re-)weryfikacja rachunku bankowego dostawcy na Białej Liście VAT (KAS wl-api).
 * Nadpisuje poprzedni wynik (przechowywany jest tylko ostatni). Przydatne do sprawdzenia
 * stanu na dzień płatności (opcjonalny `date` w body, domyślnie dziś).
 *
 * Body:
 * - date?: string (ISO date) — dzień, na który sprawdzić wpis (np. dzień płatności)
 */
app.post(
    '/cost-invoices/:id/white-list/check',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = ensureWritePermission(req, res);
            if (userId === null) return;

            const rawId = String(req.params.id ?? '').trim();
            if (!/^[1-9]\d*$/.test(rawId)) {
                return res.status(400).json({ error: 'Nieprawidłowe id faktury' });
            }
            const id = parseInt(rawId, 10);

            let asOfDate: Date | undefined;
            if (req.body?.date) {
                const parsed = new Date(req.body.date);
                if (isNaN(parsed.getTime())) {
                    return res.status(400).json({ error: 'Nieprawidłowa data' });
                }
                // wl-api 400-uje daty z przyszłości → klient mapuje na ERROR i nadpisałby
                // poprzedni wynik. Odrzuć zawczasu (walidacja wejścia; semantyka overwrite bez zmian).
                const endOfToday = new Date();
                endOfToday.setHours(23, 59, 59, 999);
                if (parsed.getTime() > endOfToday.getTime()) {
                    return res.status(400).json({ error: 'Data nie może być z przyszłości' });
                }
                asOfDate = parsed;
            }

            const invoice = await controller.checkWhiteList(id, asOfDate);

            res.json({
                success: true,
                message: `Weryfikacja Białej Listy: ${invoice.whiteListStatus}`,
                data: invoice.toJson(),
            });
        } catch (error: any) {
            if (error?.statusCode) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            next(error);
        }
    },
);

/**
 * POST /cost-invoices
 *
 * Pobierz listę faktur kosztowych z filtrami w body (standard projektu)
 * 
 * Body:
 * - orConditions?: Array<{ dateFrom?, dateTo?, supplierNip?, paymentStatus?, paymentMethod? }>
 * - dateFrom?: string (ISO date)
 * - dateTo?: string (ISO date)
 * - supplierNip?: string
 * - paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'NOT_APPLICABLE'
 * - paymentMethod?: 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'MOBILE' | 'VOUCHER' | 'CHECK' | 'CREDIT' | 'OTHER_OR_EMPTY'
 */
app.post(
    '/cost-invoices',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const filters: any = {};
            const body = req.body || {};

            // Obsługa orConditions (standard projektu)
            if (body.orConditions && Array.isArray(body.orConditions) && body.orConditions.length > 0) {
                const cond = body.orConditions[0];
                if (typeof cond.searchText === 'string' && cond.searchText.trim()) {
                    filters.searchText = cond.searchText.trim();
                }
                if (cond.dateFrom) filters.dateFrom = new Date(cond.dateFrom);
                if (cond.dateTo) filters.dateTo = new Date(cond.dateTo);
                if (cond.supplierNip) filters.supplierNip = cond.supplierNip;
                if (!assignPaymentFilters(cond, filters, res)) return;
            } else {
                // Bezpośrednie filtry w body
                if (typeof body.searchText === 'string' && body.searchText.trim()) {
                    filters.searchText = body.searchText.trim();
                }
                if (body.dateFrom) filters.dateFrom = new Date(body.dateFrom);
                if (body.dateTo) filters.dateTo = new Date(body.dateTo);
                if (body.supplierNip) filters.supplierNip = body.supplierNip;
                if (!assignPaymentFilters(body, filters, res)) return;
            }

            const invoices = await controller.findAll(filters);

            // Zwróć w formacie oczekiwanym przez frontend
            res.send(invoices.map((inv) => inv.toJson()));
        } catch (error) {
            next(error);
        }
    },
);

/**
 * GET /cost-invoices
 * 
 * Pobierz listę faktur kosztowych z opcjonalnymi filtrami
 * 
 * Query params:
 * - dateFrom?: string (ISO date)
 * - dateTo?: string (ISO date)
 * - supplierNip?: string
 * - paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'NOT_APPLICABLE'
 * - paymentMethod?: 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'MOBILE' | 'VOUCHER' | 'CHECK' | 'CREDIT' | 'OTHER_OR_EMPTY'
 */
app.get(
    '/cost-invoices',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const filters: any = {};

            if (typeof req.query.searchText === 'string' && req.query.searchText.trim()) {
                filters.searchText = req.query.searchText.trim();
            }
            if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
            if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);
            if (req.query.supplierNip) filters.supplierNip = req.query.supplierNip as string;
            if (!assignPaymentFilters(req.query, filters, res)) return;

            const invoices = await controller.findAll(filters);

            res.json({
                success: true,
                data: invoices.map((inv) => inv.toJson()),
            });
        } catch (error) {
            next(error);
        }
    },
);

/**
 * GET /cost-invoices/:id
 * 
 * Pobierz szczegóły faktury kosztowej
 */
app.get(
    '/cost-invoices/:id',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = parseInt(req.params.id, 10);
            const invoice = await controller.findById(id);

            if (!invoice) {
                return res.status(404).json({
                    error: 'Faktura nie znaleziona',
                });
            }

            res.json({
                success: true,
                data: invoice.toJson(),
            });
        } catch (error) {
            next(error);
        }
    },
);

/**
 * GET /cost-invoices/:id/qr
 *
 * Zwraca dane potrzebne do wygenerowania kodu QR KSeF.
 */
app.get(
    '/cost-invoices/:id/qr',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const rawId = String(req.params.id ?? '').trim();
            if (!/^[1-9]\d*$/.test(rawId)) {
                return res.status(400).json({ error: 'Nieprawidłowe id faktury' });
            }
            const id = parseInt(rawId, 10);
            const qrData = await controller.getQrData(id);

            res.json({
                success: true,
                data: qrData,
            });
        } catch (error: any) {
            if (error?.statusCode) {
                return res.status(error.statusCode).json({
                    error: error.message,
                });
            }
            next(error);
        }
    },
);

// =====================================================
// AKTUALIZACJA DANYCH RĘCZNYCH
// =====================================================

/**
 * PATCH /cost-invoices/:id
 *
 * Aktualizuj dane faktury edytowalne ręcznie: notatkę i stan płatności.
 *
 * Body:
 * - notes?: string
 * - paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'NOT_APPLICABLE'
 * - paidAmount?: number
 */
app.patch(
    '/cost-invoices/:id',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { notes, paymentStatus, paidAmount } = req.body || {};

            const invoice = await controller.updateSettings(id, {
                notes,
                paymentStatus,
                paidAmount,
            });

            res.json({
                success: true,
                message: 'Ustawienia zaktualizowane',
                data: invoice.toJson(),
            });
        } catch (error: any) {
            if (error?.statusCode) {
                return res.status(error.statusCode).json({
                    error: error.message,
                });
            }
            next(error);
        }
    },
);
