using System;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            ApiClient.ConfigureTls();

            bool silent = false;
            string first = null;
            foreach (string a in args)
            {
                if (string.Equals(a, "/silent", StringComparison.OrdinalIgnoreCase)) silent = true;
                else if (first == null) first = a;
            }

#if DEBUG
            if (first != null && string.Equals(first, "/selftest", StringComparison.OrdinalIgnoreCase))
            {
                return SelfTest.Run(args);
            }
#endif

            if (first == null || string.Equals(first, "/local", StringComparison.OrdinalIgnoreCase))
            {
                string package = args.Length > 1 ? args[1] : System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "pdf-worker");
                Application.Run(new LocalForm(package));
                return 0;
            }

            if (string.Equals(first, "/cleanup", StringComparison.OrdinalIgnoreCase))
            {
                try { return Installer.Cleanup(args); } catch (Exception) { return 1; }
            }
            if (string.Equals(first, "/uninstall", StringComparison.OrdinalIgnoreCase)) return RunUninstall(silent);

            if (first.StartsWith(Config.ProtocolName + ":", StringComparison.OrdinalIgnoreCase))
            {
                string token = ApiClient.ParseJobToken(first);
                if (token == null)
                {
                    return ShowSimple("Nieprawidłowy link",
                        "Ten link do podpisu jest nieprawidłowy, więc niczego nie podpisuję.",
                        "Wróć do PS i kliknij „Podpisz” jeszcze raz.");
                }
                MainForm form = new MainForm();
                form.Shown += delegate
                {
                    form.Activate();
                    form.RunJob(token);
                };
                Application.Run(form);
                return 0;
            }

            return ShowSimple("ENVI Podpis",
                "Nie rozpoznaję tego polecenia.",
                "Otwórz skrót ENVI Podpis bez argumentów albo kliknij „Podpisz” w PS.");
        }

        private static int ShowSimple(string title, string body, string next)
        {
            MainForm form = new MainForm();
            form.Shown += delegate
            {
                form.Activate();
                form.ShowInfo(title, body + "\r\n\r\nCo teraz: " + next, "Zamknij", null);
            };
            Application.Run(form);
            return 0;
        }

        internal static int ShowInstallResult(InstallResult r, bool silent)
        {
            if (silent) return r.Outcome == InstallOutcome.CopyFailed ? 1 : 0;

            string ver = r.InstalledVersion != null ? Config.FormatVersion(r.InstalledVersion) : "";
            MainForm form = new MainForm();
            form.Shown += delegate
            {
                form.Activate();
                switch (r.Outcome)
                {
                    case InstallOutcome.Installed:
                        form.ShowInfo("Zainstalowano",
                            "Wersja " + ver + ". Otwórz skrót ENVI Podpis na pulpicie, aby wybrać lokalne pliki PDF.\r\n\r\nPodpisywanie z PS nadal działa: kliknij „Podpisz” w PS i zezwól przeglądarce na otwarcie programu.",
                            "Zamknij", null);
                        break;
                    case InstallOutcome.Updated:
                        form.ShowInfo("Zaktualizowano",
                            "Wersja " + ver + ". Otwórz skrót ENVI Podpis na pulpicie lub kliknij „Podpisz” w PS. Poprzednia wersja jest zachowana; możesz ją przywrócić instalatorem z /rollback.",
                            "Zamknij", null);
                        break;
                    case InstallOutcome.NewerAlreadyInstalled:
                        form.ShowInfo("Masz już nowszą wersję",
                            "Na tym komputerze jest już zainstalowana nowsza wersja programu (" + ver + "), więc niczego nie zmieniam. Wróć do PS i kliknij „Podpisz”.",
                            "Zamknij", null);
                        break;
                    case InstallOutcome.CopyFailed:
                        {
                            ErrorInfo e = new ErrorInfo();
                            e.Title = "Nie udało się zainstalować";
                            e.Message = "Instalacja nie została zakończona. Dotychczasowa wersja jest zachowana.";
                            e.NextStep = "Zamknij okno ENVI Podpis, jeśli jest otwarte, i uruchom ten plik jeszcze raz.";
                            e.Technical = r.Detail;
                            form.ShowError(e);
                            break;
                        }
                    default:
                        form.ShowInfo("ENVI Podpis działa",
                            "Wersja " + ver + ". Otwórz skrót ENVI Podpis na pulpicie lub kliknij „Podpisz” w PS.",
                            "Zamknij", null);
                        break;
                }
            };
            Application.Run(form);
            return r.Outcome == InstallOutcome.CopyFailed ? 1 : 0;
        }

        private static int RunUninstall(bool silent)
        {
            if (!silent && MessageBox.Show("Usunąć ENVI Podpis? Zapisane dokumenty PDF pozostaną na dysku.",
                "ENVI Podpis", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return 0;
            try { Installer.Uninstall(); }
            catch (Exception ex)
            {
                if (silent) return 1;
                return ShowSimple("Nie udało się odinstalować", "Nie mogę usunąć programu. " + ex.Message, "Zamknij inne okna ENVI Podpis. Jeśli komunikat dotyczy dodatkowych plików, przenieś je z katalogu programu i spróbuj ponownie.");
            }
            if (silent) return 0;
            MainForm form = new MainForm();
            form.Shown += delegate
            {
                form.Activate();
                form.ShowInfo("Odinstalowano",
                    "ENVI Podpis został usunięty z tego komputera. Przycisk „Podpisz” w PS przestanie otwierać program.\r\n\r\nChcesz podpisywać znowu? Pobierz program z okna podpisu w PS i uruchom go jednym dwukliknięciem.",
                    "Zamknij", null);
            };
            Application.Run(form);
            return 0;
        }
    }
}
