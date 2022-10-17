import express from 'express'
import LettersController from './LettersController'
import { app } from '../index';
import OurLetter from './OurLetter';
import OurOldTypeLetter from './OurOldTypeLetter';
import IncomingLetter from './IncomingLetter';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';

app.get('/letters', async (req: any, res: any) => {
    try {
        const result = await LettersController.getLettersList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.get('/letter/:id', async (req: any, res: any) => {

    try {
        const result = await LettersController.getLettersList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.post('/letter', async (req: any, res: any) => {
    try {
        let item: OurLetter | OurOldTypeLetter | IncomingLetter;
        if (!req.body._blobEnviObjects)
            req.body._blobEnviObjects = [];
        if (req.body.isOur) {
            //nasze pismo po nowemu
            if (req.body._template)
                item = new OurLetter(req.body);
            //nasze pismo po staremu
            else
                item = new OurOldTypeLetter(req.body);
        }
        //pismo przychodzące
        else {
            item = new IncomingLetter(req.body);
        }

        try {
            await ToolsGapi.gapiReguestHandler(req, res, item.initialise, req.body._blobEnviObjects, item);
        } catch (err) {
            throw err;
        }
        res.send(item);
    } catch (error) {

        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    };
});

app.put('/letter/:id', async (req: any, res: any) => {
    try {
        if (!req.body._blobEnviObjects)
            req.body._blobEnviObjects = [];
        const item = LettersController.createProperLetter(req.body);
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.edit, req.body._blobEnviObjects, item),
            item.editInDb()
        ]);
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.put('/appendAttachments/:id', async (req: any, res: any) => {
    try {
        const item = LettersController.createProperLetter(req.body);
        if (req.body._blobEnviObjects) {
            const item = LettersController.createProperLetter(req.body);
            await Promise.all([
                ToolsGapi.gapiReguestHandler(req, res, item.appendAttachments, req.body._blobEnviObjects, item),
                item.editInDb()
            ]);
        }
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.delete('/letter/:id', async (req: any, res: any) => {
    try {
        const item = LettersController.createProperLetter(req.body);
        await item.deleteFromDb();
        await ToolsGapi.gapiReguestHandler(req, res, item.deleteFromGd, undefined, item);

        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});