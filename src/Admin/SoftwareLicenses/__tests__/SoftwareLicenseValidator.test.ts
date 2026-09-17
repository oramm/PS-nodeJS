jest.mock('../../../tools/ToolsDb', () => ({ __esModule: true, default: {} }));
import Validator from '../SoftwareLicenseValidator';
import { BadRequestError } from '../../../persons/projectAssignments/ProjectScopeGuard';

const valid = { manufacturer: 'Producent', product: 'Produkt', seatsPurchased: 5, seatsUsed: 2 };

describe('license input against the migration contract', () => {
    it.each([null, [], 'text', 1])('rejects invalid object %p', (dto) => {
        expect(() => Validator.validatePayload(dto)).toThrow(BadRequestError);
    });
    it.each([undefined, null, '', ' ', true, false, [], {}, -1, 1.5, '1.5', '1e2', '0x10', 2147483648, Infinity, NaN])('rejects unsafe count %p', (value) => {
        expect(() => Validator.validatePayload({ ...valid, seatsPurchased: value })).toThrow(BadRequestError);
        expect(() => Validator.validatePayload({ ...valid, seatsUsed: value })).toThrow(BadRequestError);
    });
    it('accepts signed INT boundaries and enforces occupied <= purchased', () => {
        expect(Validator.validatePayload({ ...valid, seatsPurchased: '2147483647', seatsUsed: 2147483647 }).seatsUsed).toBe(2147483647);
        expect(Validator.validatePayload({ ...valid, seatsPurchased: 0, seatsUsed: 0 }).seatsPurchased).toBe(0);
        expect(() => Validator.validatePayload({ ...valid, seatsUsed: 6 })).toThrow(BadRequestError);
    });
    it.each([0, -1, 1.5, 2147483648, true, '', '1e2', '12bad'])('rejects invalid id %p', (value) => {
        expect(() => Validator.requireId(value)).toThrow(BadRequestError);
    });
    it.each(['manufacturer', 'product', 'version', 'licenseType', 'registrationAccount', 'billingCycle', 'status'])('rejects overflow in %s', (field) => {
        const limits: Record<string, number> = { manufacturer: 255, product: 255, version: 100, licenseType: 20, registrationAccount: 320, billingCycle: 100, status: 100 };
        expect(() => Validator.validatePayload({ ...valid, [field]: 'a'.repeat(limits[field] + 1) })).toThrow(BadRequestError);
    });
    it.each(['assignment', 'comment', 'vendorPanelUrl'])('checks TEXT byte size for %s', (field) => {
        expect(() => Validator.validatePayload({ ...valid, [field]: 'ą'.repeat(32768) })).toThrow(BadRequestError);
    });
    it.each(['https://drive.google.com/drive/folders/abc', 'https://docs.google.com/document/d/abc/edit'])(
        'accepts Google Drive URL %s', (googleDriveUrl) => {
            expect(Validator.validatePayload({ ...valid, googleDriveUrl }).googleDriveUrl).toBe(googleDriveUrl);
        });
    it.each(['http://drive.google.com/drive/folders/abc', 'https://example.com/file', 'javascript:alert(1)', 'not-a-url'])(
        'rejects unsafe Google Drive URL %s', (googleDriveUrl) => {
            expect(() => Validator.validatePayload({ ...valid, googleDriveUrl })).toThrow(BadRequestError);
        });
    it('counts unicode codepoints and refuses broken UTF-16', () => {
        expect(Validator.validatePayload({ ...valid, manufacturer: '😀'.repeat(255) }).manufacturer).toHaveLength(510);
        expect(() => Validator.validatePayload({ ...valid, manufacturer: '\ud800' })).toThrow(BadRequestError);
    });
    it.each(['-1', -1, '1.001', 1.001, '10000000000', true, {}, '1e2', '1,20', NaN, Infinity])('rejects invalid cost %p', (cost) => {
        expect(() => Validator.validatePayload({ ...valid, cost })).toThrow(BadRequestError);
    });
    it.each([['9999999999.99', '9999999999.99'], [0, '0.00'], [123.45, '123.45'], ['1.2', '1.20']])('accepts cost %p', (cost, expected) => {
        expect(Validator.validatePayload({ ...valid, cost }).cost).toBe(expected);
    });
    it.each(['2026-02-29', '2026-04-31', '2026-00-01', '0999-01-01', '0000-00-00', '2026-01-01T00:00:00Z', '2026-1-01', '10000-01-01', true])('rejects invalid date %p', (date) => {
        for (const field of ['purchaseDate', 'expirationDate'])
            expect(() => Validator.validatePayload({ ...valid, [field]: date })).toThrow(BadRequestError);
    });
    it.each(['1000-01-01', '9999-12-31', '2024-02-29'])('accepts exact date %s', (purchaseDate) => {
        expect(Validator.validatePayload({ ...valid, purchaseDate }).purchaseDate).toBe(purchaseDate);
    });
    it.each(['OEM', 'Retail', 'Volume', 'Subscription', null])('accepts type %p', (licenseType) => {
        expect(Validator.validatePayload({ ...valid, licenseType }).licenseType).toBe(licenseType);
    });
    it.each(['oem', 'Other'])('rejects type %s', (licenseType) => {
        expect(() => Validator.validatePayload({ ...valid, licenseType })).toThrow(BadRequestError);
    });
    it('preserves omitted optional fields and clears explicit empty/null values', () => {
        const existing = Validator.validatePayload({ ...valid, version: '1', cost: 12.34, expirationDate: '2028-01-01', status: 'Dowolny status' });
        expect(Validator.validatePayload({ seatsUsed: 3 }, existing)).toEqual({ ...existing, seatsUsed: 3 });
        const changed = Validator.validatePayload({ version: '', cost: null, expirationDate: '', status: null }, existing);
        expect(changed).toMatchObject({ version: null, cost: null, expirationDate: null, status: null });
        expect(() => Validator.validatePayload({ seatsPurchased: 1 }, existing)).toThrow(BadRequestError);
    });
    it.each(['123', 'null', 'true', '"quoted"', '  keep spaces  ', 'Zażółć😀'])('keeps exact license key %s', (licenseKey) => {
        expect(Validator.licenseKey({ licenseKey })).toBe(licenseKey);
    });
    it('distinguishes key omission, clearing and rejects bad values without echoing them', () => {
        expect(Validator.licenseKey({})).toBeUndefined();
        expect(Validator.licenseKey({ licenseKey: '' })).toBeNull();
        expect(Validator.licenseKey({ licenseKey: null })).toBeNull();
        for (const licenseKey of [123, {}, true, ['SYNTHETIC-PRIVATE'], '\ud800', 'x'.repeat(8388578)]) {
            expect(() => Validator.licenseKey({ licenseKey })).toThrow(BadRequestError);
            try { Validator.licenseKey({ licenseKey }); } catch (e) { expect(String(e)).not.toContain('SYNTHETIC-PRIVATE'); }
        }
    });
    it('rejects malformed search and injection identifiers', () => {
        for (const value of [null, {}, '[bad', [{ id: '1 OR 1=1' }], Array(101).fill({})])
            expect(() => Validator.search(value)).toThrow(BadRequestError);
        expect(Validator.search('[{"id":1}]')).toEqual([{ id: 1 }]);
    });
});
