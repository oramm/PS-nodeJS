using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Win32;

namespace EnviPodpis
{
    internal sealed class CertCandidate
    {
        public X509Certificate2 Cert;
        public string Display;
        public string Thumbprint;

        public override string ToString() { return Display; }
    }

    internal enum SigningFailure
    {
        WrongPin,
        PinBlocked,
        NoCard,
        Cancelled,
        InvalidResult,
        UnsupportedKey,
        Other
    }

    internal sealed class SigningException : Exception
    {
        public SigningFailure Kind;
        public int Index;            // ktory plik (od 0)
        public string Technical;     // np. kod bledu systemu, do zgloszenia

        public SigningException(SigningFailure kind, int index, string technical)
            : base(kind.ToString())
        {
            Kind = kind;
            Index = index;
            Technical = technical;
        }
    }

    internal static class CertStore
    {
        private const string QcStatementsOid = "1.3.6.1.5.5.7.1.3";
        private const string RsaOid = "1.2.840.113549.1.1.1";

        // Certyfikat kwalifikowany do podpisu: klucz prywatny + NonRepudiation + QcStatements (ustalone w SIG-0).
        public static List<CertCandidate> FindQualified(out int skippedNonRsa)
        {
            skippedNonRsa = 0;
            List<CertCandidate> result = new List<CertCandidate>();
            DateTime now = DateTime.Now;
            X509Store store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
            try
            {
                foreach (X509Certificate2 c in store.Certificates)
                {
                    bool keep = false;
                    try
                    {
                        if (IsQualifiedSigningCert(c, now))
                        {
                            if (c.PublicKey.Oid != null && c.PublicKey.Oid.Value == RsaOid)
                            {
                                result.Add(Describe(c));
                                keep = true;
                            }
                            else
                            {
                                skippedNonRsa++;
                            }
                        }
                    }
                    catch (Exception) { }
                    if (!keep) c.Reset();
                }
            }
            finally
            {
                store.Close();
            }
            result.Sort(delegate (CertCandidate a, CertCandidate b) { return b.Cert.NotAfter.CompareTo(a.Cert.NotAfter); });
            return result;
        }

        public static bool IsQualifiedSigningCert(X509Certificate2 c, DateTime now)
        {
            if (!c.HasPrivateKey) return false;
            if (c.NotAfter <= now || c.NotBefore >= now) return false;
            if (c.Extensions[QcStatementsOid] == null) return false;
            foreach (X509Extension e in c.Extensions)
            {
                X509KeyUsageExtension ku = e as X509KeyUsageExtension;
                if (ku != null && (ku.KeyUsages & X509KeyUsageFlags.NonRepudiation) != 0) return true;
            }
            return false;
        }

        private static CertCandidate Describe(X509Certificate2 c)
        {
            CertCandidate cc = new CertCandidate();
            cc.Cert = c;
            cc.Thumbprint = c.Thumbprint;
            string name = c.GetNameInfo(X509NameType.SimpleName, false);
            string issuer = c.GetNameInfo(X509NameType.SimpleName, true);
            cc.Display = name + "  (wystawca: " + issuer + ", ważny do " + c.NotAfter.ToString("yyyy-MM-dd") + ")";
            return cc;
        }

        // Lancuch od certyfikatu podpisujacego (pierwszy) do korzenia, DER w base64.
        public static List<string> BuildChainBase64(X509Certificate2 leaf)
        {
            List<string> list = new List<string>();
            X509Chain chain = new X509Chain();
            chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
            chain.Build(leaf);
            foreach (X509ChainElement el in chain.ChainElements)
            {
                list.Add(Convert.ToBase64String(el.Certificate.RawData));
            }
            if (list.Count == 0) list.Add(Convert.ToBase64String(leaf.RawData));
            // pierwszy element musi byc certyfikatem podpisujacym
            if (list[0] != Convert.ToBase64String(leaf.RawData))
            {
                list.Insert(0, Convert.ToBase64String(leaf.RawData));
            }
            return list;
        }

        public static string LoadLastThumbprint()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(Config.RegistryAppKey))
                {
                    if (k == null) return null;
                    return k.GetValue(Config.RegistryLastThumbprint) as string;
                }
            }
            catch (Exception) { return null; }
        }

        public static void SaveLastThumbprint(string thumbprint)
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.CreateSubKey(Config.RegistryAppKey))
                {
                    k.SetValue(Config.RegistryLastThumbprint, thumbprint, RegistryValueKind.String);
                }
            }
            catch (Exception) { }
        }
    }

    internal static class SignatureBatch
    {
        // Podpisuje skroty po kolei. PIN (UTF-16 + zero na koncu) ustawiamy przed KAZDYM podpisem
        // (karta KIR wymaga PIN-u przy kazdym podpisie - SIG-0). Kazdy podpis sprawdzamy kluczem publicznym.
        // Przy pierwszym bledzie albo niepoprawnym wyniku konczymy; PIN nigdy nie jest ponawiany.
        // pin == null: bez ustawiania PIN-u (klucz programowy, tylko do testow).
        public static List<byte[]> Run(X509Certificate2 cert, byte[] pin, IList<byte[]> hashes, Action<int, int> progress)
        {
            List<byte[]> signatures = new List<byte[]>();
            int current = 0;
            try
            {
                using (RSA pub = cert.GetRSAPublicKey())
                {
                    if (pub == null) throw new SigningException(SigningFailure.UnsupportedKey, 0, "brak klucza publicznego RSA");
                    for (int i = 0; i < hashes.Count; i++)
                    {
                        current = i;
                        if (progress != null) progress(i, hashes.Count);
                        byte[] sig = SignOne(cert, pin, hashes[i]);
                        bool valid = pub.VerifyHash(hashes[i], sig, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                        if (!valid) throw new SigningException(SigningFailure.InvalidResult, i, "podpis nie przechodzi weryfikacji kluczem publicznym");
                        signatures.Add(sig);
                    }
                }
            }
            catch (SigningException) { throw; }
            catch (CryptographicException ex)
            {
                throw Classify(ex, current);
            }
            catch (Exception ex)
            {
                throw new SigningException(SigningFailure.Other, current, ex.GetType().Name + ": " + ex.Message);
            }
            return signatures;
        }

        private static byte[] SignOne(X509Certificate2 cert, byte[] pin, byte[] hash)
        {
            using (RSA rsa = cert.GetRSAPrivateKey())
            {
                if (rsa == null) throw new SigningException(SigningFailure.NoCard, 0, "brak klucza prywatnego");
                if (pin != null)
                {
                    RSACng cng = rsa as RSACng;
                    if (cng == null) throw new SigningException(SigningFailure.UnsupportedKey, 0, "klucz nie jest typu CNG: " + rsa.GetType().Name);
                    CngKey key = cng.Key;
                    key.SetProperty(new CngProperty("SmartCardPin", pin, CngPropertyOptions.None));
                    byte[] result = rsa.SignHash(hash, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                    key.Dispose();
                    return result;
                }
                return rsa.SignHash(hash, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            }
        }

        public static SigningException Classify(Exception ex, int index)
        {
            uint code = unchecked((uint)ex.HResult);
            string tech = "0x" + code.ToString("X8");
            switch (code)
            {
                case 0x8010006B:   // SCARD_W_WRONG_CHV
                case 0x80070056:   // ERROR_INVALID_PASSWORD
                    return new SigningException(SigningFailure.WrongPin, index, tech);
                case 0x8010006C:   // SCARD_W_CHV_BLOCKED
                    return new SigningException(SigningFailure.PinBlocked, index, tech);
                case 0x8010000C:   // SCARD_E_NO_SMARTCARD
                case 0x80100069:   // SCARD_W_REMOVED_CARD
                case 0x8010002E:   // SCARD_E_NO_READERS_AVAILABLE
                case 0x80100017:   // SCARD_E_READER_UNAVAILABLE
                case 0x80100066:   // SCARD_W_UNRESPONSIVE_CARD
                case 0x8009000D:   // NTE_NO_KEY
                case 0x80090016:   // NTE_BAD_KEYSET
                    return new SigningException(SigningFailure.NoCard, index, tech);
                case 0x80090036:   // NTE_USER_CANCELLED
                    return new SigningException(SigningFailure.Cancelled, index, tech);
                default:
                    return new SigningException(SigningFailure.Other, index, tech + " " + ex.Message);
            }
        }
    }
}
