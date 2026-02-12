import InvoicesController from './InvoicesController';
import { KsefController } from './KSeF';
import { app } from '../index';
import { Request, Response } from 'express';
import multer from 'multer';

// Middleware do parsowania plików
const upload = multer({ storage: multer.memoryStorage() });

app.post('/invoices', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await InvoicesController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/invoice', async (req: Request, res: Response, next) => {
    try {
        const item = await InvoicesController.add(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.post('/copyInvoice', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const copy = await InvoicesController.copy(
            req.body,
            req.session.userData
        );
        res.send(copy);
    } catch (error) {
        next(error);
    }
});

app.put('/invoice/:id', async (req: Request, res: Response, next) => {
    try {
        //nie ma validacji przy edycji bo jest zbędna - jest w edycji pozycji
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;

        // ✅ PRZYWRÓCONA logika warunkowa - auth tylko gdy trzeba usunąć plik GD
        if (
            req.body.gdId &&
            req.body.status?.match(/Na później|Do zrobienia/i)
        ) {
            const item = await InvoicesController.edit(
                req.parsedBody,
                fieldsToUpdate,
                'FETCH_TOKEN'
            );
            res.send(item);
        } else {
            const item = await InvoicesController.edit(
                req.parsedBody,
                fieldsToUpdate
            );
            res.send(item);
        }
    } catch (error) {
        next(error);
    }
});

app.put(
    '/setAsToMakeInvoice/:id',
    async (req: Request, res: Response, next) => {
        try {
            const item = await InvoicesController.updateStatus(
                req.parsedBody,
                'Do zrobienia'
            );
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);

app.put(
    '/issueInvoice/:id',
    upload.single('file') as any,
    async (req: Request, res: Response, next) => {
        try {
            const invoiceFile = req.file;
            if (!invoiceFile) {
                throw new Error('Nie załączono pliku faktury');
            }

            // Przy multipart/form-data, parsedBody może być pusty - parsuj req.body ręcznie
            let itemFromClient = req.parsedBody;
            if (!itemFromClient || Object.keys(itemFromClient).length === 0) {
                itemFromClient = {};
                for (const key in req.body) {
                    try {
                        itemFromClient[key] = JSON.parse(req.body[key]);
                    } catch {
                        itemFromClient[key] = req.body[key];
                    }
                }
            }
            
            // Upewnij się że id jest ustawione (z URL jeśli brakuje w body)
            if (!itemFromClient.id && req.params.id) {
                itemFromClient.id = parseInt(req.params.id, 10);
            }

            const item = await InvoicesController.issue(
                itemFromClient,
                invoiceFile,
                'FETCH_TOKEN'
            );
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);

app.put('/setAsSentInvoice/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await InvoicesController.updateStatus(
            req.parsedBody,
            'Wysłana'
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/setAsPaidInvoice/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await InvoicesController.updateStatus(
            req.parsedBody,
            'Zapłacona'
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/invoice/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await InvoicesController.delete(req.body, 'FETCH_TOKEN');
        res.send(result);
    } catch (error) {
        next(error);
    }
});

// ==================== KSeF API ====================

/**
 * POST /invoice/:id/ksef/send
 * Wysyła fakturę do KSeF
 * 
 * Response: { invoiceId, referenceNumber, status, message }
 */
app.post('/invoice/:id/ksef/send', async (req: Request, res: Response, next) => {
    try {
        const invoiceId = parseInt(req.params.id, 10);
        if (isNaN(invoiceId)) {
            return res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
        }
        
        const result = await KsefController.submitInvoiceById(invoiceId);
        res.json(result);
    } catch (error: any) {
        console.error('[KSeF] Błąd wysyłki faktury:', error.message);
        if (error.validationErrors) {
            return res.status(400).json({ 
                error: 'Walidacja nie powiodła się', 
                details: error.validationErrors 
            });
        }
        next(error);
    }
});

// ==================== CORRECTION INVOICE ====================

/**
 * POST /invoice/:id/correction
 * Tworzy fakturę korygującą (w bazie danych)
 * 
 * Body: { 
 *   correctionType: 'zero' | 'custom',    // WYMAGANE - typ korekty
 *   correctionReason: string,             // WYMAGANE - przyczyna korekty
 *   customItems?: Array<{                 // OPCJONALNE - tylko dla typu 'custom'
 *     description: string,
 *     quantity: number,
 *     unitPrice: number,                  // Ujemne = korekta in minus
 *     vatTax: number
 *   }>
 * }
 * Response: { correctionInvoice, message }
 */
app.post('/invoice/:id/correction', async (req: Request, res: Response, next) => {
    try {
        const originalInvoiceId = parseInt(req.params.id, 10);
        if (isNaN(originalInvoiceId)) {
            return res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
        }
        
        const { correctionType, correctionReason } = req.body;
        
        // Parsuj customItems - może być stringiem JSON (z FormData) lub obiektem
        let customItems = req.body.customItems;
        if (typeof customItems === 'string' && customItems.trim()) {
            try {
                customItems = JSON.parse(customItems);
            } catch (e) {
                return res.status(400).json({ error: 'Nieprawidłowy format customItems (JSON)' });
            }
        }
        
        // Obsługa pliku załącznika (tak jak w /issueInvoice/:id)
        let invoiceFile: Express.Multer.File | undefined;
        if (req.files) {
            if (Array.isArray(req.files) && req.files.length > 0) {
                invoiceFile = req.files[0];
            } else if (typeof req.files === 'object' && 'file' in req.files) {
                const fileArray = (req.files as any).file;
                invoiceFile = Array.isArray(fileArray) ? fileArray[0] : fileArray;
            }
        }
        
        if (!correctionType || !['zero', 'custom'].includes(correctionType)) {
            return res.status(400).json({ 
                error: 'Nieprawidłowy typ korekty. Dozwolone wartości: "zero", "custom"' 
            });
        }
        
        if (!correctionReason) {
            return res.status(400).json({ error: 'Brak przyczyny korekty (correctionReason)' });
        }
        
        // Walidacja customItems tylko dla typu 'custom'
        const parsedCustomItems = Array.isArray(customItems) ? customItems : undefined;
        if (correctionType === 'custom' && (!parsedCustomItems || parsedCustomItems.length === 0)) {
            return res.status(400).json({ 
                error: 'Dla typu "custom" wymagane są pozycje korekty (customItems)' 
            });
        }
        
        if (!req.session.userData) {
            return res.status(401).json({ error: 'Brak danych użytkownika w sesji' });
        }
        
        const correctionInvoice = await InvoicesController.createCorrectionInvoice(
            originalInvoiceId,
            correctionType,
            correctionReason,
            req.session.userData,
            parsedCustomItems,
            invoiceFile
        );
        
        // Upewnij się, że id jest ustawione przed zwróceniem odpowiedzi
        if (!correctionInvoice.id) {
            console.error('[Correction] BŁĄD: Korekta nie ma ID po utworzeniu!', correctionInvoice);
            return res.status(500).json({ error: 'Błąd wewnętrzny: korekta nie otrzymała ID' });
        }
        
        console.log(`[Correction] Zwracam korektę id=${correctionInvoice.id}, number=${correctionInvoice.number}`);
        
        res.json({ 
            correctionInvoice,
            message: `Faktura korygująca ${correctionInvoice.id} została utworzona. ` +
                     `Użyj POST /invoice/${correctionInvoice.id}/ksef/correction aby wysłać do KSeF.`
        });
    } catch (error: any) {
        console.error('[Correction] Błąd tworzenia korekty:', error.message);
        next(error);
    }
});

/**
 * POST /invoice/:id/ksef/correction
 * Wysyła fakturę korygującą do KSeF (schemat FA(3))
 * 
 * Body: { 
 *   originalKsefNumber: string,           // WYMAGANE - numer KSeF oryginalnej faktury
 *   originalInvoiceNumber?: string,       // opcjonalne - numer wewnętrzny oryginalnej faktury
 *   originalIssueDate?: string,           // opcjonalne - data wystawienia oryginalnej (YYYY-MM-DD)
 *   correctionReason?: string,            // opcjonalne - przyczyna korekty (domyślnie: "Korekta faktury")
 *   correctionType?: 1 | 2 | 3            // opcjonalne - typ korekty: 1=data oryg., 2=data korekty, 3=inna (domyślnie: 1)
 * }
 * Response: { invoiceId, referenceNumber, status, originalKsefNumber, message }
 */
app.post('/invoice/:id/ksef/correction', async (req: Request, res: Response, next) => {
    try {
        const invoiceId = parseInt(req.params.id, 10);
        if (isNaN(invoiceId)) {
            return res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
        }
        
        const { 
            originalKsefNumber, 
            originalInvoiceNumber, 
            originalIssueDate, 
            correctionReason, 
            correctionType 
        } = req.body;
        
        if (!originalKsefNumber) {
            return res.status(400).json({ error: 'Brak originalKsefNumber w body' });
        }
        
        const result = await KsefController.submitCorrectionById(
            invoiceId, 
            originalKsefNumber,
            {
                originalInvoiceNumber,
                originalIssueDate,
                correctionReason,
                correctionType
            }
        );
        res.json(result);
    } catch (error: any) {
        console.error('[KSeF] Błąd wysyłki korekty:', error.message);
        if (error.validationErrors) {
            return res.status(400).json({ 
                error: 'Walidacja nie powiodła się', 
                details: error.validationErrors 
            });
        }
        next(error);
    }
});

/**
 * GET /invoice/:id/ksef/status
 * Sprawdza status faktury w KSeF
 * 
 * Response: { invoiceId, referenceNumber, ksefNumber, status, ... }
 */
app.get('/invoice/:id/ksef/status', async (req: Request, res: Response, next) => {
    try {
        const invoiceId = parseInt(req.params.id, 10);
        if (isNaN(invoiceId)) {
            return res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
        }
        
        const result = await KsefController.checkStatusByInvoiceId(invoiceId);
        res.json(result);
    } catch (error: any) {
        console.error('[KSeF] Błąd sprawdzania statusu:', error.message);
        next(error);
    }
});

/**
 * GET /invoice/:id/ksef/upo
 * Pobiera UPO (Urzędowe Poświadczenie Odbioru)
 * 
 */
app.get('/invoice/:id/ksef/upo', async (req: Request, res: Response, next) => {
    try {
        const invoiceId = parseInt(req.params.id, 10);
        if (isNaN(invoiceId)) {
            return res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
        }
        
        const upoBuffer = await KsefController.downloadUpoByInvoiceId(invoiceId);
        
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `inline; filename="UPO_faktura_${invoiceId}.xml"`);
        res.send(upoBuffer);
    } catch (error: any) {
        console.error('[KSeF] Błąd pobierania UPO:', error.message);
        next(error);
    }
});

/**
 * GET /invoice/:id/ksef/xml
 * Pobiera XML faktury z KSeF
 * 
 * Response: XML faktury
 */
app.get('/invoice/:id/ksef/xml', async (req: Request, res: Response, next) => {
    try {
        const invoiceId = parseInt(req.params.id, 10);
        if (isNaN(invoiceId)) {
            return res.status(400).json({ error: 'Nieprawidłowe ID faktury' });
        }
        
        const xml = await KsefController.getInvoiceXmlByInvoiceId(invoiceId);
        
        res.setHeader('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error: any) {
        console.error('[KSeF] Błąd pobierania XML:', error.message);
        next(error);
    }
});
