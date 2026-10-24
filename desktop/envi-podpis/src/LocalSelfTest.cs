#if DEBUG
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class LocalSelfTest
    {
        private static X509Certificate2 Identity()
        {
            using (RSA key = RSA.Create(2048))
            {
                CertificateRequest request = new CertificateRequest("CN=Jan Testowy D2, O=ENVI TEST", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.NonRepudiation, true));
                return request.CreateSelfSigned(DateTimeOffset.Now.AddDays(-1), DateTimeOffset.Now.AddDays(2));
            }
        }

        internal static void Run(string[] args, Action<bool, string> check)
        {
            string package = args[3], fixtures = args[4];
            if (args[2] == "localui")
            {
                LocalForm form = new LocalForm(package);
                form.ClientSize = new System.Drawing.Size(780, 560);
                form.UseTestCertificate(Identity());
                form.Shown += async delegate { await form.AddFiles(new string[] { Path.Combine(fixtures, "letter.pdf"), Path.Combine(fixtures, "dense.pdf"), Path.Combine(fixtures, "rotation.pdf"), Path.Combine(fixtures, "damaged.pdf"), Path.Combine(fixtures, "multi.pdf") }); };
                Application.Run(form);
                check(true, "localui: zamknieto okno testowe bez karty");
                return;
            }
            Task.Run(async delegate { await Core(package, fixtures, check); }).GetAwaiter().GetResult();
        }

        private static async Task Core(string package, string fixtures, Action<bool, string> check)
        {
            string output = Path.Combine(fixtures, "csharp-output-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(output);
            using (X509Certificate2 cert = Identity())
            {
                List<string> chain = new List<string> { Convert.ToBase64String(cert.RawData) };
                foreach (string name in new string[] { "letter", "form", "dense", "scan", "multi", "rotation", "crop", "nonstandard", "prior" })
                {
                    using (LocalDocument doc = LocalDocument.Load(Path.Combine(fixtures, name + ".pdf")))
                    {
                        using (PdfWorker metadata = await PdfWorker.Start(package, CancellationToken.None))
                            doc.Info = await metadata.Request(new { op = "inspect", pdf = Convert.ToBase64String(doc.Original) }, CancellationToken.None);
                        check(Json.GetList(doc.Info, "pages").Count > 0, name + ": odczyt stron");
                        if (name == "rotation" || name == "crop")
                        {
                            check(Json.GetString(Json.GetList(doc.Info, "pages")[0], "placeable") == "False", name + ": jawnie nieobslugiwana geometria grafiki");
                            bool blocked = false;
                            try { await doc.Prepare(package, cert, chain, CancellationToken.None); }
                            catch (PdfWorkerException ex) { blocked = ex.Code == "PLACEMENT_BLOCKED"; }
                            check(blocked, name + ": brak cichej grafiki w zlym miejscu");
                            doc.Graphic = false;
                        }
                        if (name == "dense" || name == "scan")
                        {
                            bool blocked = false;
                            try { await doc.Prepare(package, cert, chain, CancellationToken.None); }
                            catch (PdfWorkerException ex) { blocked = ex.Code == "PLACEMENT_BLOCKED"; }
                            check(blocked, name + ": automatyka wymaga recznego wyboru");
                            doc.Placement = new { page = 1, rect = new { x = 50, y = 100, width = 166.6, height = 50.52 } };
                        }
                        if (name == "prior") doc.Graphic = false;
                        await doc.Prepare(package, cert, chain, CancellationToken.None);
                        object preview = await doc.Worker.Request(new { op = "render", page = 1 }, CancellationToken.None);
                        byte[] png = Convert.FromBase64String(Json.GetString(preview, "png"));
                        check(png.Length > 100, name + ": podglad przygotowanych bajtow");
                        File.WriteAllBytes(Path.Combine(output, name + ".png"), png);
                        File.WriteAllBytes(Path.Combine(output, name + ".prepared.pdf"), Convert.FromBase64String(Json.GetString(doc.Prepared, "pdf")));
                        doc.Confirmed = true;
                        await doc.SignAndSave(cert, null, output, CancellationToken.None);
                        check(doc.Output != null && File.Exists(doc.Output), name + ": zapisano kopie kluczem programowym");
                        check(LocalDocument.Hash(File.ReadAllBytes(doc.Source)) == doc.Digest, name + ": oryginal bez zmian");
                        if (name == "prior") check(doc.ValidatedCopy.Take(doc.Original.Length).SequenceEqual(doc.Original), "prior: zachowano poprzednia rewizje bajt w bajt");
                        bool repeated = false;
                        try { await doc.SignAndSave(cert, null, output, CancellationToken.None); }
                        catch (InvalidOperationException) { repeated = true; }
                        check(repeated, name + ": zakaz ponownego automatycznego podpisu");
                    }
                }
                using (LocalDocument doc = LocalDocument.Load(Path.Combine(fixtures, "letter.pdf")))
                {
                    await doc.Prepare(package, cert, chain, CancellationToken.None);
                    bool unconfirmed = false;
                    try { await doc.SignAndSave(cert, null, output, CancellationToken.None); }
                    catch (InvalidOperationException) { unconfirmed = true; }
                    check(unconfirmed && !doc.SignAttempted, "brak zatwierdzenia blokuje podpis");
                    doc.Confirmed = true;
                    using (CancellationTokenSource cancel = new CancellationTokenSource())
                    {
                        cancel.Cancel(); bool cancelled = false;
                        try { await doc.SignAndSave(cert, null, output, cancel.Token); }
                        catch (OperationCanceledException) { cancelled = true; }
                        check(cancelled && !doc.SignAttempted, "anulowanie przed karta bez podpisu");
                    }
                    using (X509Certificate2 other = Identity())
                    {
                        bool mismatch = false;
                        try { await doc.SignAndSave(other, null, output, CancellationToken.None); }
                        catch (InvalidOperationException) { mismatch = true; }
                        check(mismatch && !doc.SignAttempted, "inny certyfikat nie omija podgladu");
                    }
                    string changed = Path.Combine(output, "changed.pdf"); File.WriteAllBytes(changed, doc.Original); doc.Source = changed;
                    byte[] changedBytes = (byte[])doc.Original.Clone(); changedBytes[changedBytes.Length - 1] ^= 1;
                    File.WriteAllBytes(changed, changedBytes); bool rejected = false;
                    try { await doc.SignAndSave(cert, null, output, CancellationToken.None); }
                    catch (IOException) { rejected = true; }
                    check(rejected && !doc.SignAttempted, "zmiana zrodla blokuje podpis");
                }
                using (LocalDocument doc = LocalDocument.Load(Path.Combine(fixtures, "letter.pdf")))
                {
                    await doc.Prepare(package, cert, chain, CancellationToken.None); doc.Confirmed = true;
                    bool saveFailed = false;
                    try { await doc.SignAndSave(cert, null, Path.Combine(output, "missing-directory"), CancellationToken.None); }
                    catch (IOException) { saveFailed = true; }
                    check(saveFailed && doc.SignAttempted && doc.ValidatedCopy != null, "blad zapisu zachowuje zweryfikowane bajty bez ponownego podpisu");
                    string recovered = LocalDocument.SaveCopy(output, "recovered", doc.ValidatedCopy);
                    check(File.Exists(recovered), "ponowny zapis gotowej kopii bez uzycia klucza");
                }
            }
            byte[] original = new byte[] { 1, 2, 3 };
            string first = LocalDocument.SaveCopy(output, "collision", original);
            string second = LocalDocument.SaveCopy(output, "collision", new byte[] { 4, 5 });
            check(first != second && File.ReadAllBytes(first).SequenceEqual(original), "kolizja nazwy nie nadpisuje kopii");
            bool traversal = false;
            try { LocalDocument.SaveCopy(output, "../escape", original); } catch (IOException) { traversal = true; }
            check(traversal, "nazwa ze sciezka odrzucona");
            check(Directory.GetFiles(output, "*.tmp").Length == 0, "brak tymczasowych kopii po zapisie");
            bool missing = false;
            try { using (PdfWorker worker = await PdfWorker.Start(output, CancellationToken.None)) { } }
            catch (IOException) { missing = true; }
            check(missing, "brak paczki PDF daje jawny blad");
            string fake = Path.Combine(output, "fake-worker"); Directory.CreateDirectory(fake);
            File.Copy(Path.Combine(package, "node.exe"), Path.Combine(fake, "node.exe"));
            File.WriteAllText(Path.Combine(fake, "manifest.json"), "{}");
            File.WriteAllText(Path.Combine(fake, "worker.cjs"), "console.log(JSON.stringify({ready:true,protocol:1}));process.stdin.on('data',()=>console.log('not-json'));");
            bool malformed = false;
            using (PdfWorker worker = await PdfWorker.Start(fake, CancellationToken.None))
            {
                try { await worker.Request(new { op = "inspect" }, CancellationToken.None); }
                catch (ArgumentException) { malformed = true; }
            }
            check(malformed, "bledna odpowiedz JSON konczy proces bez podpisu");
            File.WriteAllText(Path.Combine(fake, "worker.cjs"), "console.log(JSON.stringify({ready:true,protocol:1}));process.stdin.resume();");
            using (PdfWorker worker = await PdfWorker.Start(fake, CancellationToken.None))
            using (CancellationTokenSource cancellation = new CancellationTokenSource())
            {
                cancellation.CancelAfter(100); bool cancelled = false;
                try { await worker.Request(new { op = "inspect" }, cancellation.Token); }
                catch (OperationCanceledException) { cancelled = true; }
                check(cancelled, "anulowanie oczekiwania na proces PDF");
            }
            check(true, "DOWODY: " + output);
        }
    }
}
#endif
