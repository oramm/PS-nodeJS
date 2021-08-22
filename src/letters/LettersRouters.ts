import express from 'express'
import LettersController from './LettersController'
var app = express();

app.get('/letters', async (req: any, res: any) => {
    try {
        var result = await LettersController.getLettersList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

app.get('/letter/:id', async (req: any, res: any) => {
    try {
        var result = await LettersController.getLettersList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

module.exports = app;