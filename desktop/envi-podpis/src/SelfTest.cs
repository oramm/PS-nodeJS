#if DEBUG
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace EnviPodpis
{
    // Tylko wersja testowa (/define:DEBUG). Uzycie:
    //   EnviPodpis.debug.exe /selftest <plik-wyniku> unit
    //   EnviPodpis.debug.exe /selftest <plik-wyniku> card <token>   (prawdziwy certyfikat, STOP przed PIN-em)
    //   EnviPodpis.debug.exe /selftest <plik-wyniku> soft <token>   (klucz programowy, caly przebieg z podpisem)
    //   EnviPodpis.debug.exe /selftest <plik-wyniku> ui <katalog>   (zrzuty okien)
    // Nigdy nie dotyka klucza na karcie i nie pyta o PIN.
    internal static class SelfTest
    {
        private static StreamWriter log;
        private static int failures;

        public static int Run(string[] args)
        {
            string outFile = args.Length > 1 ? args[1] : "selftest.txt";
            string mode = args.Length > 2 ? args[2] : "unit";
            string arg = args.Length > 3 ? args[3] : null;
            using (log = new StreamWriter(outFile, false, new UTF8Encoding(false)))
            {
                try
                {
                    if (mode == "unit") Unit();
                    else if (mode == "card") Card(arg);
                    else if (mode == "soft") Soft(arg);
                    else if (mode == "ui") Ui(arg);
                    else Check(false, "nieznany tryb " + mode);
                }
                catch (Exception ex)
                {
                    Check(false, "WYJATEK " + ex.GetType().Name + ": " + ex.Message + "\n" + ex.StackTrace);
                }
                log.WriteLine(failures == 0 ? "WYNIK: PASS" : "WYNIK: FAIL (" + failures + ")");
            }
            return failures == 0 ? 0 : 1;
        }

        private static void Check(bool ok, string what)
        {
            if (!ok) failures++;
            log.WriteLine((ok ? "PASS  " : "FAIL  ") + what);
            log.Flush();
        }

        private static void Info(string what)
        {
            log.WriteLine("      " + what);
            log.Flush();
        }

        // ---- testy bez sieci i bez karty ----
        private static void Unit()
        {
            string good = "AbCdEfGhIjKlMnOpQrSt_-12";
            Check(ApiClient.ParseJobToken("envi-podpis://job/" + good) == good, "link: poprawny token");
            Check(ApiClient.ParseJobToken("ENVI-PODPIS://JOB/" + good + "/") == good, "link: wielkosc liter i ukosnik na koncu");
            Check(ApiClient.ParseJobToken("envi-podpis:job/" + good) == good, "link: bez //");
            Check(ApiClient.ParseJobToken("envi-podpis://job/short") == null, "link: za krotki token odrzucony");
            Check(ApiClient.ParseJobToken("envi-podpis://job/" + new string('a', 129)) == null, "link: za dlugi token odrzucony");
            Check(ApiClient.ParseJobToken("envi-podpis://job/" + good + "?host=evil.com") == null, "link: parametry w tokenie odrzucone");
            Check(ApiClient.ParseJobToken("envi-podpis://evil.com/job/" + good) == null, "link: obcy host odrzucony");
            Check(ApiClient.ParseJobToken("envi-podpis://job/" + good + "/x") == null, "link: dodatkowa sciezka odrzucona");
            Check(ApiClient.ParseJobToken("https://job/" + good) == null, "link: inny schemat odrzucony");
            Check(ApiClient.ParseJobToken("envi-podpis://job/" + good.Substring(0, 20) + "../..") == null, "link: kropki w tokenie odrzucone");

            Check(Messages.Plural(1, "plik", "pliki", "plikow") == "plik", "liczba mnoga: 1");
            Check(Messages.Plural(2, "plik", "pliki", "plikow") == "pliki", "liczba mnoga: 2");
            Check(Messages.Plural(5, "plik", "pliki", "plikow") == "plikow", "liczba mnoga: 5");
            Check(Messages.Plural(12, "plik", "pliki", "plikow") == "plikow", "liczba mnoga: 12");
            Check(Messages.Plural(22, "plik", "pliki", "plikow") == "pliki", "liczba mnoga: 22");

            byte[] h = new byte[32];
            for (int i = 0; i < 32; i++) h[i] = (byte)(i + 0xA0);
            string hex = BitConverter.ToString(h).Replace("-", "").ToLowerInvariant();
            byte[] fromHex = ApiClient.ParseHash(hex);
            byte[] fromB64 = ApiClient.ParseHash(Convert.ToBase64String(h));
            Check(fromHex != null && Convert.ToBase64String(fromHex) == Convert.ToBase64String(h), "hash: hex");
            Check(fromB64 != null && Convert.ToBase64String(fromB64) == Convert.ToBase64String(h), "hash: base64");
            Check(ApiClient.ParseHash("zzzz") == null, "hash: smieci odrzucone");
            Check(ApiClient.FormatCheckCode(h) == "A0A1-A2A3", "kod kontrolny: " + ApiClient.FormatCheckCode(h));
            Check(ApiClient.NormalizeCode("a0a1-a2a3") == "A0A1A2A3", "kod kontrolny: normalizacja");

            Check(Messages.FromApi(MakeApi(404)).Title.StartsWith("Zlecenie wygas"), "blad 404 -> zlecenie wygaslo");
            Check(SignatureBatch.Classify(new CryptographicException(unchecked((int)0x8010006B)), 0).Kind == SigningFailure.WrongPin, "blad karty: zly PIN");
            Check(SignatureBatch.Classify(new CryptographicException(unchecked((int)0x80100069)), 0).Kind == SigningFailure.NoCard, "blad karty: brak karty");
            Check(SignatureBatch.Classify(new CryptographicException(unchecked((int)0x8010006C)), 0).Kind == SigningFailure.PinBlocked, "blad karty: PIN zablokowany");

            Check(Config.AllowedBaseUrls.Length == 2 && Config.AllowedBaseUrls[1] == "https://erp-envi.herokuapp.com", "lista dozwolonych adresow (debug)");
            Info("wersja: " + Config.VersionText);
        }

        private static ApiException MakeApi(int status)
        {
            ApiException e = new ApiException("x");
            e.Status = status;
            return e;
        }

        // ---- prawdziwy certyfikat z magazynu Windows, bez dotykania klucza ----
        private static void Card(string token)
        {
            int skipped;
            List<CertCandidate> certs = CertStore.FindQualified(out skipped);
            Info("certyfikaty kwalifikowane w magazynie: " + certs.Count + " (pominiete nie-RSA: " + skipped + ")");
            Check(certs.Count >= 1, "znaleziono certyfikat kwalifikowany");
            if (certs.Count == 0) return;
            string last = CertStore.LoadLastThumbprint();
            CertCandidate c = certs[0];
            foreach (CertCandidate x in certs) if (last != null && x.Thumbprint == last) c = x;
            Info("wybrany: " + c.Display);
            List<string> chain = CertStore.BuildChainBase64(c.Cert);
            Check(chain.Count >= 1 && chain[0] == Convert.ToBase64String(c.Cert.RawData), "lancuch: " + chain.Count + " elementow, pierwszy = certyfikat podpisujacy");
            Flow(token, c.Cert, chain, false);
        }

        // ---- klucz programowy: caly przebieg poza kartą ----
        private static void Soft(string token)
        {
            X509Certificate2 cert = MakeSoftCert();
            List<string> chain = new List<string>();
            chain.Add(Convert.ToBase64String(cert.RawData));
            Flow(token, cert, chain, true);
        }

        private static X509Certificate2 MakeSoftCert()
        {
            RSA key = RSA.Create(2048);
            CertificateRequest req = new CertificateRequest("CN=Jan Testowy, O=ENVI TEST", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            req.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.NonRepudiation, true));
            return req.CreateSelfSigned(DateTimeOffset.Now.AddDays(-1), DateTimeOffset.Now.AddYears(1));
        }

        private static void Flow(string token, X509Certificate2 cert, List<string> chain, bool sign)
        {
            Check(ApiClient.IsValidToken(token), "token ma poprawny format");
            ApiClient api = new ApiClient(Config.AllowedBaseUrls[0]);
            Info("adres PS: " + api.BaseUrl);
            JobInfo job = api.GetJob(token);
            Info("GET job: status=" + job.Status + " plikow=" + job.FileNames.Count + " min=" + job.MinProgramVersion + " wygasa=" + job.ExpiresAt);
            foreach (string n in job.FileNames) Info("  plik: " + n);
            Check(job.FileNames.Count > 0, "zlecenie ma pliki");

            List<PreparedFile> files = api.SubmitCertificate(token, chain);
            Check(files.Count == job.FileNames.Count, "POST certificate: tyle samo plikow (" + files.Count + ")");
            bool codesOk = true;
            foreach (PreparedFile f in files)
            {
                Info("  " + f.Name + " | strony " + f.Pages + " | kod serwera " + f.ServerCheckCode + " | kod lokalny " + f.CheckCode);
                if (ApiClient.NormalizeCode(f.ServerCheckCode) != ApiClient.NormalizeCode(f.CheckCode)) codesOk = false;
            }
            Check(codesOk, "kody kontrolne: serwer = liczone lokalnie z hasha");

            if (!sign)
            {
                api.Cancel(token, "selftest_stop_before_pin");
                Check(true, "STOP przed PIN-em; wyslano anulowanie (klucz karty nie byl dotykany)");
                return;
            }

            List<byte[]> hashes = new List<byte[]>();
            foreach (PreparedFile f in files) hashes.Add(f.Hash);
            List<int> progress = new List<int>();
            List<byte[]> sigs = SignatureBatch.Run(cert, null, hashes, delegate (int i, int n) { progress.Add(i); });
            Check(sigs.Count == files.Count, "podpisano " + sigs.Count + " z " + files.Count + " (klucz programowy)");
            Check(progress.Count == files.Count, "postep zgloszony dla kazdego pliku");
            string status = api.SubmitSignatures(token, sigs);
            Info("POST signatures: status=" + status);
            Check(status == "done", "serwer przyjal podpisy (status done)");
        }

        // ---- zrzuty okna we wszystkich stanach ----
        private static void Ui(string dir)
        {
            Directory.CreateDirectory(dir);
            X509Certificate2 cert = MakeSoftCert();
            CertCandidate cc = new CertCandidate();
            cc.Cert = cert;
            cc.Thumbprint = cert.Thumbprint;
            cc.Display = "Jan Testowy  (wystawca: COPE SZAFIR - Kwalifikowany, ważny do 2027-05-01)";
            List<CertCandidate> certs = new List<CertCandidate>();
            certs.Add(cc);

            List<string> names = new List<string>();
            names.Add("Pismo_2026-10-09_zapytanie_o_termin.pdf");
            names.Add("zalacznik_1_harmonogram.pdf");
            names.Add("zalacznik_2_protokol_odbioru_czesciowego.pdf");

            List<PreparedFile> prepared = new List<PreparedFile>();
            byte[][] hs = new byte[3][];
            for (int i = 0; i < 3; i++)
            {
                hs[i] = new byte[32];
                new Random(i + 7).NextBytes(hs[i]);
                PreparedFile p = new PreparedFile();
                p.Name = names[i];
                p.Pages = i + 1;
                p.Hash = hs[i];
                p.CheckCode = ApiClient.FormatCheckCode(hs[i]);
                prepared.Add(p);
            }

            MainForm f = new MainForm();
            f.StartPosition = FormStartPosition.Manual;
            f.Location = new Point(40, 40);
            f.Show();
            Pump(400);

            Shot(f, Path.Combine(dir, "01-loading.png"), delegate { f.ShowLoading(); });
            Shot(f, Path.Combine(dir, "02-files.png"), delegate { f.ShowFiles(names, certs, null); });
            Shot(f, Path.Combine(dir, "03-preparing.png"), delegate { f.ShowPreparing(); });
            Shot(f, Path.Combine(dir, "04-pin.png"), delegate { f.ShowPin(prepared); });
            // PIN nie moze wyciekac przez dostepnosc (czytniki ekranu, automatyzacja): sprawdzamy wartosc testowa.
            TextBox pinBox = FindTextBox(f);
            pinBox.Text = "ZZtestZZ";
            string accName = pinBox.AccessibilityObject.Name;
            string accValue = null;
            try { accValue = pinBox.AccessibilityObject.Value; } catch (Exception) { }
            Check(accName == "PIN do karty", "dostepnosc: nazwa pola PIN = \"" + accName + "\" (nie zawiera wpisanego tekstu)");
            Check(accValue == null || accValue.IndexOf("ZZ") < 0, "dostepnosc: wartosc pola PIN nie ujawnia tekstu (" + (accValue ?? "null") + ")");
            pinBox.Clear();
            Shot(f, Path.Combine(dir, "05-signing.png"), delegate { f.ShowSigning(1, 3); });
            Shot(f, Path.Combine(dir, "06-sending.png"), delegate { f.ShowSending(); });
            Shot(f, Path.Combine(dir, "07-done.png"), delegate { f.ShowDone(); });
            Shot(f, Path.Combine(dir, "08-error-pin.png"), delegate
            {
                SigningException se = new SigningException(SigningFailure.WrongPin, 0, "0x8010006B");
                f.ShowError(Messages.FromSigning(se, 3));
            });
            Shot(f, Path.Combine(dir, "09-error-expired.png"), delegate { f.ShowError(Messages.FromApi(MakeApi(404))); });
            Shot(f, Path.Combine(dir, "10-no-card.png"), delegate { f.ShowError(Messages.NoCertificate(0)); });
            Shot(f, Path.Combine(dir, "11-installed.png"), delegate
            {
                f.ShowInfo("Zainstalowano", "Zainstalowano. Wróć do PS i kliknij „Podpisz”.\r\n\r\nProgram (wersja 1.0.0) będzie się uruchamiał sam, gdy klikniesz „Podpisz” w PS. Nie trzeba go otwierać ręcznie. Przy pierwszym podpisie przeglądarka zapyta, czy otworzyć ENVI Podpis: zaznacz „zawsze zezwalaj” i potwierdź.", "Zamknij", null);
            });
            Check(true, "zrzuty zapisane w " + dir);
            f.Dispose();
        }

        private static TextBox FindTextBox(Control c)
        {
            foreach (Control child in c.Controls)
            {
                TextBox t = child as TextBox;
                if (t != null) return t;
                TextBox inner = FindTextBox(child);
                if (inner != null) return inner;
            }
            return null;
        }

        private static void Shot(MainForm f, string path, Action show)
        {
            show();
            Pump(500);
            Rectangle b = f.Bounds;
            using (Bitmap bmp = new Bitmap(b.Width, b.Height))
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.CopyFromScreen(b.Location, Point.Empty, b.Size);
                bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png);
            }
        }

        private static void Pump(int ms)
        {
            DateTime end = DateTime.Now.AddMilliseconds(ms);
            while (DateTime.Now < end)
            {
                Application.DoEvents();
                Thread.Sleep(20);
            }
        }
    }
}
#endif
