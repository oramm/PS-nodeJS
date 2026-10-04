import { Request, Response } from 'express';
import { app } from '../../index';
import ChatSpacesController from './ChatSpacesController';

/**
 * Pokoje Google Chat kontraktu ENVI (CHT-3). Konwencja jak /contract/:id/fidmanSync/*:
 * /contract/:id/<podzasób>. Dostęp: bramka sesji (requireSession) + allowlista ról
 * zakresowych (projectScopedPolicy) - trasy spoza allowlisty dostają 403 z automatu.
 *
 *   GET    /chatSpaces?projectOurId=  -> to samo dla nowego kontraktu (bez id); brak projektu = wszystkie pokoje
 *   GET    /contract/:id/chatSpaces  -> lista pokoi z bazy (najpierw pokoje projektu kontraktu)
 *   POST   /contract/:id/chatSpace   { scope: 'contract'|'project', displayName? } -> zakłada pokój
 *   PUT    /contract/:id/chatSpace   { chatSpaceId } -> podpina do istniejącego pokoju
 *   DELETE /contract/:id/chatSpace   -> odpina (pokój i jego wiersz zostają)
 */
function parseContractId(req: Request): number {
    return parseInt(req.params.id, 10);
}

app.get('/chatSpaces', async (req: Request, res: Response, next) => {
    try {
        const projectOurId =
            typeof req.query.projectOurId === 'string'
                ? req.query.projectOurId
                : undefined;
        res.send(await ChatSpacesController.listForProject(projectOurId));
    } catch (error) {
        next(error);
    }
});

app.get(
    '/contract/:id/chatSpaces',
    async (req: Request, res: Response, next) => {
        try {
            res.send(await ChatSpacesController.list(parseContractId(req)));
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    '/contract/:id/chatSpace',
    async (req: Request, res: Response, next) => {
        try {
            const body = req.parsedBody ?? req.body ?? {};
            const result = await ChatSpacesController.createForContract(
                parseContractId(req),
                {
                    scope: body.scope,
                    displayName:
                        typeof body.displayName === 'string'
                            ? body.displayName
                            : undefined,
                    actorPersonId: req.session?.userData?.enviId,
                }
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.put(
    '/contract/:id/chatSpace',
    async (req: Request, res: Response, next) => {
        try {
            const body = req.parsedBody ?? req.body ?? {};
            const chatSpace = await ChatSpacesController.attach(
                parseContractId(req),
                Number(body.chatSpaceId)
            );
            res.send({ chatSpace });
        } catch (error) {
            next(error);
        }
    }
);

app.delete(
    '/contract/:id/chatSpace',
    async (req: Request, res: Response, next) => {
        try {
            await ChatSpacesController.detach(parseContractId(req));
            res.send({ ok: true });
        } catch (error) {
            next(error);
        }
    }
);
