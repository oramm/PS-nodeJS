using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace EnviPodpis
{
    internal sealed class PdfWorkerException : Exception
    {
        public readonly string Code;
        public PdfWorkerException(string code, string message) : base(message) { Code = code; }
    }

    internal sealed class PdfWorker : IDisposable
    {
        private Process process;
        private const int MaxMessage = 48 * 1024 * 1024;

        public static async Task<PdfWorker> Start(string directory, CancellationToken cancel)
        {
            PdfWorker worker = new PdfWorker();
            try
            {
                string root = Path.GetFullPath(directory);
                if (!File.Exists(Path.Combine(root, "manifest.json")))
                    throw new IOException("Brakuje paczki PDF. Uruchom ponownie instalator ENVI Podpis, aby naprawić program.");
                ProcessStartInfo info = new ProcessStartInfo(Path.Combine(root, "node.exe"), "\"" + Path.Combine(root, "worker.cjs") + "\"");
                info.WorkingDirectory = root;
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.RedirectStandardInput = info.RedirectStandardOutput = info.RedirectStandardError = true;
                info.StandardOutputEncoding = Encoding.UTF8;
                info.StandardErrorEncoding = Encoding.UTF8;
                info.EnvironmentVariables.Remove("NODE_OPTIONS");
                info.EnvironmentVariables.Remove("NODE_PATH");
                worker.process = new Process();
                worker.process.StartInfo = info;
                // Drain diagnostics without retaining document content or putting it into logs.
                worker.process.ErrorDataReceived += delegate { };
                worker.process.Start();
                worker.process.BeginErrorReadLine();
                object ready = await worker.Receive(cancel);
                if (Json.GetString(ready, "ready") != "True" || Json.GetInt(ready, "protocol", 0) != 1)
                    throw new IOException("Paczka PDF jest niekompletna lub niezgodna. Uruchom ponownie instalator ENVI Podpis.");
                return worker;
            }
            catch { worker.Dispose(); throw; }
        }

        public async Task<object> Request(object request, CancellationToken cancel)
        {
            try
            {
                cancel.ThrowIfCancellationRequested();
                string line = Json.Serialize(request);
                if (line.Length > MaxMessage) throw new IOException("Polecenie PDF przekracza limit rozmiaru.");
                Task write = process.StandardInput.WriteLineAsync(line);
                await Bounded(write, cancel);
                object response = await Receive(cancel);
                string ok = Json.GetString(response, "ok");
                if (ok == "False") throw new PdfWorkerException(Json.GetString(response, "code"), Friendly(Json.GetString(response, "code")));
                if (ok != "True" || Json.AsObject(response) == null || !Json.AsObject(response).ContainsKey("result"))
                    throw new IOException("Nieprawidłowa odpowiedź silnika PDF. Przygotuj podgląd ponownie.");
                return Json.AsObject(response)["result"];
            }
            catch (PdfWorkerException) { throw; }
            catch { Dispose(); throw; }
        }

        private static string Friendly(string code)
        {
            switch (code)
            {
                case "PLACEMENT_BLOCKED": return "Brak bezpiecznego miejsca grafiki. Wskaż miejsce na zwykłej stronie albo wyłącz grafikę.";
                case "ENCRYPTED_PDF": return "PDF jest zaszyfrowany. Dodaj niezabezpieczoną kopię dokumentu.";
                case "SIGNATURE_WIDGET_OVERLAP": return "Grafika nachodzi na pole formularza lub podpis. Wskaż inne miejsce.";
                case "PDF_LOCKED": return "Dokument blokuje dodawanie podpisów. Uzyskaj kopię dopuszczającą kolejny podpis.";
                case "INVALID_SIGNATURE": return "Kontrola kryptograficzna nie powiodła się. Kopii nie zapisano.";
                default: return "Nie można przetworzyć PDF (" + code + "). Sprawdź plik i przygotuj podgląd ponownie.";
            }
        }

        private async Task<object> Receive(CancellationToken cancel)
        {
            Task<object> read = ReadMessage();
            await Bounded(read, cancel);
            return await read;
        }

        private static async Task Bounded(Task task, CancellationToken cancel)
        {
            using (CancellationTokenSource deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel))
            {
                Task delay = Task.Delay(90000, deadline.Token);
                if (await Task.WhenAny(task, delay) != task)
                {
                    cancel.ThrowIfCancellationRequested();
                    throw new IOException("Silnik PDF nie odpowiada przez 90 sekund. Przygotuj podgląd ponownie.");
                }
                deadline.Cancel();
                await task;
            }
        }

        private async Task<object> ReadMessage()
        {
            StringBuilder line = new StringBuilder();
            char[] buffer = new char[8192];
            while (true)
            {
                int count = await process.StandardOutput.ReadAsync(buffer, 0, buffer.Length);
                if (count == 0) throw new IOException("Silnik PDF zakończył pracę. Przygotuj podgląd ponownie.");
                int end = Array.IndexOf(buffer, '\n', 0, count);
                if (end >= 0 && end != count - 1) throw new IOException("Nadmiarowa odpowiedź silnika PDF.");
                line.Append(buffer, 0, end >= 0 ? end : count);
                if (line.Length > MaxMessage) throw new IOException("Odpowiedź silnika PDF przekracza limit rozmiaru.");
                if (end >= 0)
                {
                    object result = Json.Parse(line.ToString());
                    if (Json.AsObject(result) == null) throw new IOException("Nieprawidłowa odpowiedź silnika PDF.");
                    return result;
                }
            }
        }

        public void Dispose()
        {
            Process child = process;
            process = null;
            if (child == null) return;
            try { if (!child.HasExited) child.Kill(); child.WaitForExit(5000); }
            catch (InvalidOperationException) { }
            finally { child.Dispose(); }
        }
    }
}
