using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading.Tasks;

namespace EnviPodpis
{
    internal sealed class MailException : IOException
    {
        internal readonly string Code;
        internal MailException(string code) : base(MailClient.Friendly(code)) { Code = code; }
    }
    internal sealed class MailMessageContext
    {
        public string Subject;
        public string MessageId;
        public string[] To;
        public string[] Cc;
        public string AccountEmail;
        public string Provider;
        public string OutlookEntryId;
        public string OutlookStoreId;
        public string ImapHost;
        public string ImapUidValidity;
        public string ImapUid;
        public static MailMessageContext FromJson(object value)
        {
            return new MailMessageContext { Subject = Json.GetString(value, "Subject"), MessageId = Json.GetString(value, "MessageId"),
                To = Json.GetList(value, "To").Select(Convert.ToString).ToArray(), Cc = Json.GetList(value, "Cc").Select(Convert.ToString).ToArray(),
                AccountEmail = Json.GetString(value, "AccountEmail"), Provider = Json.GetString(value, "Provider"), OutlookEntryId = Json.GetString(value, "OutlookEntryId"), OutlookStoreId = Json.GetString(value, "OutlookStoreId"),
                ImapHost = Json.GetString(value, "ImapHost"), ImapUidValidity = Json.GetString(value, "ImapUidValidity"), ImapUid = Json.GetString(value, "ImapUid") };
        }
    }
    internal sealed class MailAttachmentDocument
    {
        public string Path;
        public string Name;
        public MailMessageContext Context;
    }
    internal sealed class MailClient
    {
#if DEBUG
        internal static string DataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"ENVI\PodpisData\Mail");
#else
        internal static readonly string DataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"ENVI\PodpisData\Mail");
#endif
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("ENVI Podpis Mail v1");
        private readonly string workerDirectory;
        internal MailClient(string workerDirectory) { this.workerDirectory = Path.GetFullPath(workerDirectory); }
        internal static bool Configured { get { return File.Exists(Path.Combine(DataDirectory, "account.dpapi")); } }

        internal static void PrivateDirectory(string directory)
        {
            DirectoryInfo folder = Directory.CreateDirectory(directory);
            if ((folder.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Katalog poczty nie może być dowiązaniem.");
            DirectorySecurity acl = new DirectorySecurity(); acl.SetAccessRuleProtection(true, false);
            acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User, FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            folder.SetAccessControl(acl);
        }
        internal static object ReadAccount()
        {
            byte[] clear = null;
            try
            {
                string path = Path.Combine(DataDirectory, "account.dpapi");
                if (new FileInfo(path).Length > 65536 || (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException();
                clear = ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.CurrentUser);
                return Json.Parse(Encoding.UTF8.GetString(clear));
            }
            catch { throw new IOException("Nie można odczytać konta pocztowego. Uzupełnij konto w Ustawieniach poczty."); }
            finally { if (clear != null) Array.Clear(clear, 0, clear.Length); }
        }
        internal static void SaveAccount(object account)
        {
            PrivateDirectory(DataDirectory); byte[] clear = Encoding.UTF8.GetBytes(Json.Serialize(account));
            string temporary = Path.Combine(DataDirectory, Guid.NewGuid().ToString("N") + ".tmp");
            try
            {
                byte[] encrypted = ProtectedData.Protect(clear, Entropy, DataProtectionScope.CurrentUser);
                using (FileStream file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { file.Write(encrypted, 0, encrypted.Length); file.Flush(true); }
                string path = Path.Combine(DataDirectory, "account.dpapi");
                if (File.Exists(path)) File.Replace(temporary, path, null); else File.Move(temporary, path);
            }
            finally { Array.Clear(clear, 0, clear.Length); if (File.Exists(temporary)) File.Delete(temporary); }
        }
        internal static string NewWorkDirectory()
        {
            PrivateDirectory(DataDirectory);
            string directory = Path.Combine(DataDirectory, "Documents", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N"));
            PrivateDirectory(directory); return directory;
        }
        internal static string SafeName(string name)
        {
            string safe = new string((name ?? "dokument").Select(c => Path.GetInvalidFileNameChars().Contains(c) || c < 32 ? '_' : c).ToArray()).Trim(' ', '.');
            if (safe.Length > 140) safe = safe.Substring(0, 140);
            if (safe.Length == 0) safe = "dokument";
            // Prefix also prevents Windows device names such as CON and COM1.
            return "pismo-" + safe + (safe.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? "" : ".pdf");
        }

        internal static string Friendly(string code)
        {
            switch (code)
            {
                case "ACCOUNT": return "Uzupełnij adres konta, hasło oraz serwery IMAP i SMTP w Ustawieniach poczty.";
                case "RECIPIENTS": return "Sprawdź adresy odbiorców (oddzielone średnikami), temat i treść odpowiedzi.";
                case "ATTACHMENTS": return "Wybierz poprawne załączniki PDF; łączny rozmiar odpowiedzi może wynosić do 32 MiB.";
                case "TOO_LARGE": return "Załącznik lub odpowiedź przekracza limit 32 MiB. Wybierz mniej dokumentów.";
                case "MESSAGE_CHANGED": return "Wiadomość lub załącznik zmieniły się na serwerze. Wyszukaj wiadomość ponownie.";
                case "SEND_UNKNOWN": return "Serwer nie potwierdził wysłania do wszystkich odbiorców. Nie wysyłaj ponownie bez sprawdzenia poczty. Podpisane pliki i szkic pozostają na dysku.";
                case "SEND_NOT_STARTED": return "Serwer odrzucił połączenie lub logowanie przed wysyłką. Popraw konto w Ustawieniach poczty i ponów wysłanie — podpisy są zachowane.";
                default: return "Nie połączono z pocztą. Sprawdź internet, konto, hasło i serwery w Ustawieniach poczty. IMAP wymaga TLS (993), SMTP TLS (465 lub 587).";
            }
        }

        private void VerifyWorker()
        {
            string root = workerDirectory.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if ((File.GetAttributes(workerDirectory) & FileAttributes.ReparsePoint) != 0) throw new IOException("Nieprawidłowy katalog silnika poczty.");
            object manifest = Json.Parse(File.ReadAllText(Path.Combine(root, "manifest.json")));
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (Json.GetInt(manifest, "protocol", 0) != 1) throw new IOException("Niezgodny silnik poczty. Napraw instalację ENVI Podpis.");
            foreach (object entry in Json.GetList(manifest, "files"))
            {
                string relative = Json.GetString(entry, "path");
                if (string.IsNullOrEmpty(relative) || Path.IsPathRooted(relative) || relative.Contains(":")) throw new IOException("Nieprawidłowa paczka poczty.");
                string file = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
                if (!file.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !seen.Add(file)) throw new IOException("Nieprawidłowa paczka poczty.");
                string walk = file;
                while (walk.Length >= root.Length) { if ((File.GetAttributes(walk) & FileAttributes.ReparsePoint) != 0) throw new IOException("Dowiązanie w paczce poczty."); walk = Path.GetDirectoryName(walk); }
                using (SHA256 sha = SHA256.Create())
                using (Stream stream = File.OpenRead(file))
                    if (!string.Equals(BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", ""), Json.GetString(entry, "sha256"), StringComparison.OrdinalIgnoreCase)) throw new IOException("Uszkodzony silnik poczty. Napraw instalację ENVI Podpis.");
            }
            if (!seen.Contains(Path.Combine(root, "node.exe")) || !seen.Contains(Path.Combine(root, "mail-worker.cjs"))) throw new IOException("Brakuje silnika poczty. Zbuduj lub napraw paczkę ENVI Podpis.");
            foreach (string file in Directory.GetFiles(root, "*", SearchOption.AllDirectories))
                if (!file.Equals(Path.Combine(root, "manifest.json"), StringComparison.OrdinalIgnoreCase) && !seen.Contains(file)) throw new IOException("Nieoczekiwane pliki w silniku poczty. Napraw instalację ENVI Podpis.");
        }

        internal static string AccountIdentity(object account)
        {
            string identity = (Json.GetString(account, "email") ?? "").Trim().ToLowerInvariant() + "\n" + (Json.GetString(account, "imapHost") ?? "").Trim().ToLowerInvariant();
            using (SHA256 sha = SHA256.Create()) return Convert.ToBase64String(sha.ComputeHash(Encoding.UTF8.GetBytes(identity)));
        }
        internal async Task<object> Request(IDictionary<string, object> request, string expectedAccountIdentity = null)
        {
            await Task.Run((Action)VerifyWorker);
            object account = ReadAccount();
            if (expectedAccountIdentity != null && AccountIdentity(account) != expectedAccountIdentity) throw new IOException("Konto pocztowe zmieniło się. Wyszukaj wiadomość ponownie w bieżącym koncie.");
            request["account"] = account;
            ProcessStartInfo start = new ProcessStartInfo(Path.Combine(workerDirectory, "node.exe"), "\"" + Path.Combine(workerDirectory, "mail-worker.cjs") + "\"") {
                WorkingDirectory = workerDirectory, UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8 };
            start.EnvironmentVariables.Remove("NODE_OPTIONS"); start.EnvironmentVariables.Remove("NODE_PATH");
            using (Process process = new Process { StartInfo = start })
            {
                process.ErrorDataReceived += delegate { }; process.Start(); process.BeginErrorReadLine();
                try
                {
                    Task<string> receive = ReadBounded(process.StandardOutput);
                    Task exchange = Task.Run(async delegate { await process.StandardInput.WriteAsync(Json.Serialize(request)); process.StandardInput.Close(); });
                    Task complete = Task.WhenAll(exchange, receive);
                    if (await Task.WhenAny(complete, Task.Delay(90000)) != complete) throw new IOException(request.ContainsKey("op") && Convert.ToString(request["op"]) == "send" ? Friendly("SEND_UNKNOWN") : "Poczta nie odpowiedziała w ciągu 90 sekund. Spróbuj ponownie.");
                    await complete;
                    object response = Json.Parse(await receive);
                    if (Json.GetString(response, "ok") != "True") throw new MailException(Json.GetString(response, "code"));
                    return Json.AsObject(response)["result"];
                }
                finally { if (!process.HasExited) process.Kill(); process.WaitForExit(5000); request.Remove("account"); }
            }
        }
        private static async Task<string> ReadBounded(StreamReader reader)
        {
            StringBuilder value = new StringBuilder(); char[] block = new char[8192]; int count;
            while ((count = await reader.ReadAsync(block, 0, block.Length)) != 0) { value.Append(block, 0, count); if (value.Length > 90 * 1024 * 1024) throw new IOException("Odpowiedź poczty przekracza limit rozmiaru."); }
            return value.ToString();
        }
    }
}
