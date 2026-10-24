using System;
using System.Collections.Generic;
using System.IO;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace EnviPodpis
{
    // Durable local recovery is independent of the selected destination or network.
    internal static class WorkflowStore
    {
        internal static string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"ENVI\PodpisData\Workflow");
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("ENVI Podpis workflow v1");
        internal static void Write(string path, object value)
        {
            DirectoryInfo dir = Directory.CreateDirectory(Path.GetDirectoryName(path));
            if ((dir.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Katalog odzyskiwania nie może być dowiązaniem.");
            DirectorySecurity acl = new DirectorySecurity(); acl.SetAccessRuleProtection(true, false);
            acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User, FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            dir.SetAccessControl(acl);
            byte[] clear = Encoding.UTF8.GetBytes(Json.Serialize(value));
            string temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                byte[] data = ProtectedData.Protect(clear, Entropy, DataProtectionScope.CurrentUser);
                using (FileStream file = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                { file.Write(data, 0, data.Length); file.Flush(true); }
                if (File.Exists(path)) File.Replace(temp, path, null); else File.Move(temp, path);
            }
            finally { Array.Clear(clear, 0, clear.Length); if (File.Exists(temp)) File.Delete(temp); }
        }
        internal static object Read(string path)
        {
            if (!File.Exists(path)) return new Dictionary<string, object>();
            if (new FileInfo(path).Length > 48L * 1024 * 1024 || (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Nieprawidłowy plik odzyskiwania.");
            byte[] clear = ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.CurrentUser);
            try { return Json.Parse(Encoding.UTF8.GetString(clear)); }
            finally { Array.Clear(clear, 0, clear.Length); }
        }
        internal static object Settings() { return Read(Path.Combine(Root, "preferences.dpapi")); }
        internal static void Setting(string key, string value)
        {
            var settings = Json.AsObject(Settings()); settings[key] = value;
            Write(Path.Combine(Root, "preferences.dpapi"), settings);
        }
        internal static string Destination(string source, string preferred)
        { return string.IsNullOrEmpty(preferred) ? Path.GetDirectoryName(Path.GetFullPath(source)) : preferred; }
        internal static void Retain(LocalDocument doc)
        {
            if (doc.ValidatedCopy == null) return;
            if (doc.RecoveryPath == null) doc.RecoveryPath = Path.Combine(Root, "pending", Guid.NewGuid().ToString("N") + ".dpapi");
            Write(doc.RecoveryPath, new { source = doc.Source, pdf = Convert.ToBase64String(doc.ValidatedCopy),
                output = doc.Output, target = doc.TargetDirectory, origin = doc.Origin, context = doc.SourceContext, upload = doc.UploadContext });
        }
        internal static IEnumerable<LocalDocument> Recover(Action<string> error)
        {
            string directory = Path.Combine(Root, "pending");
            List<LocalDocument> result = new List<LocalDocument>();
            if (!Directory.Exists(directory)) return result;
            foreach (string path in Directory.GetFiles(directory, "*.dpapi"))
            {
                try
                {
                    object data = Read(path); var fields = Json.AsObject(data);
                    byte[] pdf = Convert.FromBase64String(Json.GetString(data, "pdf"));
                    if (pdf.Length < 5 || pdf.Length > 32 * 1024 * 1024) throw new IOException("Nieprawidłowy rozmiar kopii.");
                    result.Add(new LocalDocument { Source = Json.GetString(data, "source"), ValidatedCopy = pdf,
                        Output = Json.GetString(data, "output"), TargetDirectory = Json.GetString(data, "target"),
                        Origin = Json.GetString(data, "origin"), SourceContext = fields["context"], UploadContext = fields["upload"],
                        SignAttempted = true, RecoveryPath = path, Status = "Podpis zachowany — ponów zapis / dostarczenie" });
                }
                catch (Exception) { error("Nie można otworzyć zachowanej kopii: " + Path.GetFileName(path) + ". Plik pozostaje do odzyskania."); }
            }
            return result;
        }
        internal static void Complete(LocalDocument doc)
        { if (doc.RecoveryPath != null && File.Exists(doc.RecoveryPath)) File.Delete(doc.RecoveryPath); doc.RecoveryPath = null; }
    }
}
