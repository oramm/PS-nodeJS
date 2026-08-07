import { Request, Response, NextFunction } from 'express';
import { app, upload } from '../index';
import BankSyncController, { BankSyncError } from './BankSyncController';
import { BankTransferFilters } from './BankTransferRepository';
import BankTransferRepository from './BankTransferRepository';
import PaymentAllocationRepository from './PaymentAllocationRepository';
import StaffMemberRepository from '../staff/StaffMemberRepository';
import { SystemRoleName } from '../types/sessionTypes';

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

/**
 * Dostęp do wyciągów bankowych wynika z flagi StaffMembers.HasBankAccess, nie z roli
 * systemowej. Seed migracji nadał ją rolom 1 i 2, więc dla dotychczasowych użytkowników
 * nic się nie zmienia; nadanie jej komuś spoza tych ról nie wymaga podnoszenia roli,
 * a odebranie - obniżania jej.
 *
 * ADMIN wchodzi zawsze, niezależnie od flagi: flagi ustawia się dziś wprost w bazie,
 * więc pomyłkowe wyzerowanie kolumny nie może odciąć wszystkim ścieżki naprawy.
 */
async function hasModuleAccess(req: Request): Promise<boolean> {
    const userData = req.session?.userData;
    if (!userData?.enviId) return false;
    if (userData.systemRoleName === SystemRoleName.ADMIN) return true;
    return StaffMemberRepository.hasBankAccess(userData.enviId);
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

/**
 * POST /bank-statements
 * Upload PKO XML file (multipart/form-data, field: file)
 * Returns upload preview: { statementId, total, autoMatched, proposed, unmatched, fees }
 */
app.post(
    '/bank-statements',
    upload.single('file') as any,
    async (req: Request, res: Response, next: NextFunction) => {
        if (!requireAuth(req, res)) return;
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Brak pliku (field: file)' });
            }
            const userId = (req.session as any)?.userData?.enviId ?? null;
            const preview = await controller.upload(req.file.buffer, req.file.originalname, userId);
            res.status(201).json(preview);
        } catch (err) {
            handleBankSyncError(err, res, next);
        }
    },
);

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

            const result = await controller.deleteAllocation(allocId);
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
