const previousKey = process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY;
const testKey = '12'.repeat(32);

function loadCipher(key: string | undefined = testKey) {
    jest.resetModules();
    if (key === undefined) delete process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY;
    else process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY = key;
    return require('../licenseKeyCipher') as typeof import('../licenseKeyCipher');
}

afterAll(() => {
    if (previousKey === undefined) delete process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY;
    else process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY = previousKey;
    jest.resetModules();
});

describe('license key encryption', () => {
    test.each(['ABCDE-12345', 'Zażółć 🔑', ''])('round trip preserves %p', (value) => {
        const cipher = loadCipher();
        expect(cipher.decryptLicenseKey(cipher.encryptLicenseKey(value))).toBe(value);
    });

    test('uses a fresh IV on each encryption', () => {
        const cipher = loadCipher();
        const first = cipher.encryptLicenseKey('test-license');
        const second = cipher.encryptLicenseKey('test-license');
        expect(first.split(':')[1]).not.toBe(second.split(':')[1]);
        expect(first).not.toContain('test-license');
    });

    test.each([1, 2, 3])('rejects tampering with segment %i', (segment) => {
        const cipher = loadCipher();
        const parts = cipher.encryptLicenseKey('test-license').split(':');
        parts[segment] = (parts[segment][0] === '0' ? '1' : '0') + parts[segment].slice(1);
        expect(() => cipher.decryptLicenseKey(parts.join(':'))).toThrow('Nie można odszyfrować klucza licencyjnego.');
    });

    test('rejects another encryption key', () => {
        const encrypted = loadCipher().encryptLicenseKey('test-license');
        expect(() => loadCipher('34'.repeat(32)).decryptLicenseKey(encrypted)).toThrow('Nie można odszyfrować');
    });

    test.each(['', 'v2:00:00:00', 'secret-that-must-not-leak', 'v1:00:00:gg'])('rejects invalid envelopes without echoing input', (value) => {
        const cipher = loadCipher();
        expect(() => cipher.decryptLicenseKey(value)).toThrow(/^Nie można odszyfrować klucza licencyjnego\.$/);
    });

    test.each(['', 'password', 'ab'.repeat(31), 'gg'.repeat(32), 'ab'.repeat(33)])('rejects invalid configuration at import', (value) => {
        expect(() => loadCipher(value)).toThrow('SOFTWARE_LICENSE_ENCRYPTION_KEY must contain 64 hexadecimal characters');
    });

    test('fails at import when configuration is absent', () => {
        jest.resetModules();
        delete process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY;
        expect(() => require('../licenseKeyCipher')).toThrow('SOFTWARE_LICENSE_ENCRYPTION_KEY must contain');
    });
});
