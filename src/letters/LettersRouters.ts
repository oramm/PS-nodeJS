import express from 'express'
import LettersController from './LettersController'
import { app } from '../index';
import OurLetter from './OurLetter';
import OurOldTypeLetter from './OurOldTypeLetter';
import IncomingLetter from './IncomingLetter';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import TestDocTools, { documentId } from '../documentTemplates/test';
import ToolsDocs from '../tools/ToolsDocs';
import { docs_v1 } from 'googleapis';
import LetterGdController from './LetterGdController';


app.get('/letters', async (req: any, res: any) => {
    try {
        const result = await LettersController.getLettersList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
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
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});
app.post('/testLetter/:mode', async (req: express.Request, res: express.Response) => {
    let response;
    try {
        switch (req.params.mode) {
            case 'init':
                response = await ToolsGapi.gapiReguestHandler(req, res, TestDocTools.init, null, null);
                break;
            case 'reset':
                response = await ToolsGapi.gapiReguestHandler(req, res, TestDocTools.resetTags, null, null);
                break;
            case 'update':
                response = await ToolsGapi.gapiReguestHandler(req, res, TestDocTools.update, null, null);
                break;
        }
        res.send(response);
    } catch (error) {

        if (error instanceof Error) {
            const document: docs_v1.Schema$Document = (await ToolsGapi.gapiReguestHandler(req, res, ToolsDocs.getDocument, documentId, null)).data;
            let paragraphElements: docs_v1.Schema$StructuralElement[] = [];
            if (document.body?.content) {
                const content = document.body.content;
                paragraphElements = ToolsDocs.getAllParagraphElementsFromDocument(content);
            } res.status(500).send({
                message: error.message,
                paragraphs: (paragraphElements).map((element) => {
                    delete element.paragraph?.paragraphStyle;
                    return element.paragraph
                }),
                namedRanges: document.namedRanges
            });
        }
        console.error(error);
    };
});

app.post('/letter', async (req: any, res: any) => {
    try {
        let item: OurLetter | OurOldTypeLetter | IncomingLetter;
        let blobEnviObjects = req.body._blobEnviObjects;
        if (!blobEnviObjects)
            blobEnviObjects = [];
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
            await ToolsGapi.gapiReguestHandler(req, res, item.initialise, [blobEnviObjects], item);
        } catch (err) {
            throw err;
        }
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/letter/:id', async (req: any, res: any) => {
    try {
        if (!req.body._blobEnviObjects)
            req.body._blobEnviObjects = [];
        const item = LettersController.createProperLetter(req.body);
        await ToolsGapi.gapiReguestHandler(req, res, item.edit, [req.body._blobEnviObjects], item);
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/appendLetterAttachments/:id', async (req: any, res: any) => {
    try {
        const item = LettersController.createProperLetter(req.body);
        if (!req.body._blobEnviObjects || !Array.isArray(req.body._blobEnviObjects)) throw new Error(`No blobs to upload for Letter ${item.number}`);

        await ToolsGapi.gapiReguestHandler(req, res, item.appendAttachmentsHandler, [req.body._blobEnviObjects], item);
        await item.editInDb();

        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.delete('/letter/:id', async (req: any, res: any) => {
    try {
        const item = LettersController.createProperLetter(req.body);

        await ToolsGapi.gapiReguestHandler(req, res, LetterGdController.deleteFromGd, [item.documentGdId, item.folderGdId], undefined);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});