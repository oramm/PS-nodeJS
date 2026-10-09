using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace EnviPodpis
{
    internal enum InstallOutcome
    {
        Installed,
        Updated,
        AlreadyCurrent,
        NewerAlreadyInstalled,
        RunningFromInstalled,
        CopyFailed
    }

    internal sealed class InstallResult
    {
        public InstallOutcome Outcome;
        public Version InstalledVersion;
        public string Detail;
    }

    internal static class Installer
    {
        private const string ProtocolKey = @"Software\Classes\" + Config.ProtocolName;
        private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\EnviPodpis";

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool DeleteFile(string path);

        public static string InstallDir
        {
            get
            {
                return Path.Combine(
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ENVI"),
                    "Podpis");
            }
        }

        public static string InstalledExe
        {
            get { return Path.Combine(InstallDir, "EnviPodpis.exe"); }
        }

        public static string OwnExe
        {
            get { return Assembly.GetExecutingAssembly().Location; }
        }

        public static bool IsRunningFromInstalled()
        {
            return string.Equals(Path.GetFullPath(OwnExe), Path.GetFullPath(InstalledExe), StringComparison.OrdinalIgnoreCase);
        }

        public static Version GetInstalledVersion()
        {
            try
            {
                if (!File.Exists(InstalledExe)) return null;
                if (!IsRegistered()) return null;
                FileVersionInfo fvi = FileVersionInfo.GetVersionInfo(InstalledExe);
                return new Version(fvi.FileMajorPart, fvi.FileMinorPart, fvi.FileBuildPart, fvi.FilePrivatePart);
            }
            catch (Exception) { return null; }
        }

        public static bool IsRegistered()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(ProtocolKey + @"\shell\open\command"))
                {
                    if (k == null) return false;
                    string cmd = k.GetValue(null) as string;
                    return cmd != null && cmd.IndexOf(InstalledExe, StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch (Exception) { return false; }
        }

        public static InstallResult InstallOrUpdate()
        {
            InstallResult r = new InstallResult();
            Version own = Config.CurrentVersion;
            Version installed = GetInstalledVersion();

            if (IsRunningFromInstalled())
            {
                RegisterAll(own); // naprawa wpisow, gdyby ktos je usunal
                r.Outcome = InstallOutcome.RunningFromInstalled;
                r.InstalledVersion = own;
                return r;
            }

            if (installed != null && installed > own)
            {
                r.Outcome = InstallOutcome.NewerAlreadyInstalled;
                r.InstalledVersion = installed;
                return r;
            }

            try
            {
                Directory.CreateDirectory(InstallDir);
                File.Copy(OwnExe, InstalledExe, true);
                // Kopia nie ma byc oznaczona jako "pobrana z internetu" - uzytkownik juz swiadomie uruchomil instalator.
                DeleteFile(InstalledExe + ":Zone.Identifier");
            }
            catch (Exception ex)
            {
                r.Outcome = InstallOutcome.CopyFailed;
                r.Detail = ex.Message;
                return r;
            }

            RegisterAll(own);
            r.InstalledVersion = own;
            if (installed == null) r.Outcome = InstallOutcome.Installed;
            else if (installed == own) r.Outcome = InstallOutcome.AlreadyCurrent;
            else r.Outcome = InstallOutcome.Updated;
            return r;
        }

        private static void RegisterAll(Version version)
        {
            string exe = InstalledExe;

            using (RegistryKey proto = Registry.CurrentUser.CreateSubKey(ProtocolKey))
            {
                proto.SetValue(null, "URL:ENVI Podpis", RegistryValueKind.String);
                proto.SetValue("URL Protocol", "", RegistryValueKind.String);
                using (RegistryKey icon = proto.CreateSubKey("DefaultIcon"))
                {
                    icon.SetValue(null, "\"" + exe + "\",0", RegistryValueKind.String);
                }
                using (RegistryKey cmd = proto.CreateSubKey(@"shell\open\command"))
                {
                    cmd.SetValue(null, "\"" + exe + "\" \"%1\"", RegistryValueKind.String);
                }
            }

            using (RegistryKey un = Registry.CurrentUser.CreateSubKey(UninstallKey))
            {
                un.SetValue("DisplayName", Config.ProductName, RegistryValueKind.String);
                un.SetValue("DisplayVersion", Config.FormatVersion(version), RegistryValueKind.String);
                un.SetValue("Publisher", "ENVI", RegistryValueKind.String);
                un.SetValue("DisplayIcon", exe, RegistryValueKind.String);
                un.SetValue("InstallLocation", InstallDir, RegistryValueKind.String);
                un.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"), RegistryValueKind.String);
                un.SetValue("UninstallString", "\"" + exe + "\" /uninstall", RegistryValueKind.String);
                un.SetValue("NoModify", 1, RegistryValueKind.DWord);
                un.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }

        // Usuwa wpisy w rejestrze od razu, a plik programu po zamknieciu tego procesu.
        public static void Uninstall()
        {
            DeleteTree(ProtocolKey);
            DeleteTree(UninstallKey);
            DeleteTree(Config.RegistryAppKey);
            try
            {
                using (RegistryKey envi = Registry.CurrentUser.OpenSubKey(@"Software\ENVI", true))
                {
                    if (envi != null && envi.SubKeyCount == 0 && envi.ValueCount == 0)
                    {
                        envi.Close();
                        Registry.CurrentUser.DeleteSubKey(@"Software\ENVI", false);
                    }
                }
            }
            catch (Exception) { }

            string dir = InstallDir;
            string exe = InstalledExe;
            string parent = Path.GetDirectoryName(dir);
            // Plik, z ktorego sie uruchomilismy, usunie dopiero osobny, ukryty proces po chwili.
            string script = "/c ping -n 4 127.0.0.1 >nul & del /f /q \"" + exe + "\" & rmdir \"" + dir + "\" & rmdir \"" + parent + "\"";
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", script);
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(psi);
            }
            catch (Exception) { }
        }

        private static void DeleteTree(string subKey)
        {
            try { Registry.CurrentUser.DeleteSubKeyTree(subKey, false); }
            catch (Exception) { }
        }
    }
}
