import express, { Request, Response } from 'express';
import LettersController from './LettersController';
import { app } from '../index';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import TestDocTools, { documentId } from '../documentTemplates/test';
import ToolsDocs from '../tools/ToolsDocs';
import { docs_v1 } from 'googleapis';
import ToolsDb from '../tools/ToolsDb';

app.post('/contractsLetters', async (req: Request, res: Response) => {
    try {
        await getCurrentTimeAndTimeZone();
        const orConditions = req.parsedBody.orConditions;
        const result = await LettersController.getLettersList(
            orConditions,
            'CONTRACT'
        );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/offersLetters', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await LettersController.getLettersList(
            orConditions,
            'OFFER'
        );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
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

app.post('/letterReact', async (req: Request, res: Response) => {
    try {
        console.log('req.files', req.files);
        const item = LettersController.createProperLetter(req.parsedBody);

        try {
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.initialise,
                [req.files],
                item
            );
        } catch (err) {
            throw err;
        }
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/letter/:id', async (req: Request, res: Response) => {
    try {
        const fieldsToUpdate = req.parsedBody.fieldsToUpdate;
        const initParamsFromClient = req.parsedBody;

        if (!req.files) req.files = [];
        console.log('req.files', req.files);

        const item = LettersController.createProperLetter(initParamsFromClient);

        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.edit,
            [req.files],
            item
        );
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
});

app.delete('/letter/:id', async (req: Request, res: Response) => {
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
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.get('/check-time', async (req: Request, res: Response) => {
    await getCurrentTimeAndTimeZone();

    res.send('Check time in console');
});
async function getCurrentTimeAndTimeZone() {
    const now = new Date();
    console.log(`Current TZ setting: ${process.env.TZ}`); // Logowanie zmiennej TZ
    console.log('Current time on server (Local):', now);

    try {
        const [rows] = await ToolsDb.pool.query('SELECT NOW() as Time');
        const results = rows as { Time: string }[];

        if (results.length > 0) {
            console.log('Current time in database (UTC):', results[0].Time);
        }
    } catch (error) {
        console.error('Error querying database:', error);
    }
}
