import express from 'express'
import ProjectsController from './ProjectsController'
var app = express();

app.get('/projects/:systemEmail', async (req: any, res: any) => {
    try {
        var result = await ProjectsController.getProjectsList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/project/:id', async (req: any, res: any) => {
    try {
        var result = await ProjectsController.getProjectsList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

module.exports = app;