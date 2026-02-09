import { loadEnv } from './../../setup/loadEnv';
loadEnv();
import InvoiceRepository from '../InvoiceRepository';
import InvoiceItemsController from '../InvoiceItemsController';
import KsefXmlBuilder from './KsefXmlBuilder';
import * as crypto from 'crypto';

async function debug() {
    const TEST_INVOICE_ID = 6165;
    
    const repo = new InvoiceRepository();
    const invoices = await repo.find([{ id: TEST_INVOICE_ID }]);
    const invoice = invoices[0];
    
    const items = await InvoiceItemsController.find([{ invoiceId: TEST_INVOICE_ID }]);
    invoice._items = items;
    
    const xml = KsefXmlBuilder.buildXml(invoice);
    
    console.log('=== DEBUG ROZMIAR FAKTURY ===');
    console.log('XML string length (znaki):', xml.length);
    
    const buf = Buffer.from(xml, 'utf-8');
    console.log('Buffer length (bajty UTF-8):', buf.length);
    
    // Sprawdzmy czy są polskie znaki
    const polishChars = xml.match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g);
    console.log('Polskie znaki:', polishChars);
    
    // Oblicz hash
    const hash = crypto.createHash('sha256').update(buf).digest('base64');
    console.log('Hash SHA256 (base64):', hash);
    
    // Pokaż pierwsze bajty
    console.log('Pierwsze 100 bajtów hex:', buf.slice(0, 100).toString('hex'));
    
    // AES szyfrowanie test
    const aesKey = crypto.randomBytes(32);
    const aesIv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesIv);
    cipher.setAutoPadding(true);
    
    const encrypted = Buffer.concat([
        cipher.update(xml, 'utf-8'),
        cipher.final()
    ]);
    
    const withIv = Buffer.concat([aesIv, encrypted]);
    
    console.log('\n=== PO SZYFROWANIU ===');
    console.log('Zaszyfrowany rozmiar (bez IV):', encrypted.length);
    console.log('Zaszyfrowany rozmiar (z IV):', withIv.length);
    console.log('Różnica (IV):', withIv.length - buf.length);
    
    // Sprawdź czy padding działa poprawnie
    const blockSize = 16;
    const paddedSize = Math.ceil(buf.length / blockSize) * blockSize;
    console.log('\n=== PADDING ===');
    console.log('Oryginał:', buf.length, 'bajtów');
    console.log('Po paddingu (wielokrotność 16):', paddedSize, 'bajtów');
    console.log('Oczekiwany rozmiar z IV:', paddedSize + 16, 'bajtów');
    console.log('Faktyczny rozmiar z IV:', withIv.length, 'bajtów');
    
    process.exit(0);
}

debug().catch(console.error);
