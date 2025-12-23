import ToolsDb from '../../tools/ToolsDb';

export default class KsefMetadataRepository {
    static async saveMetadata(invoiceId: number, meta: any) {
        const table = 'InvoiceKsefMetadata';
        // Ensure table exists outside (migration). Here we insert/update metadata JSON
        const sql = `REPLACE INTO ${table} (InvoiceId, KsefId, Status, UpoRaw, ResponseRaw, SubmittedAt) VALUES (?, ?, ?, ?, ?, ?)`;
        const params = [
            invoiceId,
            meta.ksefId || null,
            meta.status || null,
            meta.upo ? meta.upo.toString('base64') : null,
            meta.responseRaw ? JSON.stringify(meta.responseRaw) : null,
            meta.submittedAt || new Date(),
        ];
        // executePreparedStmt expects (sql, params, object, externalConn?, isPartOfTransaction?)
        return await ToolsDb.executePreparedStmt(sql, params, meta);
    }

    static async findByInvoiceId(invoiceId: number) {
        const sql = `SELECT * FROM InvoiceKsefMetadata WHERE InvoiceId = ?`;
        const rows: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(
            sql,
            undefined,
            [invoiceId]
        );
        return rows && rows.length > 0 ? rows[0] : null;
    }
}
