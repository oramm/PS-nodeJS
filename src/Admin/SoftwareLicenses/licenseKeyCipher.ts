import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// A generated 256-bit key, not a human password. Keep it outside the database.
const encodedKey = process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY;
if (!encodedKey || !/^[0-9a-fA-F]{64}$/.test(encodedKey)) {
    throw new Error('SOFTWARE_LICENSE_ENCRYPTION_KEY must contain 64 hexadecimal characters (32 random bytes).');
}
const encryptionKey = Buffer.from(encodedKey, 'hex');

export function encryptLicenseKey(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(':');
}

export function decryptLicenseKey(encrypted: string): string {
    try {
        if (!/^v1:[0-9a-f]{24}:[0-9a-f]{32}:(?:[0-9a-f]{2})*$/.test(encrypted)) {
            throw new Error('Invalid format');
        }
        const [, iv, tag, ciphertext] = encrypted.split(':');
        const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'hex'), { authTagLength: 16 });
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8');
    } catch {
        // Never expose the supplied value or underlying crypto error to logs/API clients.
        throw new Error('Nie można odszyfrować klucza licencyjnego.');
    }
}
