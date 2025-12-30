/**
 * TYMCZASOWY SKRYPT TESTOWY - DO USUNIĘCIA PO TESTACH
 * Testuje generowanie XML i wysyłkę faktury o ID 6165
 * 
 * KSeF API 2.0 (od 30.09.2025)
 */
import 'dotenv/config';
import InvoiceRepository from '../InvoiceRepository';
import InvoiceItemsController from '../InvoiceItemsController';
import KsefXmlBuilder from './KsefXmlBuilder';
import InvoiceKsefValidator from './InvoiceKsefValidator';
import KsefService from './KsefService';

const TEST_INVOICE_ID = 6165;

async function testKsef() {
    console.log('='.repeat(60));
    console.log('🧪 TEST KSeF 2.0 - Faktura ID:', TEST_INVOICE_ID);
    console.log('='.repeat(60));

    // 1. Pobierz fakturę
    console.log('\n📥 [1/7] Pobieranie faktury z bazy...');
    const repo = new InvoiceRepository();
    const invoices = await repo.find([{ id: TEST_INVOICE_ID }]);
    const invoice = invoices[0];

    if (!invoice) {
        console.error('❌ Faktura nie znaleziona!');
        return;
    }

    console.log('✅ Faktura znaleziona:');
    console.log('   - ID:', invoice.id);
    console.log('   - Numer:', invoice.number || '(brak)');
    console.log('   - Status:', invoice.status);
    console.log('   - Data wystawienia:', invoice.issueDate);
    console.log('   - Kwota netto:', invoice._totalNetValue);
    console.log('   - Kontrahent:', invoice._entity?.name || '(brak)');
    console.log('   - NIP kontrahenta:', invoice._entity?.taxNumber || '(brak)');

    // 2. Pobierz pozycje faktury
    console.log('\n📋 [2/7] Pobieranie pozycji faktury...');
    const items = await InvoiceItemsController.find([{ invoiceId: TEST_INVOICE_ID }]);
    invoice._items = items;
    console.log(`✅ Znaleziono ${items.length} pozycji:`);
    items.forEach((item: any, i: number) => {
        console.log(`   ${i + 1}. ${item.description} | Ilość: ${item.quantity} | Cena: ${item.unitPrice} | Netto: ${item._netValue}`);
    });

    // 3. Walidacja
    console.log('\n🔍 [3/7] Walidacja danych dla KSeF...');
    try {
        InvoiceKsefValidator.validateForKsef(invoice as any);
        console.log('✅ Walidacja OK - faktura może być wysłana do KSeF');
    } catch (err: any) {
        console.error('❌ Walidacja FAILED:', err.message);
        if (err.validationErrors) {
            console.error('   Błędy:', err.validationErrors);
        }
        console.log('\n⚠️ Przerywam test - napraw dane faktury przed wysyłką');
        return;
    }

    // 4. Generowanie XML
    console.log('\n📄 [4/7] Generowanie XML...');
    const xml = KsefXmlBuilder.buildXml(invoice);
    console.log('✅ XML wygenerowany:\n');
    console.log('-'.repeat(60));
    console.log(xml);
    console.log('-'.repeat(60));

    // 5. Informacje o konfiguracji
    console.log('\n⚙️ [5/7] Konfiguracja KSeF 2.0:');
    console.log('   URL bazowy:', process.env.KSEF_API_URL_TEST);
    console.log('   NIP:', process.env.KSEF_NIP);
    console.log('   Token KSeF:', process.env.KSEF_AUTH_TOKEN_TEST ? '***ustawiony***' : 'BRAK!');
    
    const service = new KsefService();
    
    try {
        // 6. Uwierzytelnienie (KSeF 2.0: token JWT)
        console.log('\n🔐 [6/7] Uwierzytelnianie w KSeF 2.0...');
        await service.authenticateWithKsefToken();
        console.log('✅ Uwierzytelnienie zakończone');

        // 7. Wysyłka faktury (KSeF 2.0: sesja + szyfrowanie AES)
        console.log('\n🚀 [7/7] Wysyłka faktury do KSeF...');
        const response = await service.submitInvoice(xml);
        console.log('✅ Faktura wysłana!');
        console.log('   Odpowiedź z KSeF:');
        console.log(JSON.stringify(response, null, 2));

        // Sprawdź status - może być w różnych polach
        const invoiceRef = response.invoiceReferenceNumber || response.referenceNumber;
        if (invoiceRef) {
            console.log('\n📊 Sprawdzanie statusu faktury...');
            // Poczekaj chwilę na przetworzenie
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            try {
                const status = await service.getInvoiceStatus(invoiceRef);
                console.log('   Status:', JSON.stringify(status, null, 2));
                
                // Sprawdź czy KSeF zwrócił numer faktury
                if (status.ksefReferenceNumber) {
                    console.log('\n✅ SUKCES! Faktura w KSeF:');
                    console.log('   Numer KSeF:', status.ksefReferenceNumber);
                }
                if (status.processingCode) {
                    console.log('   Kod przetwarzania:', status.processingCode, '-', status.processingDescription || '');
                }
            } catch (statusErr: any) {
                console.log('   ⚠️ Nie można sprawdzić statusu:', statusErr.message);
                console.log('   (Faktura może być jeszcze przetwarzana)');
            }
        }

    } catch (err: any) {
        console.error('\n❌ Błąd:', err.message);
        if (err.response) {
            console.error('   Status HTTP:', err.response.status);
            console.error('   Odpowiedź:', JSON.stringify(err.response.data, null, 2));
        }
        if (err.code) {
            console.error('   Kod błędu:', err.code);
        }
    } finally {
        // Zawsze zamknij sesję
        console.log('\n🔒 Zamykanie sesji...');
        await service.terminateSession();
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 TEST ZAKOŃCZONY');
    console.log('='.repeat(60));
}

// Uruchom test
testKsef()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('💥 Nieoczekiwany błąd:', err);
        process.exit(1);
    });
