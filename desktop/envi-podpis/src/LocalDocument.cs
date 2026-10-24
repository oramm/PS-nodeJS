using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Threading;
using System.Threading.Tasks;

namespace EnviPodpis
{
    internal sealed class LocalDocument : IDisposable
    {
        public string Source;
        public string TargetDirectory;
        public string Origin = "local";
        public object SourceContext;
        public object UploadContext;
        public string RecoveryPath;
        public byte[] Original;
        public string Digest;
        public bool Graphic = true;
        public object Placement = "lastPageCorner";
        public object Info;
        public object Prepared;
        public PdfWorker Worker;
        public string Certificate;
        public bool Confirmed;
        public bool SignAttempted;
        public byte[] ValidatedCopy;
        public string Output;
        public string Error;
        public string Status = "Oczekuje";

        public static LocalDocument Load(string path)
        {
            if (!string.Equals(Path.GetExtension(path), ".pdf", StringComparison.OrdinalIgnoreCase))
                throw new IOException("Dodaj plik PDF; inne formaty nie są obsługiwane.");
            LocalDocument doc = new LocalDocument();
            doc.Source = Path.GetFullPath(path);
            using (FileStream file = File.Open(doc.Source, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                if (file.Length < 5 || file.Length > 32 * 1024 * 1024) throw new IOException("PDF musi mieć od 5 bajtów do 32 MiB.");
                doc.Original = new byte[(int)file.Length];
                int at = 0;
                while (at < doc.Original.Length)
                {
                    int n = file.Read(doc.Original, at, doc.Original.Length - at);
                    if (n == 0) throw new IOException("Nie można odczytać całego pliku PDF.");
                    at += n;
                }
            }
            doc.Digest = Hash(doc.Original);
            return doc;
        }

        public static string Hash(byte[] bytes)
        {
            using (SHA256 hash = SHA256.Create()) return Convert.ToBase64String(hash.ComputeHash(bytes));
        }

        // The read handle denies writes/deletion through the card operation and copy save.
        public FileStream LockUnchangedSource()
        {
            FileStream file = File.Open(Source, FileMode.Open, FileAccess.Read, FileShare.Read);
            try
            {
                if (file.Length != Original.Length) throw new IOException("Oryginał zmienił się od podglądu. Usuń go z listy i dodaj ponownie.");
                using (SHA256 hash = SHA256.Create())
                    if (Convert.ToBase64String(hash.ComputeHash(file)) != Digest)
                        throw new IOException("Oryginał zmienił się od podglądu. Usuń go z listy i dodaj ponownie.");
                return file;
            }
            catch { file.Dispose(); throw; }
        }

        public async Task Prepare(string package, X509Certificate2 cert, IList<string> chain, CancellationToken cancel)
        {
            if (SignAttempted) throw new InvalidOperationException("Tego pliku nie podpisujemy ponownie automatycznie.");
            ResetPreview();
            using (LockUnchangedSource()) { }
            Worker = await PdfWorker.Start(package, cancel);
            try
            {
                Prepared = await Worker.Request(new { op = "prepare", pdf = Convert.ToBase64String(Original), chain = chain,
                    placement = Graphic ? Placement : "none" }, cancel);
                byte[] hash = Convert.FromBase64String(Json.GetString(Prepared, "hash"));
                if (hash.Length != 32 || Json.GetInt(Prepared, "pages", 0) < 1) throw new IOException("Nieprawidłowy wynik przygotowania PDF.");
                Certificate = cert.Thumbprint;
                Status = "Zatwierdź podgląd";
            }
            catch { ResetPreview(); throw; }
        }

        public async Task SignAndSave(X509Certificate2 cert, byte[] pin, string directory, CancellationToken cancel)
        {
            cancel.ThrowIfCancellationRequested();
            if (!Confirmed || Worker == null || Certificate != cert.Thumbprint || SignAttempted)
                throw new InvalidOperationException("Najpierw zatwierdź aktualny podgląd z wybranym certyfikatem.");
            if (cert.NotAfter <= DateTime.Now || cert.NotBefore >= DateTime.Now)
                throw new InvalidOperationException("Certyfikat nie jest ważny. Wybierz ważny certyfikat i przygotuj podgląd ponownie.");
            using (LockUnchangedSource())
            {
                Status = "Podpisywanie";
                SignAttempted = true;
                byte[] hash = Convert.FromBase64String(Json.GetString(Prepared, "hash"));
                List<byte[]> signatures = await Task.Run(delegate { return SignatureBatch.Run(cert, pin, new byte[][] { hash }, null); });
                // Once the card signed, complete verification/save even if cancellation arrived meanwhile.
                object result = await Worker.Request(new { op = "finalize", signature = Convert.ToBase64String(signatures[0]) }, CancellationToken.None);
                object validation = Json.AsObject(result)["validation"];
                if (Json.GetString(validation, "valid") != "True") throw new IOException("Podpis nie przeszedł kontroli kryptograficznej.");
                ValidatedCopy = Convert.FromBase64String(Json.GetString(result, "pdf"));
                TargetDirectory = directory;
                WorkflowStore.Retain(this);
                Output = SaveCopy(directory, Path.GetFileNameWithoutExtension(Source), ValidatedCopy);
                WorkflowStore.Retain(this);
                Status = "Zapisano";
                Dispose();
            }
        }

        public static string SaveCopy(string directory, string basename, byte[] bytes)
        {
            directory = Path.GetFullPath(directory);
            if (!Directory.Exists(directory) || string.IsNullOrWhiteSpace(basename) || basename.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 ||
                basename.EndsWith(".") || basename.EndsWith(" ")) throw new IOException("Wybierz istniejący katalog i poprawną nazwę pliku.");
            string temporary = Path.Combine(directory, ".envi-podpis-" + Guid.NewGuid().ToString("N") + ".tmp");
            try
            {
                using (FileStream file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 8192, FileOptions.WriteThrough))
                {
                    file.Write(bytes, 0, bytes.Length);
                    file.Flush(true);
                }
                for (int n = 0; n < 10000; n++)
                {
                    string target = Path.Combine(directory, basename + "_pdp" + (n == 0 ? "" : "_" + n) + ".pdf");
                    try { File.Move(temporary, target); return target; }
                    catch (IOException) { if (!File.Exists(target)) throw; }
                }
                throw new IOException("Zbyt wiele kopii o tej nazwie. Wybierz inny katalog.");
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }

        public void ResetPreview()
        {
            Dispose(); Prepared = null; Confirmed = false; Certificate = null; Error = null;
            Status = "Oczekuje";
        }

        public void Dispose()
        {
            if (Worker != null) { Worker.Dispose(); Worker = null; }
        }
    }
}
