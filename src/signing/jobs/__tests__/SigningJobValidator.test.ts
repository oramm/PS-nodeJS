import SigningJobValidator from '../SigningJobValidator';

const files = [{ kind: 'DRIVE_FILE', gdFileId: 'CONTRACT_DOC_ID_001', withGraphic: false }];

describe('SigningJobValidator contract source', () => {
    it('parses a contract id using the existing id normalisation', () => {
        expect(SigningJobValidator.parseCreateJob({ contractId: '55', files }).source)
            .toEqual({ type: 'CONTRACT', id: 55 });
    });

    it.each([null, '', 0, -1, 1.5, 'abc'])('rejects an invalid contract id: %s', (contractId) => {
        expect(() => SigningJobValidator.parseCreateJob({ contractId, files }))
            .toThrow('Brak identyfikatora kontraktu.');
    });

    it.each([
        { letterId: 1, offerId: 2 },
        { letterId: 1, contractId: 3 },
        { offerId: 2, contractId: 3 },
        { letterId: 1, offerId: 2, contractId: 3 },
    ])('rejects multiple sources: %s', (source) => {
        expect(() => SigningJobValidator.parseCreateJob({ ...source, files }))
            .toThrow('Zlecenie może dotyczyć jednego źródła: pisma, oferty albo kontraktu.');
    });

    it('keeps the existing missing source and invalid offer messages', () => {
        expect(() => SigningJobValidator.parseCreateJob({ files })).toThrow('Brak identyfikatora pisma.');
        expect(() => SigningJobValidator.parseCreateJob({ offerId: 0, files })).toThrow('Brak identyfikatora oferty.');
    });
});
