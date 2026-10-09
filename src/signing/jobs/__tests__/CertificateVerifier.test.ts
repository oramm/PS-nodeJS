import { X509Certificate } from 'crypto';
import { verifySigningCertificate } from '../CertificateVerifier';
import { QUALIFIED_CA_ALLOWLIST } from '../QualifiedCaAllowlist';
import { SigningJobError } from '../SigningJobError';
import { KitIdentity, makeIdentity, sha256Hex } from './jobsTestKit';
import { REAL_INTERMEDIATE_B64, REAL_ROOT_B64 } from './realCaCertificates';

const NOW = new Date('2026-10-09T10:00:00Z');

function rejection(run: () => unknown): SigningJobError {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(SigningJobError);
        return error as SigningJobError;
    }
    throw new Error('oczekiwano odmowy certyfikatu');
}

describe('verifySigningCertificate', () => {
    let good: KitIdentity;
    beforeAll(async () => {
        good = await makeIdentity({ commonName: 'Żaneta Gęślarz-Łoś' });
    });

    it('przyjmuje certyfikat kwalifikowany z lancucha do CA z listy i zwraca dane podpisujacego', () => {
        const result = verifySigningCertificate(good.chainDer, { now: NOW, allowlist: good.allowlist });

        expect(result.subjectCn).toBe('Żaneta Gęślarz-Łoś');
        expect(result.serial).toBe(good.serialHex);
        expect(result.issuerCn).toBe('Test Kwalifikowany CA');
        expect(result.issuerSha256).toBe(sha256Hex(good.chainDer[1]));
        expect(result.trustedCa.label).toBe('test-posredni');
    });

    it('przyjmuje tez lancuch zakotwiczony tylko w korzeniu z listy (posredni nieznany z nazwy)', () => {
        const rootOnly = good.allowlist.filter((ca) => ca.label === 'test-korzen');
        const result = verifySigningCertificate(good.chainDer, { now: NOW, allowlist: rootOnly });

        expect(result.trustedCa.label).toBe('test-korzen');
    });

    it('odrzuca certyfikat samopodpisany (ma wszystkie rozszerzenia, ale nie ma wystawcy z listy)', async () => {
        const self = await makeIdentity({ selfSigned: true });

        const error = rejection(() =>
            verifySigningCertificate(self.chainDer, { now: NOW, allowlist: good.allowlist })
        );
        expect(error.code).toBe('CERTIFICATE_REJECTED');
        expect(error.status).toBe(422);
        expect(error.message).toMatch(/Brak certyfikatów urzędu/);
    });

    it('odrzuca samopodpisany certyfikat, ktory sam wpisano na liste jako "CA" (lisc nie jest kotwica)', async () => {
        const self = await makeIdentity({ selfSigned: true });
        const allowlist = [{ sha256: sha256Hex(self.chainDer[0]), label: 'oszust' }];

        rejection(() =>
            verifySigningCertificate([...self.chainDer, ...self.chainDer], { now: NOW, allowlist })
        );
    });

    it('odrzuca lancuch do CA spoza listy', async () => {
        const stranger = await makeIdentity();

        const error = rejection(() =>
            verifySigningCertificate(stranger.chainDer, { now: NOW, allowlist: good.allowlist })
        );
        expect(error.message).toMatch(/zaufanego urzędu/);
    });

    it('nie daje sie oszukac nazwa wystawcy: CA o identycznej nazwie, ale innym kluczu, jest odrzucone', async () => {
        // makeIdentity zawsze nazywa posredniego "Test Kwalifikowany CA" - tak samo jak u `good`.
        const spoofed = await makeIdentity();
        expect(new X509Certificate(spoofed.chainDer[1]).subject).toBe(
            new X509Certificate(good.chainDer[1]).subject
        );

        const error = rejection(() =>
            verifySigningCertificate(spoofed.chainDer, { now: NOW, allowlist: good.allowlist })
        );
        expect(error.message).toMatch(/zaufanego urzędu/);
    });

    it('odrzuca lisc podpisany przez kogo innego niz CA, ktorego wpisano w lancuchu', async () => {
        const other = await makeIdentity();
        // lisc z `good`, ale posredni i korzen z `other`: podpis lisca nie pasuje do klucza posredniego.
        const chain = [good.chainDer[0], other.chainDer[1], other.chainDer[2]];

        const error = rejection(() =>
            verifySigningCertificate(chain, {
                now: NOW,
                allowlist: [...good.allowlist, ...other.allowlist],
            })
        );
        expect(error.message).toMatch(/zaufanego urzędu/);
    });

    it('odrzuca certyfikat bez uzycia klucza "niezaprzeczalnosc"', async () => {
        const identity = await makeIdentity({ nonRepudiation: false });

        const error = rejection(() =>
            verifySigningCertificate(identity.chainDer, { now: NOW, allowlist: identity.allowlist })
        );
        expect(error.message).toMatch(/niezaprzeczalność/);
    });

    it('odrzuca certyfikat bez rozszerzenia QcStatements', async () => {
        const identity = await makeIdentity({ qcStatements: false });

        const error = rejection(() =>
            verifySigningCertificate(identity.chainDer, { now: NOW, allowlist: identity.allowlist })
        );
        expect(error.message).toMatch(/QcStatements/);
    });

    it('odrzuca certyfikat po terminie i jeszcze nieobowiazujacy', async () => {
        const expired = await makeIdentity({
            notBefore: new Date('2020-01-01T00:00:00Z'),
            notAfter: new Date('2025-01-01T00:00:00Z'),
        });
        const future = await makeIdentity({
            notBefore: new Date('2030-01-01T00:00:00Z'),
            notAfter: new Date('2032-01-01T00:00:00Z'),
        });

        expect(
            rejection(() =>
                verifySigningCertificate(expired.chainDer, { now: NOW, allowlist: expired.allowlist })
            ).message
        ).toMatch(/po terminie ważności/);
        expect(
            rejection(() =>
                verifySigningCertificate(future.chainDer, { now: NOW, allowlist: future.allowlist })
            ).message
        ).toMatch(/po terminie ważności albo jeszcze nie obowiązuje/);
    });

    it('odrzuca lancuch, w ktorym posredni nie jest CA', async () => {
        const identity = await makeIdentity({ intermediateIsNotCa: true });

        const error = rejection(() =>
            verifySigningCertificate(identity.chainDer, { now: NOW, allowlist: identity.allowlist })
        );
        expect(error.message).toMatch(/nie jest certyfikatem CA/);
    });

    it('odrzuca pusty, nieczytelny i pojedynczy (bez wystawcy) certyfikat', () => {
        rejection(() => verifySigningCertificate([], { now: NOW }));
        rejection(() => verifySigningCertificate([Buffer.from('to nie jest DER')], { now: NOW }));
        rejection(() =>
            verifySigningCertificate([good.chainDer[0]], { now: NOW, allowlist: good.allowlist })
        );
    });
});

describe('QUALIFIED_CA_ALLOWLIST (produkcyjna lista)', () => {
    const intermediate = Buffer.from(REAL_INTERMEDIATE_B64, 'base64');
    const root = Buffer.from(REAL_ROOT_B64, 'base64');

    it('zawiera dokladnie odciski posredniego COPE SZAFIR i korzenia NCCert z prawdziwej karty', () => {
        const fingerprints = QUALIFIED_CA_ALLOWLIST.map((ca) => ca.sha256);

        expect(fingerprints).toEqual([sha256Hex(intermediate), sha256Hex(root)]);
        expect(new X509Certificate(intermediate).subject).toMatch(/COPE SZAFIR - Kwalifikowany/);
        expect(new X509Certificate(root).subject).toMatch(/Narodowe Centrum Certyfikacji/);
    });

    it('posredni jest kryptograficznie podpisany przez korzen z listy', () => {
        expect(new X509Certificate(intermediate).verify(new X509Certificate(root).publicKey)).toBe(true);
    });

    it('lancuch testowy nie przechodzi na produkcyjnej liscie', async () => {
        const test = await makeIdentity();

        rejection(() => verifySigningCertificate(test.chainDer, { now: NOW }));
    });
});
