import { Request, Response, NextFunction } from 'express';
import { app } from '../index';
import CostInvoiceController from './CostInvoiceController';
import { SystemRoleName } from '../types/sessionTypes';
import { CostInvoiceValidator } from './CostInvoiceValidator';

const controller = new CostInvoiceController();

function ensureBookingPermission(req: Request, res: Response): number | null {
    const userData = (req.session as any)?.userData;
    if (!userData) {
        res.status(401).json({ error: 'Użytkownik niezalogowany' });
        return null;
    }
    if (userData.systemRoleName === SystemRoleName.EXTERNAL_USER) {
        res.status(403).json({ error: 'Brak uprawnień do księgowania' });
        return null;
    }
    return userData.enviId;
}

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
                message: `Synchronizacja zakończona: ${result.imported} zaimportowanych, ${result.skipped} pominięte`,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    },
);

// =====================================================
// LISTA I SZCZEGÓŁY FAKTUR
// =====================================================

/**
 * POST /cost-invoices
 * 
 * Pobierz listę faktur kosztowych z filtrami w body (standard projektu)
 * 
 * Body:
 * - orConditions?: Array<{ status?, dateFrom?, dateTo?, supplierNip?, categoryId? }>
 * - status?: 'NEW' | 'EXCLUDED' | 'BOOKED'
 * - dateFrom?: string (ISO date)
 * - dateTo?: string (ISO date)
 * - supplierNip?: string
 * - categoryId?: number
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
                if (cond.status) filters.status = cond.status;
                if (cond.dateFrom) filters.dateFrom = new Date(cond.dateFrom);
                if (cond.dateTo) filters.dateTo = new Date(cond.dateTo);
                if (cond.supplierNip) filters.supplierNip = cond.supplierNip;
                if (cond.categoryId) filters.categoryId = parseInt(cond.categoryId, 10);
            } else {
                // Bezpośrednie filtry w body
                if (body.status) filters.status = body.status;
                if (body.dateFrom) filters.dateFrom = new Date(body.dateFrom);
                if (body.dateTo) filters.dateTo = new Date(body.dateTo);
                if (body.supplierNip) filters.supplierNip = body.supplierNip;
                if (body.categoryId) filters.categoryId = parseInt(body.categoryId, 10);
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
 * - status?: 'NEW' | 'EXCLUDED' | 'BOOKED'
 * - dateFrom?: string (ISO date)
 * - dateTo?: string (ISO date)
 * - supplierNip?: string
 * - categoryId?: number
 */
app.get(
    '/cost-invoices',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const filters: any = {};

            if (req.query.status) filters.status = req.query.status as string;
            if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
            if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);
            if (req.query.supplierNip) filters.supplierNip = req.query.supplierNip as string;
            if (req.query.categoryId) filters.categoryId = parseInt(req.query.categoryId as string, 10);

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
 * GET /cost-invoices/categories
 * 
 * Pobierz listę kategorii kosztów
 */
app.get(
    '/cost-invoices/categories',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const categories = await controller.getCategories();

            res.json({
                success: true,
                data: categories,
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
 * GET /cost-invoices/:id/booking-validation
 *
 * Zwraca listę błędów walidacji księgowania
 */
app.get(
    '/cost-invoices/:id/booking-validation',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = parseInt(req.params.id, 10);
            const result = await controller.validateBooking(id);

            res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            if (error?.statusCode) {
                return res.status(error.statusCode).json({
                    error: error.message,
                    details: error.details,
                });
            }
            next(error);
        }
    },
);

// =====================================================
// AKTUALIZACJA USTAWIEŃ KSIĘGOWANIA
// =====================================================

/**
 * PATCH /cost-invoices/:id
 * 
 * Aktualizuj ustawienia księgowania faktury
 * 
 * Body:
 * - status?: 'NEW' | 'EXCLUDED' | 'BOOKED'
 * - bookingPercentage?: number (0-100)
 * - vatDeductionPercentage?: number (0-100)
 * - categoryId?: number
 * - notes?: string
 */
app.patch(
    '/cost-invoices/:id',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = parseInt(req.params.id, 10);
            const status = req.body?.status;

            if (status && !['NEW', 'EXCLUDED', 'BOOKED'].includes(status)) {
                return res.status(400).json({ error: `Nieprawidłowy status: ${status}` });
            }

            const paymentValidationError = CostInvoiceValidator.validatePaymentUpdate(req.body ?? {});
            if (paymentValidationError) {
                return res.status(400).json({ error: paymentValidationError });
            }

            let bookedBy: number | undefined;
            if (status === 'BOOKED') {
                const userId = ensureBookingPermission(req, res);
                if (!userId) return;
                bookedBy = userId;
            }

            const settings = {
                ...req.body,
                bookedBy,
            };

            const invoice = await controller.updateBookingSettings(id, settings);

            res.json({
                success: true,
                message: 'Ustawienia zaktualizowane',
                data: invoice.toJson(),
            });
        } catch (error: any) {
            if (error?.statusCode) {
                return res.status(error.statusCode).json({
                    error: error.message,
                    details: error.details,
                });
            }
            next(error);
        }
    },
);

/**
 * PATCH /cost-invoices/:id/items/:itemId
 * 
 * Aktualizuj ustawienia księgowania pozycji faktury
 * 
 * Body:
 * - isSelectedForBooking?: boolean
 * - bookingPercentage?: number (0-100)
 * - vatDeductionPercentage?: number (0-100)
 * - categoryId?: number
 */
app.patch(
    '/cost-invoices/:id/items/:itemId',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const invoiceId = parseInt(req.params.id, 10);
            const itemId = parseInt(req.params.itemId, 10);

            await controller.updateItemBookingSettings(itemId, invoiceId, req.body);

            res.json({
                success: true,
                message: 'Pozycja zaktualizowana',
            });
        } catch (error) {
            next(error);
        }
    },
);

/**
 * POST /cost-invoices/:id/book
 * 
 * Oznacz fakturę jako zaksięgowaną
 */
app.post(
    '/cost-invoices/:id/book',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = parseInt(req.params.id, 10);
            const userId = ensureBookingPermission(req, res);
            if (!userId) return;

            const invoice = await controller.updateBookingSettings(id, {
                status: 'BOOKED',
                bookedBy: userId,
            });

            res.json({
                success: true,
                message: 'Faktura zaksięgowana',
                data: invoice.toJson(),
            });
        } catch (error: any) {
            if (error?.statusCode) {
                return res.status(error.statusCode).json({
                    error: error.message,
                    details: error.details,
                });
            }
            next(error);
        }
    },
);

// =====================================================
// RAPORT MIESIĘCZNY
// =====================================================

/**
 * GET /cost-invoices/report/monthly
 * 
 * Generuj raport miesięczny faktur kosztowych
 * 
 * Query params:
 * - year: number (wymagane)
 * - month: number 1-12 (wymagane)
 * - format: 'json' | 'csv' | 'xml' (domyślnie 'json')
 */
app.get(
    '/cost-invoices/report/monthly',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const year = parseInt(req.query.year as string, 10);
            const month = parseInt(req.query.month as string, 10);
            const format = (req.query.format as string) || 'json';

            if (!year || !month || month < 1 || month > 12) {
                return res.status(400).json({
                    error: 'Wymagane parametry: year (liczba), month (1-12)',
                });
            }

            // Zakres dat dla miesiąca
            const dateFrom = new Date(year, month - 1, 1);
            const dateTo = new Date(year, month, 0); // Ostatni dzień miesiąca

            const invoices = await controller.findAll({
                dateFrom,
                dateTo,
            });

            const bookedInvoices = invoices.filter((inv) => inv.status === 'BOOKED');
            const summaryInvoices = format === 'json' ? invoices : bookedInvoices;

            // Podsumowanie
            const summary = {
                year,
                month,
                totalInvoices: summaryInvoices.length,
                totalNet: 0,
                totalVat: 0,
                totalGross: 0,
                bookableNet: 0,
                deductibleVat: 0,
                byCategory: {} as Record<string, { count: number; net: number; vat: number }>,
                byStatus: {} as Record<string, number>,
            };

            for (const inv of summaryInvoices) {
                summary.totalNet += Number(inv.netAmount) || 0;
                summary.totalVat += Number(inv.vatAmount) || 0;
                summary.totalGross += Number(inv.grossAmount) || 0;

                if (inv.status === 'BOOKED') {
                    summary.bookableNet += Number(inv.bookableNetAmount) || 0;
                    summary.deductibleVat += Number(inv.deductibleVatAmount) || 0;
                }

                const categoryName = inv._category?.name || 'Bez kategorii';
                if (!summary.byCategory[categoryName]) {
                    summary.byCategory[categoryName] = { count: 0, net: 0, vat: 0 };
                }
                summary.byCategory[categoryName].count++;
                summary.byCategory[categoryName].net += Number(inv.netAmount) || 0;
                summary.byCategory[categoryName].vat += Number(inv.vatAmount) || 0;

                summary.byStatus[inv.status] = (summary.byStatus[inv.status] || 0) + 1;
            }

            // Format odpowiedzi
            if (format === 'csv') {
                const csvLines = [
                    'Numer KSeF;Nr faktury;Data wystawienia;Dostawca NIP;Dostawca;Netto;VAT;Brutto;Netto do księg.;VAT do odlicz.;Kategoria',
                ];

                for (const inv of bookedInvoices) {
                    const netAmount = Number(inv.netAmount) || 0;
                    const vatAmount = Number(inv.vatAmount) || 0;
                    const grossAmount = Number(inv.grossAmount) || 0;
                    const bookableNetAmount = Number(inv.bookableNetAmount) || 0;
                    const deductibleVatAmount = Number(inv.deductibleVatAmount) || 0;

                    csvLines.push([
                        inv.ksefNumber,
                        inv.invoiceNumber,
                        inv.issueDate.toISOString().split('T')[0],
                        inv.supplierNip || '',
                        `"${inv.supplierName.replace(/"/g, '""')}"`,
                        netAmount.toFixed(2),
                        vatAmount.toFixed(2),
                        grossAmount.toFixed(2),
                        bookableNetAmount.toFixed(2),
                        deductibleVatAmount.toFixed(2),
                        inv._category?.name || '',
                    ].join(';'));
                }

                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="koszty_${year}_${String(month).padStart(2, '0')}.csv"`);
                return res.send('\uFEFF' + csvLines.join('\n')); // BOM for Excel
            }

            if (format === 'xml') {
                let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
                xml += `<RaportMiesieczny rok="${year}" miesiac="${month}">\n`;
                xml += '  <Podsumowanie>\n';
                xml += `    <LiczbaFaktur>${summary.totalInvoices}</LiczbaFaktur>\n`;
                xml += `    <SumaNetto>${summary.totalNet.toFixed(2)}</SumaNetto>\n`;
                xml += `    <SumaVat>${summary.totalVat.toFixed(2)}</SumaVat>\n`;
                xml += `    <SumaBrutto>${summary.totalGross.toFixed(2)}</SumaBrutto>\n`;
                xml += `    <NettoDoKsiegowania>${summary.bookableNet.toFixed(2)}</NettoDoKsiegowania>\n`;
                xml += `    <VatDoOdliczenia>${summary.deductibleVat.toFixed(2)}</VatDoOdliczenia>\n`;
                xml += '  </Podsumowanie>\n';
                xml += '  <Faktury>\n';

                for (const inv of bookedInvoices) {
                    const netAmount = Number(inv.netAmount) || 0;
                    const vatAmount = Number(inv.vatAmount) || 0;
                    const grossAmount = Number(inv.grossAmount) || 0;
                    const bookableNetAmount = Number(inv.bookableNetAmount) || 0;
                    const deductibleVatAmount = Number(inv.deductibleVatAmount) || 0;

                    xml += '    <Faktura>\n';
                    xml += `      <NumerKSeF>${inv.ksefNumber}</NumerKSeF>\n`;
                    xml += `      <NumerFaktury>${escapeXml(inv.invoiceNumber)}</NumerFaktury>\n`;
                    xml += `      <DataWystawienia>${inv.issueDate.toISOString().split('T')[0]}</DataWystawienia>\n`;
                    xml += `      <DostawcaNIP>${inv.supplierNip || ''}</DostawcaNIP>\n`;
                    xml += `      <DostawcaNazwa>${escapeXml(inv.supplierName)}</DostawcaNazwa>\n`;
                    xml += `      <Netto>${netAmount.toFixed(2)}</Netto>\n`;
                    xml += `      <VAT>${vatAmount.toFixed(2)}</VAT>\n`;
                    xml += `      <Brutto>${grossAmount.toFixed(2)}</Brutto>\n`;
                    xml += `      <NettoDoKsiegowania>${bookableNetAmount.toFixed(2)}</NettoDoKsiegowania>\n`;
                    xml += `      <VatDoOdliczenia>${deductibleVatAmount.toFixed(2)}</VatDoOdliczenia>\n`;
                    xml += `      <Kategoria>${inv._category?.name || ''}</Kategoria>\n`;
                    xml += '    </Faktura>\n';
                }

                xml += '  </Faktury>\n';
                xml += '</RaportMiesieczny>';

                res.setHeader('Content-Type', 'application/xml; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="koszty_${year}_${String(month).padStart(2, '0')}.xml"`);
                return res.send(xml);
            }

            // Domyślnie JSON
            res.json({
                success: true,
                data: {
                    summary,
                    invoices: summaryInvoices.map((inv) => {
                        const json = inv.toJson();
                        //delete json.status;
                        return json;
                    }),
                },
            });
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Escape znaków specjalnych XML
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
