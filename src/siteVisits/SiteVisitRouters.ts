import { Request, Response } from 'express';
import { app, upload } from '../index';
import SiteVisitController from './SiteVisitController';
import { SiteVisitInputDto } from './SiteVisitValidator';
import { SiteVisitSearchParams } from './SiteVisitRepository';
import StaffMemberRepository from '../staff/StaffMemberRepository';
import { ForbiddenError } from '../persons/projectAssignments/ProjectScopeGuard';
import { SystemRoleName } from '../types/sessionTypes';

// Rola 1/2 (ADMIN/ENVI_MANAGER) - przegląd wizyt wszystkich osób bez ograniczeń.
function isAdminRole(req: Request): boolean {
    const roleId = req.session.userData?.systemRoleId;
    return roleId === 1 || roleId === 2;
}

/** Rejestrowanie własnych wizyt: rola 1/2 (domyślnie) LUB flaga StaffMembers.CanLogSiteVisits. */
async function canLogVisits(req: Request): Promise<boolean> {
    const personId = req.session.userData?.enviId;
    if (!personId) return false;
    if (isAdminRole(req)) return true;
    return StaffMemberRepository.hasSiteVisitAccess(personId);
}

/**
 * Przegląd wizyt cudzych: rola 1/2 widzi wszystko, klient - wyłącznie wizyty ze swoich
 * projektów (zawęża je req.projectScope przekazywany do repozytorium). Dla klienta to
 * uprawnienie z samej roli, niezależne od flagi CanLogSiteVisits: klient ma czytać
 * raporty, nawet gdy sam wizyt nie rejestruje.
 */
function canViewOverview(req: Request): boolean {
    if (isAdminRole(req)) return true;
    return req.session.userData?.systemRoleName === SystemRoleName.CLIENT;
}

/** Dostęp do modułu w ogóle - do warunkowego menu po stronie klienta. */
async function hasModuleAccess(req: Request): Promise<boolean> {
    if (!req.session.userData?.enviId) return false;
    return canViewOverview(req) || (await canLogVisits(req));
}

/** Zalogowany, który może rejestrować wizyty i oglądać swoje. */
async function requireLogAccess(req: Request): Promise<number> {
    const personId = req.session.userData?.enviId;
    if (!personId) throw new Error('Musisz być zalogowany.');
    // ForbiddenError, a nie zwykły Error: globalny handler mapuje 5xx na mail z raportem
    // błędu do zespołu, a odmowa dostępu to normalna odpowiedź, nie awaria serwera.
    if (!(await canLogVisits(req)))
        throw new ForbiddenError('Brak uprawnień do rejestru wizyt na budowie.');
    return personId;
}

/** Zalogowany z dostępem do modułu (rejestrowanie albo sam przegląd). */
async function requireModuleAccess(req: Request): Promise<number> {
    const personId = req.session.userData?.enviId;
    if (!personId) throw new Error('Musisz być zalogowany.');
    if (!(await hasModuleAccess(req)))
        throw new ForbiddenError('Brak uprawnień do rejestru wizyt na budowie.');
    return personId;
}

/** Zalogowany z prawem do przeglądu cudzych wizyt (rola 1/2 albo klient). */
function requireOverview(req: Request): number {
    const personId = req.session.userData?.enviId;
    if (!personId) throw new Error('Musisz być zalogowany.');
    if (!canViewOverview(req))
        throw new ForbiddenError('Brak uprawnień do przeglądu wizyt.');
    return personId;
}

// Filtry z query stringa (wspólne dla listy własnej i przeglądu).
function parseFilters(req: Request): SiteVisitSearchParams {
    const { dateFrom, dateTo, text, contractId, personId } = req.query;
    const params: SiteVisitSearchParams = {};
    if (dateFrom) params.dateFrom = String(dateFrom);
    if (dateTo) params.dateTo = String(dateTo);
    if (text) params.text = String(text);
    if (contractId) params.contractId = Number(contractId);
    if (personId) params.personId = Number(personId);
    return params;
}

// Czy zalogowany ma dostęp do modułu / przeglądu / rejestrowania (do warunkowego UI).
app.get('/site-visits/access', async (req: Request, res: Response, next: any) => {
    try {
        const canLog = await canLogVisits(req);
        const isAdmin = canViewOverview(req);
        res.send({ hasAccess: canLog || isAdmin, isAdmin, canLog });
    } catch (error) {
        next(error);
    }
});

// Kontrakty dostępne do wyboru (aktywne + przypisane rolą).
app.get('/site-visits/contracts', async (req: Request, res: Response, next: any) => {
    try {
        const personId = await requireLogAccess(req);
        res.send(
            await SiteVisitController.getContracts(personId, req.projectScope)
        );
    } catch (error) {
        next(error);
    }
});

// [Przegląd] Podsumowanie liczby wizyt wg osoby lub kontraktu.
// req.projectScope jest ustawiony tylko dla ról zakresowych (klient) - dla roli 1/2
// jest undefined, czyli bez filtra.
app.get(
    '/site-visits/admin/summary',
    async (req: Request, res: Response, next: any) => {
        try {
            requireOverview(req);
            const groupBy = req.query.groupBy === 'contract' ? 'contract' : 'person';
            res.send(
                await SiteVisitController.adminSummary(
                    groupBy,
                    parseFilters(req),
                    req.projectScope
                )
            );
        } catch (error) {
            next(error);
        }
    }
);

// [Przegląd] Wizyty wszystkich osób z filtrami.
app.get('/site-visits/admin', async (req: Request, res: Response, next: any) => {
    try {
        requireOverview(req);
        res.send(
            await SiteVisitController.adminListVisits(
                parseFilters(req),
                req.projectScope
            )
        );
    } catch (error) {
        next(error);
    }
});

// Proxy podglądu zdjęcia (bajty z GD przez backend - pliki nie są publiczne).
app.get(
    '/site-visits/photo/:gdFileId',
    async (req: Request, res: Response, next: any) => {
        try {
            await requireModuleAccess(req);
            const media = await SiteVisitController.getPhotoMedia(
                req.params.gdFileId,
                req.projectScope
            );
            if (media.mimeType) res.setHeader('Content-Type', media.mimeType);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            // Błąd strumienia PO wysłaniu nagłówków - zrywamy połączenie zamiast
            // próbować wysłać drugą odpowiedź przez globalny handler.
            media.stream.on('error', () => res.destroy());
            media.stream.pipe(res);
        } catch (error) {
            next(error);
        }
    }
);

// Lista wizyt zalogowanego użytkownika (z opcjonalnymi filtrami).
app.get('/site-visits', async (req: Request, res: Response, next: any) => {
    try {
        const personId = await requireLogAccess(req);
        res.send(
            await SiteVisitController.listVisits(personId, parseFilters(req))
        );
    } catch (error) {
        next(error);
    }
});

// Szczegóły pojedynczej wizyty.
app.get('/site-visits/:id', async (req: Request, res: Response, next: any) => {
    try {
        const personId = await requireLogAccess(req);
        const visit = await SiteVisitController.getVisit(
            Number(req.params.id),
            personId
        );
        if (!visit) {
            res.status(404).send({ errorMessage: 'Nie znaleziono wizyty.' });
            return;
        }
        res.send(visit);
    } catch (error) {
        next(error);
    }
});

// Rejestracja wizyty: multipart (zdjęcia w polu 'photos' + meta/opis w polach tekstowych).
app.post(
    '/site-visits',
    upload.array('photos') as any,
    async (req: Request, res: Response, next: any) => {
        try {
            const personId = await requireLogAccess(req);
            const files = (req.files as Express.Multer.File[]) ?? [];

            let photosMeta = [];
            try {
                photosMeta = req.body.photosMeta
                    ? JSON.parse(req.body.photosMeta)
                    : [];
            } catch {
                throw new Error('Nieprawidłowy format metadanych zdjęć.');
            }

            const dto: SiteVisitInputDto = {
                contractId: Number(req.body.contractId),
                description: req.body.description ?? null,
                visitedAt: req.body.visitedAt || undefined,
                photosMeta,
            };

            const authorName = req.session.userData?.userName ?? '';
            const result = await SiteVisitController.addVisit(
                dto,
                files,
                personId,
                authorName,
                req.projectScope
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);
