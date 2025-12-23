import InvoiceRepository from '../InvoiceRepository';
import KsefService from './KsefService';
import KsefXmlBuilder from './KsefXmlBuilder';
import InvoiceKsefValidator from './InvoiceKsefValidator';
import KsefMetadataRepository from './KsefMetadataRepository';
import Setup from '../../setup/Setup';

export default class KsefController {
    private static service = new KsefService();
    private static repo = new InvoiceRepository();

    static async submitInvoiceById(invoiceId: number) {
        const invoices = await this.repo.find([{ id: invoiceId }]);
        const invoice = invoices[0];
        if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

        // validate DTO / model for required KSeF fields
        InvoiceKsefValidator.validateForKsef(invoice as any);

        // build XML
        const xml = KsefXmlBuilder.buildXml(invoice);

        // submit to KSeF
        const resp = await this.service.submitInvoice(xml);

        // normalize response - caller may adapt keys based on real KSeF response
        const meta: any = {
            ksefId: resp?.id || resp?.ksefId || resp?.documentId || null,
            status: resp?.status || 'SENT',
            upo: resp?.upo || resp?.UPO || null,
            responseRaw: resp,
            submittedAt: new Date(),
        };

        await KsefMetadataRepository.saveMetadata(invoiceId, meta);

        // update invoice status to SENT (best-effort)
        try {
            invoice.status = Setup.InvoiceStatus.SENT;
            await this.repo.editInDb(invoice);
        } catch (err) {
            // log and continue
            console.error('Failed to update invoice status after KSeF submit', err);
        }

        return { invoiceId, meta };
    }

    static async getStatusByInvoiceId(invoiceId: number) {
        const meta = await KsefMetadataRepository.findByInvoiceId(invoiceId);
        if (!meta || !meta.KsefId) return meta;
        const status = await this.service.getStatus(meta.KsefId);
        return { meta, status };
    }

    static async downloadUpoByInvoiceId(invoiceId: number) {
        const meta = await KsefMetadataRepository.findByInvoiceId(invoiceId);
        if (!meta || !meta.KsefId) throw new Error('KSeF metadata not found');
        const buf = await this.service.downloadUpo(meta.KsefId);
        return buf;
    }
}
