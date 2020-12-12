import express from 'express'
import RolesController from './RolesController'
var app = express();

app.get('/roles', async (req: any, res: any) => {
    try {
        var result = await RolesController.getRolesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/role/:id', async (req: any, res: any) => {
    try {
        var result = await RolesController.getRolesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;