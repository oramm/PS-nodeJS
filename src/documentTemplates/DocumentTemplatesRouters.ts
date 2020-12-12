import express from 'express'
import DocumentTemplatesController from './DocumentTemplatesController'
var app = express();

app.get('/documentTemplates', async (req: any, res: any) => {
    try {
        var result = await DocumentTemplatesController.getDocumentTemplatesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/documentTemplate/:id', async (req: any, res: any) => {
    try {
        var result = await DocumentTemplatesController.getDocumentTemplatesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;