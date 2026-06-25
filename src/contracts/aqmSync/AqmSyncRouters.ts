import { Request, Response } from 'express';
import { app } from '../../index';
import { fetchAqmMatch } from './AqmSync';

/**
 * WS10 — PS proxy for the AQM org-match preview (L11).
 *
 * The witryna front MUST NOT hold the AQM service-token. It calls this PS
 * backend path, which forwards server-side to the AQM match endpoint with the
 * Bearer token from Setup.AqmSync and relays the JSON back. The token never
 * leaves the server.
 *
 *   GET /aqm/match?taxNr=<nip>&name=<opt>
 *     -> { match: "NIP" | "NAME" | "NONE", organization | null }
 */
app.get('/aqm/match', async (req: Request, res: Response, next) => {
    try {
        const taxNr =
            typeof req.query.taxNr === 'string' ? req.query.taxNr : '';
        const name =
            typeof req.query.name === 'string' ? req.query.name : undefined;

        const { status, body } = await fetchAqmMatch({ taxNr, name });
        res.status(status).json(body);
    } catch (error) {
        next(error);
    }
});
