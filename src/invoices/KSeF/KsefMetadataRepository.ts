import ToolsDb from '../../tools/ToolsDb';

interface KsefMetadata {
    invoiceId: number;
    referenceNumber?: string | null;
    sessionReferenceNumber?: string | null;
    ksefNumber?: string | null;
    status?: string | null;
    statusDescription?: string | null;
    acquisitionDate?: string | null;
    permanentStorageDate?: string | null;
    upoDownloadUrl?: string | null;
    upoDownloadUrlExpirationDate?: string | null;
    submittedAt?: Date;
    responseRaw?: any;
}

/**
 * Repository do przechowywania metadanych KSeF dla faktur
 * 
 * Tabela InvoiceKsefMetadata:
 * - InvoiceId (PK, FK do Invoices)
 * - ReferenceNumber - numer referencyjny z wysyłki (do sprawdzenia statusu w sesji)
 * - SessionReferenceNumber - numer referencyjny sesji
 * - KsefNumber - ostateczny numer KSeF faktury (po przetworzeniu)
 * - Status - kod statusu (100=przyjęta, 200=sukces, 440=duplikat, itp.)
 * - StatusDescription - opis statusu
 * - AcquisitionDate - data nadania numeru KSeF
 * - PermanentStorageDate - data trwałego zapisu
 * - UpoDownloadUrl - URL do pobrania UPO (czasowy)
 * - UpoDownloadUrlExpirationDate - data wygaśnięcia URL
 * - SubmittedAt - data wysłania
 * - ResponseRaw - surowa odpowiedź JSON z KSeF
 */
export default class KsefMetadataRepository {
    
    /**
     * Zapisuje metadata po wysłaniu faktury
     */
    static async saveMetadata(invoiceId: number, meta: KsefMetadata) {
        const sql = `
            REPLACE INTO InvoiceKsefMetadata (
                InvoiceId, ReferenceNumber, SessionReferenceNumber, KsefNumber,
                Status, StatusDescription, AcquisitionDate, PermanentStorageDate,
                UpoDownloadUrl, UpoDownloadUrlExpirationDate, SubmittedAt, ResponseRaw
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const params = [
            invoiceId,
            meta.referenceNumber || null,
            meta.sessionReferenceNumber || null,
            meta.ksefNumber || null,
            meta.status || null,
            meta.statusDescription || null,
            meta.acquisitionDate || null,
            meta.permanentStorageDate || null,
            meta.upoDownloadUrl || null,
            meta.upoDownloadUrlExpirationDate || null,
            meta.submittedAt || new Date(),
            meta.responseRaw ? JSON.stringify(meta.responseRaw) : null,
        ];
        
        return await ToolsDb.executePreparedStmt(sql, params, meta);
    }

    /**
     * Aktualizuje metadata (po sprawdzeniu statusu)
     */
    static async updateMetadata(invoiceId: number, updates: Partial<KsefMetadata>) {
        const setClauses: string[] = [];
        const params: any[] = [];

        if (updates.ksefNumber !== undefined) {
            setClauses.push('KsefNumber = ?');
            params.push(updates.ksefNumber);
        }
        if (updates.status !== undefined) {
            setClauses.push('Status = ?');
            params.push(updates.status);
        }
        if (updates.statusDescription !== undefined) {
            setClauses.push('StatusDescription = ?');
            params.push(updates.statusDescription);
        }
        if (updates.acquisitionDate !== undefined) {
            setClauses.push('AcquisitionDate = ?');
            params.push(updates.acquisitionDate);
        }
        if (updates.permanentStorageDate !== undefined) {
            setClauses.push('PermanentStorageDate = ?');
            params.push(updates.permanentStorageDate);
        }
        if (updates.upoDownloadUrl !== undefined) {
            setClauses.push('UpoDownloadUrl = ?');
            params.push(updates.upoDownloadUrl);
        }
        if (updates.upoDownloadUrlExpirationDate !== undefined) {
            setClauses.push('UpoDownloadUrlExpirationDate = ?');
            params.push(updates.upoDownloadUrlExpirationDate);
        }

        if (setClauses.length === 0) return;

        params.push(invoiceId);
        const sql = `UPDATE InvoiceKsefMetadata SET ${setClauses.join(', ')} WHERE InvoiceId = ?`;
        
        return await ToolsDb.executePreparedStmt(sql, params, updates);
    }

    /**
     * Pobiera metadata dla faktury
     */
    static async findByInvoiceId(invoiceId: number): Promise<any | null> {
        const sql = `SELECT * FROM InvoiceKsefMetadata WHERE InvoiceId = ?`;
        const rows: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(
            sql,
            undefined,
            [invoiceId]
        );
        return rows && rows.length > 0 ? rows[0] : null;
    }

    /**
     * Pobiera wszystkie faktury oczekujące na przetworzenie w KSeF
     */
    static async findPending(): Promise<any[]> {
        const sql = `SELECT * FROM InvoiceKsefMetadata WHERE Status = 'PENDING' OR (Status IS NULL AND ReferenceNumber IS NOT NULL)`;
        const rows: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows || [];
    }
}
