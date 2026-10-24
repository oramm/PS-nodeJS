using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace EnviPodpis
{
    internal enum InstallOutcome { Installed, Updated, AlreadyCurrent, NewerAlreadyInstalled, CopyFailed }
    internal sealed class InstallResult
    {
        public InstallOutcome Outcome;
        public Version InstalledVersion;
        public string Detail;
    }
    internal static class Installer
    {
#if DEBUG
        internal static string TestRoot;
        internal static Action AfterProtocol;
#endif
        private static string RegistryRoot
        {
            get {
#if DEBUG
                if (TestRoot != null) return @"Software\ENVI\PodpisInstallerTest\" + Path.GetFileName(TestRoot) + @"\";
#endif
                return "";
            }
        }
        internal static string ProtocolKey { get { return RegistryRoot + @"Software\Classes\" + Config.ProtocolName; } }
        internal static string UninstallKey { get { return RegistryRoot + @"Software\Microsoft\Windows\CurrentVersion\Uninstall\EnviPodpis"; } }
        public static string InstallDir
        {
            get {
#if DEBUG
                if (TestRoot != null) return Path.Combine(TestRoot, "Podpis");
#endif
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"ENVI\Podpis");
            }
        }
        internal static string Shortcut
        {
            get {
#if DEBUG
                if (TestRoot != null) return Path.Combine(TestRoot, "ENVI Podpis.lnk");
#endif
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "ENVI Podpis.lnk");
            }
        }
        public static string InstalledExe { get { return Path.Combine(InstallDir, "EnviPodpis.exe"); } }
        public static string OwnExe { get { return Assembly.GetExecutingAssembly().Location; } }
        public static bool IsRunningFromInstalled()
        {
            return string.Equals(Path.GetFullPath(OwnExe), Path.GetFullPath(InstalledExe), StringComparison.OrdinalIgnoreCase);
        }
        internal static Version VersionAt(string directory)
        {
            FileVersionInfo f = FileVersionInfo.GetVersionInfo(Path.Combine(directory, "EnviPodpis.exe"));
            return new Version(f.FileMajorPart, f.FileMinorPart, f.FileBuildPart, f.FilePrivatePart);
        }
        public static Version GetInstalledVersion() { return File.Exists(InstalledExe) ? VersionAt(InstallDir) : null; }
        public static bool IsRegistered()
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(ProtocolKey + @"\shell\open\command"))
                return key != null && (string)key.GetValue(null) == "\"" + InstalledExe + "\" \"%1\"";
        }
        // Never follow junctions when copying, replacing or deleting an application tree.
        internal static void CheckTree(string directory)
        {
            if (!Directory.Exists(directory)) return;
            if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0) throw new IOException("Katalog programu jest dowiązaniem.");
            foreach (string item in Directory.GetFileSystemEntries(directory))
            {
                if ((File.GetAttributes(item) & FileAttributes.ReparsePoint) != 0) throw new IOException("Paczka zawiera dowiązanie.");
                if (Directory.Exists(item)) CheckTree(item);
            }
        }
        internal static void RemoveTree(string directory)
        {
            CheckTree(directory);
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }
        internal static string PayloadPath(string directory, string relative)
        {
            if (string.IsNullOrEmpty(relative) || relative.Contains(":") || relative.Contains("\\") || relative.StartsWith("/"))
                throw new IOException("Nieprawidłowa ścieżka paczki.");
            foreach (string part in relative.Split('/'))
                if (part == "" || part == "." || part == ".." || part.TrimEnd(' ', '.') != part
                    || part.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0
                    || Regex.IsMatch(part, @"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)", RegexOptions.IgnoreCase))
                    throw new IOException("Nieprawidłowa ścieżka paczki.");
            string root = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string full = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new IOException("Ścieżka poza paczką.");
            return full;
        }
        internal static void VerifyPayload(string directory)
        {
            CheckTree(directory);
            object manifest = Json.Parse(File.ReadAllText(Path.Combine(directory, "payload.json")));
            if (Json.GetInt(manifest, "format", 0) != 1) throw new IOException("Nieznany format instalatora.");
            HashSet<string> files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (object entry in Json.GetList(manifest, "files"))
            {
                string relative = Json.GetString(entry, "path");
                string file = PayloadPath(directory, relative);
                if (!files.Add(relative) || relative.Equals("payload.json", StringComparison.OrdinalIgnoreCase)) throw new IOException("Powtórzony plik w paczce.");
                using (SHA256 sha = SHA256.Create())
                using (Stream stream = File.OpenRead(file))
                    if (!string.Equals(BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", ""), Json.GetString(entry, "sha256"), StringComparison.OrdinalIgnoreCase))
                        throw new IOException("Uszkodzona paczka: " + relative);
            }
            foreach (string required in new string[] { "EnviPodpis.exe", "pdf-worker/node.exe", "pdf-worker/worker.cjs", "pdf-worker/manifest.json", "pdf-worker/THIRD-PARTY.json" })
                if (!files.Contains(required)) throw new IOException("Niekompletna paczka: " + required);
            if (Directory.GetFiles(directory, "*", SearchOption.AllDirectories).Length != files.Count + 1) throw new IOException("Nieoczekiwane pliki w paczce.");
        }
        private static void CopyTree(string source, string target)
        {
            Directory.CreateDirectory(target);
            foreach (string file in Directory.GetFiles(source)) File.Copy(file, Path.Combine(target, Path.GetFileName(file)));
            foreach (string dir in Directory.GetDirectories(source)) CopyTree(dir, Path.Combine(target, Path.GetFileName(dir)));
        }
        private static void CheckClosed(string directory)
        {
            CheckTree(directory);
            if (File.Exists(Path.Combine(directory, "EnviPodpis.exe")))
                using (FileStream file = new FileStream(Path.Combine(directory, "EnviPodpis.exe"), FileMode.Open, FileAccess.ReadWrite, FileShare.None)) { }
        }
        private static void CheckOwnedFiles(string directory, string fallback)
        {
            if (!Directory.Exists(directory)) return;
            HashSet<string> allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "EnviPodpis.exe", "payload.json" };
            string manifest = Path.Combine(directory, "payload.json");
            if (!File.Exists(manifest) && fallback != null && VersionAt(directory) != new Version(1, 0, 0, 0)) manifest = Path.Combine(fallback, "payload.json");
            if (File.Exists(manifest))
                foreach (object file in Json.GetList(Json.Parse(File.ReadAllText(manifest)), "files")) allowed.Add(Json.GetString(file, "path"));
            foreach (string file in Directory.GetFiles(directory, "*", SearchOption.AllDirectories))
                if (!allowed.Contains(file.Substring(directory.Length + 1).Replace('\\', '/')))
                    throw new IOException("Katalog programu zawiera dodatkowe pliki. Przenieś je w inne miejsce przed instalacją lub usunięciem programu: " + directory);
        }
        public static InstallResult InstallOrUpdate(string source, bool rollback)
        {
            InstallResult result = new InstallResult();
            string stage = InstallDir + ".stage-" + Guid.NewGuid().ToString("N");
            string previous = InstallDir + ".previous", parked = InstallDir + ".parked-" + Guid.NewGuid().ToString("N");
            bool movedOld = false, movedNew = false, parkedPrevious = false;
            Directory.CreateDirectory(Path.GetDirectoryName(InstallDir));
            using (FileStream gate = new FileStream(InstallDir + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
            {
                Version old = GetInstalledVersion();
                string backup = previous;
                RegistrySnapshot protocol = RegistrySnapshot.Read(ProtocolKey), uninstall = RegistrySnapshot.Read(UninstallKey);
                byte[] shortcut = File.Exists(Shortcut) ? File.ReadAllBytes(Shortcut) : null;
                try
                {
                    source = rollback ? previous : source;
                    CheckTree(source);
                    // Original PS-only 1.0 has no manifest; allow it only as a retained rollback.
                    if (!rollback || File.Exists(Path.Combine(source, "payload.json"))) VerifyPayload(source);
                    else if (VersionAt(source) != new Version(1, 0, 0, 0) || Directory.GetFiles(source, "*", SearchOption.AllDirectories).Length != 1)
                        throw new IOException("Brak kompletnej poprzedniej wersji.");
                    Version next = VersionAt(source);
                    bool repair = !rollback && old == next;
                    if (repair) backup = stage + ".old";
                    if (!rollback && old != null && old > next)
                    {
                        result.Outcome = InstallOutcome.NewerAlreadyInstalled; result.InstalledVersion = old; return result;
                    }
                    CheckClosed(InstallDir); CheckClosed(previous);
                    CheckOwnedFiles(InstallDir, source); CheckOwnedFiles(previous, null);
                    CopyTree(source, stage);
                    if (File.Exists(Path.Combine(stage, "payload.json"))) VerifyPayload(stage);
                    if (!repair && Directory.Exists(previous)) { Directory.Move(previous, parked); parkedPrevious = true; }
                    if (Directory.Exists(InstallDir)) { Directory.Move(InstallDir, backup); movedOld = true; }
                    Directory.Move(stage, InstallDir); movedNew = true;
                    RegisterAll(next);
                    result.Outcome = old == null ? InstallOutcome.Installed : old == next ? InstallOutcome.AlreadyCurrent : InstallOutcome.Updated;
                    result.InstalledVersion = next;
                }
                catch (Exception ex)
                {
                    // Restore complete directories, never merge files from different versions.
                    if (movedNew) RemoveTree(InstallDir);
                    if (movedOld) Directory.Move(backup, InstallDir);
                    if (parkedPrevious) Directory.Move(parked, previous);
                    if (movedNew)
                    {
                        protocol.Restore(ProtocolKey); uninstall.Restore(UninstallKey);
                        if (shortcut != null) File.WriteAllBytes(Shortcut, shortcut);
                        else if (File.Exists(Shortcut)) File.Delete(Shortcut);
                    }
                    result.Outcome = InstallOutcome.CopyFailed; result.Detail = ex.Message;
                }
                finally { RemoveTree(stage); }
                // Cleanup failure must not turn a committed installation into a reported failure.
                try { RemoveTree(parked); } catch (IOException) { } catch (UnauthorizedAccessException) { }
                if (backup != previous) try { RemoveTree(backup); } catch (IOException) { } catch (UnauthorizedAccessException) { }
            }
            return result;
        }
        private static void RegisterAll(Version version)
        {
            using (RegistryKey proto = Registry.CurrentUser.CreateSubKey(ProtocolKey))
            {
                proto.SetValue(null, "URL:ENVI Podpis"); proto.SetValue("URL Protocol", "");
                using (RegistryKey icon = proto.CreateSubKey("DefaultIcon")) icon.SetValue(null, "\"" + InstalledExe + "\",0");
                using (RegistryKey cmd = proto.CreateSubKey(@"shell\open\command")) cmd.SetValue(null, "\"" + InstalledExe + "\" \"%1\"");
            }
#if DEBUG
            if (AfterProtocol != null) AfterProtocol();
#endif
            using (RegistryKey un = Registry.CurrentUser.CreateSubKey(UninstallKey))
            {
                un.SetValue("DisplayName", Config.ProductName); un.SetValue("DisplayVersion", Config.FormatVersion(version));
                un.SetValue("Publisher", "ENVI"); un.SetValue("DisplayIcon", InstalledExe); un.SetValue("InstallLocation", InstallDir);
                un.SetValue("UninstallString", "\"" + InstalledExe + "\" /uninstall"); un.SetValue("NoModify", 1); un.SetValue("NoRepair", 1);
            }
            object shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell")), link = null;
            try
            {
                link = shell.GetType().InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { Shortcut });
                link.GetType().InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { InstalledExe });
                link.GetType().InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { InstallDir });
                link.GetType().InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { InstalledExe + ",0" });
                link.GetType().InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
            }
            finally { if (link != null) Marshal.FinalReleaseComObject(link); Marshal.FinalReleaseComObject(shell); }
        }
        public static void Unregister()
        {
            // Do not remove a protocol or shortcut that another installation has taken over.
            if (IsRegistered()) Registry.CurrentUser.DeleteSubKeyTree(ProtocolKey, false);
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(UninstallKey))
            {
                bool owned = key != null && (string)key.GetValue("InstallLocation") == InstallDir;
                if (owned) { key.Close(); Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); }
            }
            if (File.Exists(Shortcut))
            {
                object shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
                object link = shell.GetType().InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { Shortcut });
                try {
                    string target = (string)link.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, link, null);
                    if (string.Equals(target, InstalledExe, StringComparison.OrdinalIgnoreCase)) File.Delete(Shortcut);
                }
                finally { Marshal.FinalReleaseComObject(link); Marshal.FinalReleaseComObject(shell); }
            }
        }
        public static void Uninstall()
        {
            if (!IsRunningFromInstalled()) throw new IOException("Odinstaluj program z ustawień Aplikacje Windows.");
            CheckTree(InstallDir); CheckTree(InstallDir + ".previous");
            CheckOwnedFiles(InstallDir, null); CheckOwnedFiles(InstallDir + ".previous", null);
            string helper = Path.Combine(Path.GetTempPath(), "EnviPodpis-uninstall-" + Guid.NewGuid().ToString("N") + ".exe");
            File.Copy(OwnExe, helper);
            RegistrySnapshot protocol = RegistrySnapshot.Read(ProtocolKey), uninstall = RegistrySnapshot.Read(UninstallKey);
            byte[] shortcut = File.Exists(Shortcut) ? File.ReadAllBytes(Shortcut) : null;
            try
            {
                Unregister();
                Process.Start(new ProcessStartInfo(helper, "/cleanup " + Process.GetCurrentProcess().Id) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden });
            }
            catch
            {
                protocol.Restore(ProtocolKey); uninstall.Restore(UninstallKey);
                if (shortcut != null) File.WriteAllBytes(Shortcut, shortcut);
                throw;
            }
        }
        internal static int Cleanup(string[] args)
        {
            int pid;
            if (args.Length != 2 || !int.TryParse(args[1], out pid) || IsRunningFromInstalled()) return 1;
            if (!string.Equals(Path.GetDirectoryName(OwnExe), Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase)
                || !Path.GetFileName(OwnExe).StartsWith("EnviPodpis-uninstall-", StringComparison.Ordinal) || IsRegistered()) return 1;
            try
            {
                using (Process parent = Process.GetProcessById(pid))
                {
                    if (!string.Equals(parent.MainModule.FileName, InstalledExe, StringComparison.OrdinalIgnoreCase)) return 1;
                    parent.WaitForExit();
                }
            }
            catch (ArgumentException) { }
            using (FileStream gate = new FileStream(InstallDir + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
            {
                if (IsRegistered()) return 1;
                CheckClosed(InstallDir); CheckClosed(InstallDir + ".previous");
                CheckOwnedFiles(InstallDir, null); CheckOwnedFiles(InstallDir + ".previous", null);
                RemoveTree(InstallDir); RemoveTree(InstallDir + ".previous");
            }
            return 0;
        }
        private sealed class RegistrySnapshot
        {
            private bool exists;
            private readonly Dictionary<string, object> values = new Dictionary<string, object>();
            private readonly Dictionary<string, RegistryValueKind> kinds = new Dictionary<string, RegistryValueKind>();
            private readonly Dictionary<string, RegistrySnapshot> children = new Dictionary<string, RegistrySnapshot>();
            internal static RegistrySnapshot Read(string path)
            {
                RegistrySnapshot copy = new RegistrySnapshot();
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(path))
                {
                    if (key == null) return copy;
                    copy.exists = true;
                    foreach (string name in key.GetValueNames()) { copy.values[name] = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames); copy.kinds[name] = key.GetValueKind(name); }
                    foreach (string name in key.GetSubKeyNames()) copy.children[name] = Read(path + @"\" + name);
                }
                return copy;
            }
            internal void Restore(string path)
            {
                Registry.CurrentUser.DeleteSubKeyTree(path, false);
                if (!exists) return;
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(path))
                    foreach (string name in values.Keys) key.SetValue(name, values[name], kinds[name]);
                foreach (string name in children.Keys) children[name].Restore(path + @"\" + name);
            }
        }
    }
}
