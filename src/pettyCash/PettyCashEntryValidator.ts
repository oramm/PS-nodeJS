import PettyCashEntry from './PettyCashEntry';
import PostalDispatch from './postal/PostalDispatch';
import PostalDispatchItem from './postal/PostalDispatchItem';
import { isEntryKind, isSettlementMethod } from './pettyCashTypes';

export type PostalDispatchItemDto = {
    trackingNumber?: unknown;
    addressee?: unknown;
    contentsDescription?: unknown;
    amount?: unknown;
};

export type PettyCashEntryDto = {
    entryKind?: unknown;
    entryDate?: unknown;
    description?: unknown;
    netAmount?: unknown;
    grossAmount?: unknown;
    noDocumentAmount?: unknown;
    inflowAmount?: unknown;
    documentNumber?: unknown;
    payerLabel?: unknown;
    settlementMethod?: unknown;
    note?: unknown;
    dispatch?: { invoiceNumber?: unknown; items?: unknown } | null;
};

export class PettyCashValidationError extends Error {
    readonly status = 400;
    constructor(readonly errors: string[]) {
        super(errors.join(' '));
        this.name = 'PettyCashValidationError';
    }
}

/**
 * Walidacja danych wejsciowych HTTP.
 *
 * Reguly domenowe - kwoty wlasciwe dla rodzaju, regula rozliczenia, zgodnosc sumy
 * listow z faktura - mieszkaja w modelu (`PettyCashEntry.consistencyErrors`).
 * Walidator je wola, zamiast powtarzac: jedno miejsce, w ktorym te reguly zyja,
 * to jedyny sposob, zeby nie rozjechaly sie miedzy warstwami.
 */
export default class PettyCashEntryValidator {
    /** Sprawdza ksztalt DTO, buduje model i zwraca go albo rzuca z lista bledow. */
    static buildAndValidate(dto: PettyCashEntryDto): PettyCashEntry {
        const errors = this.shapeErrors(dto);
        if (errors.length) throw new PettyCashValidationError(errors);

        const entry = this.toModel(dto);
        const domainErrors = entry.consistencyErrors();
        if (domainErrors.length) throw new PettyCashValidationError(domainErrors);

        return entry;
    }

    static shapeErrors(dto: PettyCashEntryDto): string[] {
        const errors: string[] = [];

        if (!isEntryKind(dto.entryKind))
            errors.push(`Nieznany rodzaj wpisu: ${String(dto.entryKind)}.`);
        if (!isSettlementMethod(dto.settlementMethod))
            errors.push(`Nieznany sposob rozliczenia: ${String(dto.settlementMethod)}.`);
        if (typeof dto.entryDate !== 'string' || !dto.entryDate.trim())
            errors.push('Brak daty wpisu.');
        if (typeof dto.description !== 'string' || !dto.description.trim())
            errors.push('Brak opisu wpisu.');
        if (typeof dto.payerLabel !== 'string' || !dto.payerLabel.trim())
            errors.push('Brak informacji, kto zaplacil.');

        if (dto.entryKind === 'POSTAL') {
            const dispatch = dto.dispatch;
            if (!dispatch || typeof dispatch !== 'object')
                errors.push('Wpis pocztowy wymaga listy wyslanych listow.');
            else {
                if (
                    typeof dispatch.invoiceNumber !== 'string' ||
                    !dispatch.invoiceNumber.trim()
                )
                    errors.push('Brak numeru faktury Poczty.');
                if (!Array.isArray(dispatch.items) || dispatch.items.length === 0)
                    errors.push('Wysylka nie zawiera zadnego listu.');
                else
                    (dispatch.items as PostalDispatchItemDto[]).forEach((item, index) => {
                        if (
                            !PostalDispatchItem.isValidTrackingNumber(
                                item?.trackingNumber as string
                            )
                        )
                            errors.push(
                                `List ${index + 1}: numer nadania jest niepoprawny.`
                            );
                    });
            }
        } else if (dto.dispatch) {
            errors.push('Tylko wpis pocztowy moze miec liste listow.');
        }

        return errors;
    }

    private static toModel(dto: PettyCashEntryDto): PettyCashEntry {
        const dispatch = dto.dispatch;

        return new PettyCashEntry({
            entryKind: dto.entryKind as any,
            entryDate: dto.entryDate as string,
            description: dto.description as string,
            netAmount: PettyCashEntry.parseAmountOrNull(dto.netAmount),
            grossAmount: PettyCashEntry.parseAmountOrNull(dto.grossAmount),
            noDocumentAmount: PettyCashEntry.parseAmountOrNull(dto.noDocumentAmount),
            inflowAmount: PettyCashEntry.parseAmountOrNull(dto.inflowAmount),
            documentNumber:
                typeof dto.documentNumber === 'string' ? dto.documentNumber : null,
            payerLabel: dto.payerLabel as string,
            settlementMethod: dto.settlementMethod as any,
            note: typeof dto.note === 'string' ? dto.note : null,
            _dispatch: dispatch
                ? new PostalDispatch({
                      invoiceNumber: String(dispatch.invoiceNumber ?? ''),
                      items: ((dispatch.items ?? []) as PostalDispatchItemDto[]).map(
                          (item, index) =>
                              new PostalDispatchItem({
                                  itemIndex: index + 1,
                                  trackingNumber: String(item?.trackingNumber ?? ''),
                                  addressee: String(item?.addressee ?? ''),
                                  contentsDescription:
                                      typeof item?.contentsDescription === 'string'
                                          ? item.contentsDescription
                                          : null,
                                  amount: PostalDispatchItem.parseAmount(item?.amount),
                              })
                      ),
                  })
                : undefined,
        });
    }
}
