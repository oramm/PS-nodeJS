import MilestonesController from './MilestonesController';
import { app } from '../../index';
import ToolsGapi from '../../setup/GAuth2/ToolsGapi';
import Milestone from './Milestone';

app.get('/milestones', async (req: any, res: any) => {
    try {
        var result = await MilestonesController.getMilestonesList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

app.get('/milestone/:id', async (req: any, res: any) => {
    try {
        var result = await MilestonesController.getMilestonesList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

app.post('/milestone', async (req: any, res: any) => {

    try {
        let item = new Milestone(req.body);
        //numer sprawy jest inicjowany dopiero po dodaniu do bazy - trigger w Db Milestones
        await ToolsGapi.gapiReguestHandler(req, res, item.createFolders, undefined, item);
        try {
            await item.addInDb();
            await ToolsGapi.gapiReguestHandler(req, res, item.createDefaultCases, undefined, item);

        } catch (err) {
            ToolsGapi.gapiReguestHandler(req, res, item.deleteFolder, undefined, item);
            throw err;
        }
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.editFolder, undefined, item)
        ]);
        res.send(item);
    } catch (error) {

        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/milestone/:id', async (req: any, res: any) => {
    try {
        let item = new Milestone(req.body);
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

app.delete('/milestone/:id', async (req: any, res: any) => {
    try {
        let item = new Milestone(req.body);
        console.log('delete');
        await item.deleteFromDb();
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.deleteFolder, undefined, item),
            ToolsGapi.gapiReguestHandler(req, res, item.deleteFromScrum, undefined, item)
        ]);
        res.send(item);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});