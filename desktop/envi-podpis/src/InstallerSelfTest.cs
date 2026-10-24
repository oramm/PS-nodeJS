#if DEBUG
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using Microsoft.Win32;

namespace EnviPodpis
{
    internal static class InstallerSelfTest
    {
        internal static void Extract(string setup, string output, Action<bool, string> check)
        {
            Assembly assembly = Assembly.LoadFile(Path.GetFullPath(setup));
            assembly.GetType("EnviPodpis.SetupMain").GetMethod("Extract", BindingFlags.NonPublic | BindingFlags.Static).Invoke(null, new object[] { output });
            Installer.VerifyPayload(output);
            check(true, "osadzony ZIP wyodrebniony i wszystkie SHA256 sprawdzone: " + output);
            Assembly app = Assembly.LoadFile(Path.Combine(Path.GetFullPath(output), "EnviPodpis.exe"));
            check(app.GetType("EnviPodpis.InstallerSelfTest") == null, "payload bez debug selftest i testowego przekierowania instalacji");
            string[] hosts = (string[])app.GetType("EnviPodpis.Config").GetProperty("AllowedBaseUrls", BindingFlags.Static | BindingFlags.Public).GetValue(null, null);
            check(hosts.Length == 1 && hosts[0] == Config.ProductionBaseUrl, "release PS ma wylacznie dotychczasowy produkcyjny adres");
        }
        internal static void Run(string payload, Action<bool, string> check)
        {
            string root = Path.Combine(Path.GetTempPath(), "envi-podpis-d3-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            Installer.TestRoot = root;
            string fixture = Path.Combine(root, "fixture");
            try
            {
                Installer.VerifyPayload(payload);
                check(true, "rzeczywista paczka: wszystkie pliki SHA256, zasoby i runtime");
                Directory.CreateDirectory(fixture);
                File.Copy(Path.Combine(payload, "EnviPodpis.exe"), Path.Combine(fixture, "EnviPodpis.exe"));
                Directory.CreateDirectory(Path.Combine(fixture, "pdf-worker"));
                foreach (string name in new string[] { "node.exe", "worker.cjs", "manifest.json", "THIRD-PARTY.json" })
                    File.WriteAllText(Path.Combine(fixture, "pdf-worker", name), "fixture-1");
                WriteManifest(fixture);
                InstallResult result = Installer.InstallOrUpdate(fixture, false);
                check(result.Outcome == InstallOutcome.Installed && Installer.IsRegistered(), "pierwsza instalacja + dokladna komenda PS z %1");
                check(File.Exists(Installer.Shortcut), "skrot pulpitu utworzony w izolowanym katalogu");
                Installer.VerifyPayload(Installer.InstallDir);
                check(true, "zainstalowane bajty zgodne z manifestem");
                string exeHash = Hash(Installer.InstalledExe);
                using (FileStream gate = new FileStream(Installer.InstallDir + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
                {
                    bool denied = false;
                    try { Installer.InstallOrUpdate(fixture, false); } catch (IOException) { denied = true; }
                    check(denied && Hash(Installer.InstalledExe) == exeHash, "rownolegly instalator nie podmienia plikow");
                }
                result = Installer.InstallOrUpdate(null, true);
                check(result.Outcome == InstallOutcome.CopyFailed && Installer.IsRegistered(), "brak poprzedniej wersji nie niszczy instalacji");
                string ownPdf = Path.Combine(Installer.InstallDir, "user-document.pdf");
                File.WriteAllText(ownPdf, "synthetic user document");
                result = Installer.InstallOrUpdate(fixture, false);
                check(result.Outcome == InstallOutcome.CopyFailed && File.ReadAllText(ownPdf) == "synthetic user document", "dodatkowe dokumenty uzytkownika blokuja podmiane zamiast kasowania");
                File.Delete(ownPdf);
                File.Delete(Path.Combine(Installer.InstallDir, "pdf-worker", "node.exe"));
                result = Installer.InstallOrUpdate(fixture, false);
                check(result.Outcome == InstallOutcome.AlreadyCurrent && File.Exists(Path.Combine(Installer.InstallDir, "pdf-worker", "node.exe")), "naprawa brakujacego runtime tej samej wersji");
                File.WriteAllText(Path.Combine(fixture, "pdf-worker", "node.exe"), "corrupt");
                result = Installer.InstallOrUpdate(fixture, false);
                check(result.Outcome == InstallOutcome.CopyFailed && Hash(Installer.InstalledExe) == exeHash && Installer.IsRegistered(), "uszkodzony payload nie zmienia instalacji ani protokolu");
                WriteManifest(fixture);
                using (FileStream locked = new FileStream(Installer.InstalledExe, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    result = Installer.InstallOrUpdate(fixture, false);
                    check(result.Outcome == InstallOutcome.CopyFailed, "zajety EXE blokuje aktualizacje bez podmiany");
                }
                byte[] shortcut = File.ReadAllBytes(Installer.Shortcut);
                Installer.AfterProtocol = delegate { throw new IOException("injected registration failure"); };
                result = Installer.InstallOrUpdate(fixture, false);
                Installer.AfterProtocol = null;
                check(result.Outcome == InstallOutcome.CopyFailed && Hash(Installer.InstalledExe) == exeHash && Installer.IsRegistered(), "blad po podmianie przywraca dzialajaca wersje i rejestr");
                check(Convert.ToBase64String(shortcut) == Convert.ToBase64String(File.ReadAllBytes(Installer.Shortcut)), "blad aktualizacji zachowuje skrot bajt w bajt");
                foreach (string path in new string[] { "../outside", "/absolute", "C:/outside", "a\\b", "a/../b", "a./b", "a//b", "NUL", "a/COM1.txt", "bad|name" })
                {
                    bool denied = false;
                    try { Installer.PayloadPath(fixture, path); } catch (IOException) { denied = true; }
                    check(denied, "odrzucona sciezka: " + path);
                }
                // Upgrade from the actual shipped PS-only executable, without touching the active installation.
                Installer.RemoveTree(Installer.InstallDir);
                Installer.RemoveTree(Installer.InstallDir + ".previous");
                Directory.CreateDirectory(Installer.InstallDir);
                string legacy = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"..\..\..\assets\signing\EnviPodpis.exe");
                File.Copy(legacy, Installer.InstalledExe);
                string legacyHash = Hash(Installer.InstalledExe);
                result = Installer.InstallOrUpdate(payload, false);
                check(result.Outcome == InstallOutcome.Updated && Installer.GetInstalledVersion() == Config.CurrentVersion, "update 1.0 -> aktualna kompletna wersja");
                check(Hash(Path.Combine(Installer.InstallDir + ".previous", "EnviPodpis.exe")) == legacyHash, "stare PS zachowane bajt w bajt");
                File.Delete(Path.Combine(Installer.InstallDir, "pdf-worker", "node.exe"));
                result = Installer.InstallOrUpdate(payload, false);
                check(result.Outcome == InstallOutcome.AlreadyCurrent && Hash(Path.Combine(Installer.InstallDir + ".previous", "EnviPodpis.exe")) == legacyHash, "naprawa nie niszczy zachowanej dobrej wersji 1.0");
                Installer.VerifyPayload(Installer.InstallDir);
                check(true, "rzeczywista instalacja: caly payload sprawdzony po zapisie");
                result = Installer.InstallOrUpdate(null, true);
                check(result.Outcome == InstallOutcome.Updated && Hash(Installer.InstalledExe) == legacyHash && Installer.IsRegistered(), "rollback do starego PS 1.0 zachowuje protokol");
                result = Installer.InstallOrUpdate(null, true);
                check(result.Outcome == InstallOutcome.Updated && Installer.GetInstalledVersion() == Config.CurrentVersion, "rollback ponownie przywraca aktualna kompletna wersje");
                File.Copy(legacy, Path.Combine(fixture, "EnviPodpis.exe"), true);
                WriteManifest(fixture);
                result = Installer.InstallOrUpdate(fixture, false);
                check(result.Outcome == InstallOutcome.NewerAlreadyInstalled && Installer.GetInstalledVersion() == Config.CurrentVersion, "instalator starszej wersji nie obniza aktualnej instalacji");
                Installer.Unregister();
                check(!Installer.IsRegistered() && !File.Exists(Installer.Shortcut), "uninstall usuwa wlasny protokol i skrot");
                using (RegistryKey other = Registry.CurrentUser.CreateSubKey(Installer.ProtocolKey + @"\shell\open\command")) other.SetValue(null, "other.exe %1");
                Installer.Unregister();
                using (RegistryKey other = Registry.CurrentUser.OpenSubKey(Installer.ProtocolKey)) check(other != null, "uninstall zachowuje cudzy protokol");
                check(true, "dowody instalacji: " + root);
            }
            finally
            {
                Installer.AfterProtocol = null;
                Registry.CurrentUser.DeleteSubKeyTree(@"Software\ENVI\PodpisInstallerTest\" + Path.GetFileName(root), false);
                Installer.TestRoot = null;
            }
        }
        private static string Hash(string file)
        {
            using (SHA256 sha = SHA256.Create())
            using (Stream input = File.OpenRead(file)) return BitConverter.ToString(sha.ComputeHash(input)).Replace("-", "").ToLowerInvariant();
        }
        private static void WriteManifest(string directory)
        {
            List<object> files = new List<object>();
            foreach (string file in Directory.GetFiles(directory, "*", SearchOption.AllDirectories))
                if (Path.GetFileName(file) != "payload.json") files.Add(new { path = file.Substring(directory.Length + 1).Replace('\\', '/'), sha256 = Hash(file) });
            File.WriteAllText(Path.Combine(directory, "payload.json"), Json.Serialize(new { format = 1, files = files }));
        }
    }
}
#endif
