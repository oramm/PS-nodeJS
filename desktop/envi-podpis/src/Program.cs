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

            if (first == null) return RunInstall(silent);
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
                "Ten program uruchamia się sam z PS. Nie trzeba go otwierać ręcznie.",
                "Wróć do PS i kliknij „Podpisz”.");
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

        private static int RunInstall(bool silent)
        {
            InstallResult r = Installer.InstallOrUpdate();
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
                            "Zainstalowano. Wróć do PS i kliknij „Podpisz”.\r\n\r\nProgram (wersja " + ver + ") będzie się uruchamiał sam, gdy klikniesz „Podpisz” w PS. Nie trzeba go otwierać ręcznie. Przy pierwszym podpisie przeglądarka zapyta, czy otworzyć ENVI Podpis: zaznacz „zawsze zezwalaj” i potwierdź.",
                            "Zamknij", null);
                        break;
                    case InstallOutcome.Updated:
                        form.ShowInfo("Zaktualizowano",
                            "Program został zaktualizowany do wersji " + ver + ". Wróć do PS i kliknij „Podpisz”.",
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
                            e.Message = "Nie mogę zapisać programu na tym komputerze. Najczęściej dlatego, że program jest właśnie otwarty.";
                            e.NextStep = "Zamknij okno ENVI Podpis, jeśli jest otwarte, i uruchom ten plik jeszcze raz.";
                            e.Technical = r.Detail;
                            form.ShowError(e);
                            break;
                        }
                    default:
                        form.ShowInfo("ENVI Podpis działa",
                            "Wersja " + ver + ". Program jest zainstalowany i uruchamia się sam z PS. Nie trzeba go otwierać ręcznie.\r\n\r\nCo teraz: wróć do PS i kliknij „Podpisz”.",
                            "Zamknij", null);
                        break;
                }
            };
            Application.Run(form);
            return r.Outcome == InstallOutcome.CopyFailed ? 1 : 0;
        }

        private static int RunUninstall(bool silent)
        {
            Installer.Uninstall();
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
