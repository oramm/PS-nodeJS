import { Request, Response } from 'express';
import { app } from '../index';
import multer from 'multer';
import GdFilesController, { GoogleDocumentType } from './GdFilesController';

const upload = multer({ storage: multer.memoryStorage() });

/** Wgrywanie plików do wskazanego folderu Google Drive (multipart/form-data). */
app.post(
    '/gdFolderFiles',
    upload.array('file') as any,
    async (req: Request, res: Response, next) => {
        try {
            if (!req.session.userData)
                throw new Error('Użytkownik niezalogowany');

            // multipart/form-data: pola przychodzą w req.body jako stringi
            const gdFolderId = req.body?.gdFolderId;
            const files = Array.isArray(req.files) ? req.files : [];

            const created = await GdFilesController.uploadFilesToFolder(
                files,
                gdFolderId
            );
            res.send(created);
        } catch (error) {
            next(error);
        }
    }
);

/** Tworzenie pustego dokumentu Google Docs / arkusza Google Sheets w folderze GD. */
app.post('/gdFolderDocument', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const { gdFolderId, name, type } = req.parsedBody as {
            gdFolderId: string;
            name: string;
            type: GoogleDocumentType;
        };

        const created = await GdFilesController.createGoogleDocument({
            gdFolderId,
            name,
            type,
        });
        res.send(created);
    } catch (error) {
        next(error);
    }
});
