import Invoice from '../Invoice';
import ToolsDb from '../../tools/ToolsDb';

export default class KsefXmlBuilder {
  // Minimal skeleton. Map invoice fields to KSeF XML structure using existing Invoice shape.
  static buildXml(invoice: Invoice): string {
    // Seller info: use configured NIP (system) and optional name from env
    const sellerNip = process.env.KSEF_NIP || '';
    const sellerName = process.env.KSEF_SELLER_NAME || 'SELLER';

    // Buyer info comes from invoice._entity
    const buyerName = ToolsDb.sqlToString(invoice._entity?.name || '');
    const buyerNip = invoice._entity?.taxNumber || '';

    const total = (invoice._totalNetValue !== undefined && invoice._totalNetValue !== null)
      ? invoice._totalNetValue
      : 0;

    const itemsXml = (invoice._items || [])
      .map((it: any) => `<Item><Name>${ToolsDb.sqlToString(it.description || it.name || '')}</Name><Quantity>${it.quantity || 0}</Quantity><UnitPrice>${it.unitPrice || it.UnitPrice || 0}</UnitPrice><Net>${it._netValue || it.net || 0}</Net></Item>`)
      .join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<KSeFInvoice>\n  <Seller>${ToolsDb.sqlToString(sellerName)}</Seller>\n  <SellerNIP>${sellerNip}</SellerNIP>\n  <Buyer>${buyerName}</Buyer>\n  <BuyerNIP>${buyerNip}</BuyerNIP>\n  <IssueDate>${invoice.issueDate}</IssueDate>\n  <Total>${total}</Total>\n  <Items>\n    ${itemsXml}\n  </Items>\n</KSeFInvoice>`;

    return xml;
  }
}
