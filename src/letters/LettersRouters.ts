import express, { Request, Response } from 'express'
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

app.get('/letters', async (req: Request, res: Response) => {
    try {
        const result = await LettersController.getLettersList(req.parsedQuery);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.get('/letter/:id', async (req: Request, res: any) => {

    try {
        const result = await LettersController.getLettersList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
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

app.post('/letterReact', async (req: Request, res: Response) => {
    try {
        console.log('req.files', req.files);
        let item: OurLetter | IncomingLetter;
        if (req.parsedBody.isOur)
            item = new OurLetter(req.parsedBody);
        else
            item = new IncomingLetter(req.parsedBody);

        try {
            await ToolsGapi.gapiReguestHandler(req, res, item.initialise, [req.files], item);
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

/**@deprecated */
app.post('/letter', async (req: Request, res: any) => {
    try {
        console.log('req.files', req.files);
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


app.put('/letter/:id', async (req: Request, res: Response) => {
    try {
        const fieldsToUpdate = req.parsedBody.fieldsToUpdate;
        const initParamsFromClient = req.parsedBody;

        if (!req.files) req.files = [];
        console.log('req.files', req.files);
        if (!initParamsFromClient._project.id) throw new Error('No _project.id in initParamsFromClient');

        console.log('initParamsFromClient', initParamsFromClient._project);
        let item: OurLetter | IncomingLetter;
        if (initParamsFromClient.isOur)
            item = new OurLetter(initParamsFromClient);
        else
            item = new IncomingLetter(initParamsFromClient);
        await ToolsGapi.gapiReguestHandler(req, res, item.edit, [req.files], item);
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/appendLetterAttachments/:id', async (req: Request, res: Response) => {
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

app.delete('/letter/:id', async (req: Request, res: Response) => {
    try {
        const item = LettersController.createProperLetter(req.body);

        await ToolsGapi.gapiReguestHandler(req, res, LetterGdController.deleteFromGd, [item.documentGdId, item.folderGdId], undefined);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});