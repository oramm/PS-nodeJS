import express, { Request, Response } from 'express';
import LettersController from './LettersController';
import { app } from '../index';
import ToolsGapi from '../setup/Sessions/ToolsGapi';
import TestDocTools, { documentId } from '../documentTemplates/test';
import ToolsDocs from '../tools/ToolsDocs';
import { docs_v1 } from 'googleapis';
import OurLetter from './OurLetter';
import Letter from './Letter';

app.post('/contractsLetters', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');
        const orConditions = req.parsedBody.orConditions;
        const result = await LettersController.getLettersList(
            orConditions,
            'CONTRACT',
            req.session.userData
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/offersLetters', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');
        const orConditions = req.parsedBody.orConditions;
        const result = await LettersController.getLettersList(
            orConditions,
            'OFFER',
            req.session.userData
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post(
    '/testLetter/:mode',
    async (req: express.Request, res: express.Response) => {
        let response;
        try {
            switch (req.params.mode) {
                case 'init':
                    response = await ToolsGapi.gapiReguestHandler(
                        req,
                        res,
                        TestDocTools.init,
                        null,
                        null
                    );
                    break;
                case 'reset':
                    response = await ToolsGapi.gapiReguestHandler(
                        req,
                        res,
                        TestDocTools.resetTags,
                        null,
                        null
                    );
                    break;
                case 'update':
                    response = await ToolsGapi.gapiReguestHandler(
                        req,
                        res,
                        TestDocTools.update,
                        null,
                        null
                    );
                    break;
            }
            res.send(response);
        } catch (error) {
            if (error instanceof Error) {
                const document: docs_v1.Schema$Document = (
                    await ToolsGapi.gapiReguestHandler(
                        req,
                        res,
                        ToolsDocs.getDocument,
                        documentId,
                        null
                    )
                ).data;
                let paragraphElements: docs_v1.Schema$StructuralElement[] = [];
                if (document.body?.content) {
                    const content = document.body.content;
                    paragraphElements =
                        ToolsDocs.getAllParagraphElementsFromDocument(content);
                }
                res.status(500).send({
                    message: error.message,
                    paragraphs: paragraphElements.map((element) => {
                        delete element.paragraph?.paragraphStyle;
                        return element.paragraph;
                    }),
                    namedRanges: document.namedRanges,
                });
            }
            console.error(error);
        }
    }
);

app.post('/letterReact', async (req: Request, res: Response, next) => {
    try {
        console.log('req.files', req.files);
        const item = LettersController.createProperLetter(req.parsedBody);
        try {
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.addNewController,
                [req.files, req.session.userData],
                item
            );
        } catch (err) {
            throw err;
        }
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/letter/:id', async (req: Request, res: Response, next) => {
    try {
        const _fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const initParamsFromClient = req.parsedBody;

        if (!req.files) req.files = [];
        console.log('req.files', req.files);

        const item = LettersController.createProperLetter(initParamsFromClient);

        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.editController,
            [req.files, req.session.userData, _fieldsToUpdate],
            item
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put(
    '/appendLetterAttachments/:id',
    async (req: Request, res: Response, next) => {
        try {
            const item = LettersController.createProperLetter(req.body);
            if (
                !req.body._blobEnviObjects ||
                !Array.isArray(req.body._blobEnviObjects)
            )
                throw new Error(`No blobs to upload for Letter ${item.number}`);

            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.appendAttachmentsHandler,
                [req.body._blobEnviObjects],
                item
            );
            await item.editInDb();

            res.send(item);
        } catch (error) {
            if (error instanceof Error)
                res.status(500).send({ errorMessage: error.message });
            console.error(error);
        }
    }
);

app.put('/exportOurLetterToPDF', async (req: Request, res: Response, next) => {
    try {
        const item = LettersController.createProperLetter(req.body);
        if (!(item instanceof OurLetter))
            throw new Error('Nie można wyeksportować listu otrzymanego do PDF');
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.exportToPDF,
            [req.session.userData],
            item
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/approveOurLetter/:id', async (req: Request, res: Response, next) => {
    const item = LettersController.createProperLetter(req.body);
    if (!(item instanceof OurLetter))
        throw new Error('Błąd przy zatwierdzaniu pisma');
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.approveLetter,
            [req.session.userData],
            item
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

//autoApproveOurLetter
app.get('/autoApproveOurLetters', async (req: Request, res: Response, next) => {
    try {
        await LettersController.autoApprove();
        res.send('All our letters approved');
    } catch (error) {
        next(error);
    }
});

app.delete('/letter/:id', async (req: Request, res: Response, next) => {
    try {
        const item = LettersController.createProperLetter(req.body);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item._letterGdController.deleteFromGd,
            [item.gdDocumentId, item.gdFolderId],
            undefined
        );
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
