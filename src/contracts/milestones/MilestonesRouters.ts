import express from 'express'
import MilestonesController from './MilestonesController'
var app = express();

app.get('/milestones', async (req: any, res: any) => {
    try {
        var result = await MilestonesController.getMilestonesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/milestone/:id', async (req: any, res: any) => {
    try {
        var result = await MilestonesController.getMilestonesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;