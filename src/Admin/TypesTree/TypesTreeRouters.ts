import { Request, Response } from 'express';
import { app } from '../../index';
import TypesTreeController from './TypesTreeController';
import { hasTypesTreeReadAccess } from './typesTreeReadAccess';

/**
 * Widok hierarchii typów: typ umowy → typ kamienia → typ sprawy → typ podsprawy.
 * Prefiks /admin - bramkowane przez adminPanelGuard (ADMIN + ENVI_MANAGER).
 *
 * Jedno wywołanie zwraca cały graf - bez paginacji i filtrów.
 */

/**
 * Podglad hierarchii dla wszystkich pracownikow ENVI.
 *
 * DLACZEGO POZA PREFIKSEM /admin. Bramka panelu zamyka CALY prefiks i ma to robic
 * dalej - to jej wartosc. Trasa tylko do odczytu stoi wiec obok niej, z wlasna,
 * szersza bramka rolowa. Zapis zostaje pod /admin, wiec ENVI_EMPLOYEE go nie dosiegnie
 * nawet znajac adres.
 *
 * Lista rol i sama bramka siedza w `typesTreeReadAccess` - osobno, zeby dalo sie je
 * przetestowac bez podnoszenia calego serwera.
 */
app.get('/typesTree', async (req: Request, res: Response, next: any) => {
    try {
        if (!hasTypesTreeReadAccess(req)) {
            res.status(403).send({ errorMessage: 'Brak uprawnien do hierarchii typow' });
            return;
        }
        const result = await TypesTreeController.getTree();
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/admin/typesTree', async (req: any, res: any, next: any) => {
    try {
        const result = await TypesTreeController.getTree();
        res.send(result);
    } catch (error) {
        next(error);
    }
});

// Dodanie typu zwraca CAŁE odświeżone drzewo. Klient rysuje graf z jednego
// zestawu danych, więc doklejanie pojedynczego węzła po stronie klienta
// rozjechałoby go z bazą przy pierwszej rozbieżności.
app.post('/admin/typesTree/milestoneType', async (req: any, res: any, next: any) => {
    try {
        const result = await TypesTreeController.addMilestoneTypeFromDto(req.parsedBody);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/admin/typesTree/caseType', async (req: any, res: any, next: any) => {
    try {
        const result = await TypesTreeController.addCaseTypeFromDto(req.parsedBody);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

// Brak tras usuwania: typy nie mają kolumny statusu ani flagi aktywności, więc
// jedyną formą usunięcia byłby DELETE, a ten i tak blokuje klucz obcy dla typów
// w użyciu. Wycofywanie typów to osobny temat, wymagający zmiany schematu.
app.put('/admin/typesTree/milestoneType/:id', async (req: any, res: any, next: any) => {
    try {
        const result = await TypesTreeController.editMilestoneTypeFromDto({
            ...req.parsedBody,
            id: req.params.id,
        });
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/admin/typesTree/caseType/:id', async (req: any, res: any, next: any) => {
    try {
        const result = await TypesTreeController.editCaseTypeFromDto({
            ...req.parsedBody,
            id: req.params.id,
        });
        res.send(result);
    } catch (error) {
        next(error);
    }
});
