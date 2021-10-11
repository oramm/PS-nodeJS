import CasesController from './CasesController'
import { app } from '../../../index';
import Case from './Case';
import ToolsGapi from '../../../setup/GAuth2/ToolsGapi';

app.get('/cases', async (req: any, res: any) => {
    try {
        var result = await CasesController.getCasesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
        console.error(err);
    }
});

app.get('/case/:id', async (req: any, res: any) => {
    try {
        var result = await CasesController.getCasesList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

app.post('/case', async (req: any, res: any) => {
    try {
        let caseItem = new Case(req.body);
        let caseData;
        //numer sprawy jest inicjowany dopiero po dodaniu do bazy - trigger w Db Cases
        await ToolsGapi.gapiReguestHandler(req, res, caseItem.createFolder, undefined, caseItem);
        try {
            caseData = await caseItem.addInDb();
        } catch (err) {
            ToolsGapi.gapiReguestHandler(req, res, caseItem.deleteFolder, undefined, caseItem);
            throw err;
        }
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, caseItem.editFolder, undefined, caseItem),
            ToolsGapi.gapiReguestHandler(req, res, caseItem.addInScrum, { defaultTasks: caseData?.defaultTasksInDb }, caseItem),
        ]);
        res.send(caseItem);
    } catch (error) {

        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/case/:id', async (req: any, res: any) => {
    try {
        let item = new Case(req.body);
        if (item._wasChangedToUniquePerMilestone)
            item.setAsUniquePerMilestone();
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.editFolder, undefined, item),
            ToolsGapi.gapiReguestHandler(req, res, item.editInScrum, undefined, item),
            item.editInDb()
        ]);
        res.send(item);
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    }
});

app.delete('/case/:id', async (req: any, res: any) => {
    try {
        let item = new Case(req.body);
        console.log('delete');
        await item.deleteFromDb();
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.deleteFolder, undefined, item),
            ToolsGapi.gapiReguestHandler(req, res, item.deleteFromScrumSheet, undefined, item)
        ]);
        res.send(item);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});