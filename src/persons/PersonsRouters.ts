import PersonsController from './PersonsController';
import { app } from '../index';
import { Request, Response } from 'express';

const parsePositiveInt = (raw: string, fieldName: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${fieldName} must be a positive integer`);
    }
    return value;
};

/**
 * Wyszukuje osoby według podanych kryteriów.
 * Body: { orConditions: PersonsSearchParams[] }
 * Returns: Person[]
 */
app.post('/persons', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await PersonsController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

/**
 * Dodaje nową osobę (dane podstawowe bez konta systemowego).
 * Body: { name, surname, entityId, position?, email?, cellphone?, phone?, comment? }
 * Returns: Person
 */
app.post('/person', async (req: Request, res: Response, next) => {
    try {
        const item = await PersonsController.addFromDto(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

/**
 * Edytuje dane osoby.
 * Params: id
 * Body: { id, _fieldsToUpdate: string[], ...fields }
 * Returns: Person
 */
app.put('/person/:id', async (req: Request, res: Response, next) => {
    try {
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const item = await PersonsController.editFromDto(
            req.parsedBody,
            fieldsToUpdate,
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

/**
 * Edytuje użytkownika z synchronizacją ScrumSheet.
 * @deprecated Używaj PUT /person/:id dla danych osobowych i PUT /v2/persons/:id/account dla konta.
 * UWAGA: v2 nie synchronizuje ScrumSheet automatycznie - endpoint zostanie wycofany po dodaniu tej funkcjonalności do v2.
 * Params: id
 * Body: { id, name?, surname?, systemRoleId?, systemEmail?, ...fields }
 * Returns: Person
 */
app.put('/user/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await PersonsController.editUserFromDto(
            req.parsedBody ?? req.body,
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

/**
 * Usuwa osobę z bazy danych.
 * Params: id
 * Body: { id }
 * Returns: { id }
 */
app.delete('/person/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await PersonsController.deleteFromDto(req.body);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

/**
 * Tworzy użytkownika systemowego z kontem w jednym żądaniu.
 * @deprecated Używaj POST /person do utworzenia osoby, a następnie PUT /v2/persons/:personId/account do dodania konta.
 * Endpoint zostanie usunięty w kolejnej wersji major.
 * Body: { name, surname, entityId, systemRoleId, systemEmail, position?, email?, cellphone?, phone?, comment? }
 * Returns: Person
 */
app.post('/systemUser', async (req: Request, res: Response, next) => {
    try {
        const newUser = await PersonsController.addNewSystemUser(req.body);
        res.send(newUser);
    } catch (error) {
        next(error);
    }
});

/**
 * Pobiera konto systemowe osoby (v2).
 * Params: personId
 * Returns: PersonAccountV2Payload | null
 */
app.get(
    '/v2/persons/:personId/account',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const account =
                await PersonsController.getPersonAccountV2(personId);
            res.send(account || null);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Tworzy lub aktualizuje konto systemowe osoby (v2).
 * Params: personId
 * Body: PersonAccountV2Payload (systemRoleId?, systemEmail?, googleId?, googleRefreshToken?, microsoftId?, microsoftRefreshToken?, isActive?)
 * Returns: PersonAccountV2Payload
 */
app.put(
    '/v2/persons/:personId/account',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            const account = await PersonsController.upsertPersonAccountV2({
                personId,
                systemRoleId: payload?.systemRoleId,
                systemEmail: payload?.systemEmail,
                googleId: payload?.googleId,
                googleRefreshToken: payload?.googleRefreshToken,
                microsoftId: payload?.microsoftId,
                microsoftRefreshToken: payload?.microsoftRefreshToken,
                isActive: payload?.isActive,
            });
            res.send(account);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Pobiera profil użytkownika wraz z doświadczeniami (v2).
 * Params: personId
 * Returns: PersonProfileV2Payload & { profileExperiences } | null
 */
app.get(
    '/v2/persons/:personId/profile',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const profile =
                await PersonsController.getPersonProfileV2(personId);
            res.send(profile || null);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Tworzy lub aktualizuje profil użytkownika (v2).
 * Params: personId
 * Body: PersonProfileV2Payload (headline?, summary?, profileIsVisible?)
 * Returns: PersonProfileV2Payload
 */
app.put(
    '/v2/persons/:personId/profile',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            const profile = await PersonsController.upsertPersonProfileV2({
                personId,
                headline: payload?.headline,
                summary: payload?.summary,
                profileIsVisible: payload?.profileIsVisible,
            });
            res.send(profile);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Pobiera listę doświadczeń zawodowych osoby (v2).
 * Params: personId
 * Returns: PersonProfileExperienceV2Payload[]
 */
app.get(
    '/v2/persons/:personId/profile/experiences',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const experiences =
                await PersonsController.listPersonProfileExperiencesV2(
                    personId,
                );
            res.send(experiences);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Dodaje nowe doświadczenie zawodowe do profilu (v2).
 * Params: personId
 * Body: PersonProfileExperienceV2Payload (organizationName?, positionName?, description?, dateFrom?, dateTo?, isCurrent?, sortOrder?)
 * Returns: PersonProfileExperienceV2Payload
 */
app.post(
    '/v2/persons/:personId/profile/experiences',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            const experience =
                await PersonsController.addPersonProfileExperienceV2(personId, {
                    organizationName: payload?.organizationName,
                    positionName: payload?.positionName,
                    description: payload?.description,
                    dateFrom: payload?.dateFrom,
                    dateTo: payload?.dateTo,
                    isCurrent: payload?.isCurrent,
                    sortOrder: payload?.sortOrder,
                });
            res.send(experience);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Aktualizuje doświadczenie zawodowe w profilu (v2).
 * Params: personId, experienceId
 * Body: PersonProfileExperienceV2Payload (organizationName?, positionName?, description?, dateFrom?, dateTo?, isCurrent?, sortOrder?)
 * Returns: PersonProfileExperienceV2Payload
 */
app.put(
    '/v2/persons/:personId/profile/experiences/:experienceId',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const experienceId = parsePositiveInt(
                req.params.experienceId,
                'experienceId',
            );
            const payload = req.parsedBody ?? req.body;
            const experience =
                await PersonsController.editPersonProfileExperienceV2(
                    personId,
                    experienceId,
                    {
                        organizationName: payload?.organizationName,
                        positionName: payload?.positionName,
                        description: payload?.description,
                        dateFrom: payload?.dateFrom,
                        dateTo: payload?.dateTo,
                        isCurrent: payload?.isCurrent,
                        sortOrder: payload?.sortOrder,
                    },
                );
            res.send(experience);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Usuwa doświadczenie zawodowe z profilu (v2).
 * Params: personId, experienceId
 * Returns: { id }
 */
app.delete(
    '/v2/persons/:personId/profile/experiences/:experienceId',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const experienceId = parsePositiveInt(
                req.params.experienceId,
                'experienceId',
            );
            const result =
                await PersonsController.deletePersonProfileExperienceV2(
                    personId,
                    experienceId,
                );
            res.send(result);
        } catch (error) {
            next(error);
        }
    },
);
