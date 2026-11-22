import { RequestHandler, Response } from 'express';
import { SystemRoleName } from '../types/sessionTypes';
import { hasBankModuleAccess } from '../bankSync/bankAccess';
import ProjectAssignmentRepository from '../persons/projectAssignments/ProjectAssignmentRepository';
import { ContractScope, personContractScope } from '../persons/projectAssignments/projectMembership';
import { ForbiddenError } from '../persons/projectAssignments/ProjectScopeGuard';
import { makeContractScopeCondition } from '../tools/ProjectScope';
import ToolsDb from '../tools/ToolsDb';
import Tools from '../tools/Tools';

export function salesInvoicesScopedForRole(role?: SystemRoleName): boolean {
    // shortcut: przelacznik na czas przegladu przypisan, usunac po wlaczeniu na produkcji
    return process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES === 'true' && role === SystemRoleName.ENVI_EMPLOYEE;
}

const records = {
    contract: { from: 'Contracts', id: 'Contracts.Id' },
    invoice: { from: 'Invoices JOIN Contracts ON Contracts.Id = Invoices.ContractId', id: 'Invoices.Id' },
    item: { from: 'InvoiceItems JOIN Invoices ON Invoices.Id = InvoiceItems.ParentId JOIN Contracts ON Contracts.Id = Invoices.ContractId', id: 'InvoiceItems.Id' },
};

async function assertRecord(kind: keyof typeof records, value: unknown, scope: ContractScope): Promise<void> {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0)
        throw new ForbiddenError('Brak uprawnień do faktury sprzedaży lub jej kontraktu.');
    const record = records[kind];
    const rows = await ToolsDb.getQueryCallbackAsync(
        `SELECT 1 FROM ${record.from} WHERE ${record.id} = ? AND ${makeContractScopeCondition(scope)} LIMIT 1`,
        undefined, [id],
    ) as any[];
    if (!rows.length) throw new ForbiddenError('Brak uprawnień do faktury sprzedaży lub jej kontraktu.');
}

type Operation = 'list' | 'itemsList' | 'invoice' | 'newInvoice' | 'copyInvoice' | 'series' | 'item' | 'newItem' | 'summary';

const PAYMENT_FIELDS = new Set(['paymentStatus', 'paidAmount', 'paymentDate', 'paidManually', 'statusBeforePayment']);

/**
 * Kwoty i daty wpłat (z wyciągów) widzi tylko osoba z dostępem do banku - decyzja ownera BNK-B4.
 * Filtr na res.json obejmuje każdą odpowiedź JSON trasy, na dowolnej głębokości (także korekty),
 * więc nowa trasa za tą bramką jest domyślnie zakryta. Status faktury zostaje; stan płatności też jest ukryty ("częściowo" zdradza wpływ).
 */
function hidePaymentFields(res: Response): void {
    const json = res.json.bind(res);
    res.json = (body?: any) => json(body === undefined ? body
        : JSON.parse(JSON.stringify(body, (key, value) => (PAYMENT_FIELDS.has(key) ? undefined : value))));
}

/** Wspólna bramka tras: rzeczywisty rekord z bazy oraz docelowy kontrakt/rodzic z żądania. */
export function salesInvoiceAccess(operation: Operation): RequestHandler {
    return async (req, res, next) => {
        const user = req.session?.userData;
        try {
            if (!(await hasBankModuleAccess(user))) hidePaymentFields(res);
        } catch (error) {
            return next(error);
        }
        if (!user || !salesInvoicesScopedForRole(user.systemRoleName)) return next();
        try {
            const scope = req.salesInvoiceScope = personContractScope(
                await ProjectAssignmentRepository.findMembership({ personId: user.enviId }), user.enviId,
            );
            if (operation === 'list' || operation === 'itemsList') {
                // Szczegóły są pobierane tymi samymi trasami co listy; jawne ID wymaga 403 poza zakresem.
                for (const condition of req.parsedBody?.orConditions || []) {
                    if (operation === 'list' && condition.id != null)
                        await assertRecord('invoice', condition.id, scope);
                    if (operation === 'itemsList') {
                        if (condition.invoiceItemId != null) await assertRecord('item', condition.invoiceItemId, scope);
                        if (condition.invoiceId != null) await assertRecord('invoice', condition.invoiceId, scope);
                    }
                }
                return next();
            }
            if (operation === 'invoice' || operation === 'item')
                await assertRecord(operation, req.params.id, scope);

            // Multer udostępnia pola JSON jako tekst; issueInvoice parsuje je w ten sam sposób.
            const rawBody = Tools.parseObjectsJSON(req.body);
            if (operation === 'series') await assertRecord('invoice', rawBody.sourceInvoiceId, scope);
            if (operation === 'summary') await assertRecord('contract', req.parsedBody?.contractId, scope);
            if (operation === 'copyInvoice') await assertRecord('invoice', rawBody.id, scope);
            if (operation === 'newInvoice') await assertRecord('contract', rawBody._contract?.id, scope);
            if (operation === 'newItem') await assertRecord('invoice', rawBody._parent?.id, scope);
            for (const body of [rawBody, req.parsedBody || {}]) {
                if (body.id != null && (operation === 'invoice' || operation === 'item'))
                    await assertRecord(operation, body.id, scope);
                if (['invoice', 'newInvoice', 'copyInvoice'].includes(operation)) {
                    if (body._contract) await assertRecord('contract', body._contract.id, scope);
                    if (body.contractId != null) await assertRecord('contract', body.contractId, scope);
                    if (body.correctedInvoiceId != null) await assertRecord('invoice', body.correctedInvoiceId, scope);
                }
                if (['item', 'newItem'].includes(operation)) {
                    if (body._parent) await assertRecord('invoice', body._parent.id, scope);
                    if (body.parentId != null) await assertRecord('invoice', body.parentId, scope);
                }
            }
            next();
        } catch (error) {
            if (error instanceof ForbiddenError) {
                res.status(403).send({ errorMessage: error.message });
                return;
            }
            next(error);
        }
    };
}
