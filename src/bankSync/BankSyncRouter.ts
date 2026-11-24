import { Request, Response, NextFunction } from 'express';
import { app, upload } from '../index';
import BankSyncController, { BankSyncError } from './BankSyncController';
import { BankTransferFilters } from './BankTransferRepository';
import BankTransferRepository from './BankTransferRepository';
import PaymentAllocationRepository from './PaymentAllocationRepository';
import { hasBankModuleAccess } from './bankAccess';
import { salesInvoiceAccess } from '../invoices/salesInvoiceScope';
import InvoicesController from '../invoices/InvoicesController';

const controller = new BankSyncController();
const transferRepo = new BankTransferRepository();
const allocationRepo = new PaymentAllocationRepository();

function handleBankSyncError(err: unknown, res: Response, next: NextFunction): void {
    if (err instanceof BankSyncError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
    }
    next(err);
}

function requireAuth(req: Request, res: Response): boolean {
    if (!req.session.userData) {
        res.status(401).json({ error: 'Użytkownik niezalogowany' });
        return false;
    }
    return true;
}

// Reguła dostępu (flaga HasBankAccess, ADMIN zawsze) jest wspólna z ukrywaniem wpłat w fakturach.
function hasModuleAccess(req: Request): Promise<boolean> {
    return hasBankModuleAccess(req.session?.userData);
}

// Czy zalogowany widzi moduł (do warunkowego menu po stronie klienta).
// Rejestrowane PRZED bramką niżej, żeby samo pytanie o dostęp nie kończyło się 403.
app.get(
    '/bank-transfers/access',
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
 * Dwa prefiksy, bo moduł wystawia i wyciągi (`/bank-statements`), i przelewy
 * (`/bank-transfers`); jedna flaga rozstrzyga o obu.
 */
async function moduleGuard(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.session?.userData) {
            res.status(401).json({ error: 'Użytkownik niezalogowany' });
            return;
        }
        if (!(await hasModuleAccess(req))) {
            res.status(403).json({
                error: 'Brak uprawnień do wyciągów bankowych',
            });
            return;
        }
        next();
    } catch (err) {
        next(err);
    }
}

app.use('/bank-statements', moduleGuard);
app.use('/bank-transfers', moduleGuard);

app.get('/bank-statements', async (_req, res, next) => {
    try {
        res.json(await controller.listStatements());
    } catch (err) {
        handleBankSyncError(err, res, next);
    }
});

app.get('/bank-transfers/invoices/:id/payments', salesInvoiceAccess('invoice'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            res.status(400).json({ error: 'Nieprawidłowa faktura' });
            return;
        }
        res.json(await controller.getInvoicePayments(id));
    } catch (err) {
        handleBankSyncError(err, res, next);
    }
});

app.delete('/bank-transfers/invoices/:id/payments/manual', salesInvoiceAccess('invoice'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            res.status(400).json({ error: 'Nieprawidłowa faktura' });
            return;
        }
        const invoice = await InvoicesController.undoManualPayment(id);
        if (!invoice) {
            res.status(409).json({ error: 'Faktura nie ma oznaczenia zapłaty przyciskiem' });
            return;
        }
        res.json(invoice);
    } catch (err) {
        handleBankSyncError(err, res, next);
    }
});

app.patch('/bank-transfers/:id/dismiss', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const expectedRemaining = Number(req.body?.expectedRemaining);
        const expectedOperationHash = req.body?.expectedOperationHash;
        const validHash = expectedOperationHash === undefined ||
            (typeof expectedOperationHash === 'string' && /^[a-f0-9]{64}$/.test(expectedOperationHash));
        const validAmount = expectedRemaining > 0 || (expectedOperationHash !== undefined && req.body?.expectedRemaining === 0);
        if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(expectedRemaining) || !validAmount || !validHash) {
            res.status(400).json({ error: 'Nieprawidłowy przelew lub kwota' });
            return;
        }
        await controller.dismissIncomingTransfer(id, expectedRemaining, expectedOperationHash);
        res.json({ dismissed: true });
    } catch (err) {
        handleBankSyncError(err, res, next);
    }
});

app.patch('/bank-transfers/:id/restore', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            res.status(400).json({ error: 'Nieprawidłowy przelew' });
            return;
        }
        await controller.restoreIncomingTransfer(id);
        res.json({ restored: true });
    } catch (err) {
        handleBankSyncError(err, res, next);
    }
});

app.post(
    '/bank-statements',
    (_req: Request, res: Response, next: NextFunction) => {
        try {
            controller.assertImportAvailable();
            next();
        } catch (err) {
            handleBankSyncError(err, res, next);
        }
    },
    upload.single('file') as any,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Wybierz plik XML z PKO BP.' });
            }
            const job = await controller.startUpload(req.file.buffer, req.file.originalname, req.session.userData?.enviId);
            res.status(202).location(`/bank-statements/imports/${job.jobId}`).json(job);
        } catch (err) {
            handleBankSyncError(err, res, next);
        }
    },
);

app.get('/bank-statements/imports/:jobId', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
        res.json(controller.getImportStatus(req.params.jobId));
    } catch (err) {
        handleBankSyncError(err, res, next);
    }
});

/**
 * POST /bank-statements/:id/commit
 * Finalize: persist PROPOSED → CONFIRMED allocations
 */
app.post(
    '/bank-statements/:id/commit',
    async (req: Request, res: Response, next: NextFunction) => {
        if (!requireAuth(req, res)) return;
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) return res.status(400).json({ error: 'Nieprawidłowe ID' });

            const userId = (req.session as any)?.userData?.enviId ?? null;
            const result = await controller.commit(id, userId);
            res.json(result);
        } catch (err) {
            handleBankSyncError(err, res, next);
        }
    },
);

/**
 * POST /bank-transfers
 * List transfers with filters via orConditions (standard projektu).
 * Body: { orConditions: [{ searchText?, matchingStatus?, direction?, dateFrom?, dateTo? }] }
 */
app.post(
    '/bank-transfers',
    async (req: Request, res: Response, next: NextFunction) => {
        if (!requireAuth(req, res)) return;
        try {
            const filters: BankTransferFilters = {};
            const body = req.body || {};

            if (body.orConditions && Array.isArray(body.orConditions) && body.orConditions.length > 0) {
                const cond = body.orConditions[0];
                if (typeof cond.searchText === 'string' && cond.searchText.trim())
                    filters.searchText = cond.searchText.trim();
                if (cond.matchingStatus) filters.matchingStatus = cond.matchingStatus;
                if (cond.direction) filters.direction = cond.direction;
                if (cond.dateFrom) filters.dateFrom = cond.dateFrom;
                if (cond.dateTo) filters.dateTo = cond.dateTo;
            }

            const transfers = await transferRepo.find(filters);
            res.json(transfers);
        } catch (err) {
            next(err);
        }
    },
);

/**
 * GET /bank-transfers/duplicates
 * Returns groups of potential duplicate transfers.
 * COUNTERPARTY: same amount + counterparty account; INVOICE_NUMBER: same FV number in OUT description.
 */
app.get(
    '/bank-transfers/duplicates',
    async (req: Request, res: Response, next: NextFunction) => {
        if (!requireAuth(req, res)) return;
        try {
            const duplicates = await controller.getDuplicates();
            res.json(duplicates);
        } catch (err) {
            next(err);
        }
    },
);

/**
 * GET /bank-transfers/wadium-matches
 * Matches paid cash OfferBonds against incoming transfers containing "wadium" in description.
 */
app.get(
    '/bank-transfers/wadium-matches',
    async (req: Request, res: Response, next: NextFunction) => {
        if (!requireAuth(req, res)) return;
        try {
            const matches = await controller.getWadiumMatches();
            res.json(matches);
        } catch (err) {
            next(err);
        }
    },
);

/**
 * GET /bank-transfers/pending
 * Queue: UNMATCHED + PROPOSED transfers with candidates
 */
app.get(
    '/bank-transfers/pending',
    async (req: Request, res: Response, next: NextFunction) => {
        if (!requireAuth(req, res)) return;
        try {
            const transfers = await controller.getPendingTransfers();
            res.json(transfers);
        } catch (err) {
            next(err);
        }
    },
);

/**
 * POST /bank-transfers/:id/allocations
 * Manual allocation: { invoiceId | costInvoiceId, amount }
 */
app.post(
    '/bank-transfers/:id/allocations',
    async (req: Request, res: Response, next: NextFunction) => {
        if (!requireAuth(req, res)) return;
        try {
            const transferId = parseInt(req.params.id, 10);
            if (isNaN(transferId)) return res.status(400).json({ error: 'Nieprawidłowe ID transferu' });

            const userId = (req.session as any)?.userData?.enviId ?? null;
            const result = await controller.createAllocation(transferId, req.body, userId);
            res.status(201).json(result);
        } catch (err) {
            handleBankSyncError(err, res, next);
        }
    },
);

/**
 * DELETE /bank-transfers/:id/allocations/:allocId
 * Remove allocation, recalculate payment status
 */
app.delete(
    '/bank-transfers/:id/allocations/:allocId',
    async (req: Request, res: Response, next: NextFunction) => {
        if (!requireAuth(req, res)) return;
        try {
            const allocId = parseInt(req.params.allocId, 10);
            if (isNaN(allocId)) return res.status(400).json({ error: 'Nieprawidłowe ID alokacji' });

            const result = await controller.deleteAllocation(allocId, Number(req.params.id));
            res.json(result);
        } catch (err) {
            handleBankSyncError(err, res, next);
        }
    },
);

/**
 * GET /bank-transfers/:id/allocations
 * List allocations for a transfer
 */
app.get(
    '/bank-transfers/:id/allocations',
    async (req: Request, res: Response, next: NextFunction) => {
        if (!requireAuth(req, res)) return;
        try {
            const transferId = parseInt(req.params.id, 10);
            if (isNaN(transferId)) return res.status(400).json({ error: 'Nieprawidłowe ID transferu' });

            const allocations = await allocationRepo.findByTransferId(transferId);
            res.json(allocations);
        } catch (err) {
            next(err);
        }
    },
);
