import express from 'express'
import MilestoneTypesController from './MilestoneTypesController'
var app = express();

app.get('/milestoneTypes', async (req: any, res: any) => {
    try {
        var result = await MilestoneTypesController.getMilestoneTypesList(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }


});

app.get('/milestoneType/:id', async (req: any, res: any) => {
    try {
        var result = await MilestoneTypesController.getMilestoneTypesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;