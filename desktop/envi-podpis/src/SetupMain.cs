using System;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class SetupMain
    {
        [STAThread]
        private static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            bool rollback = false, silent = false;
            foreach (string arg in args)
            {
                if (arg == "/rollback") rollback = true;
                else if (arg == "/silent") silent = true;
                else return 1;
            }
            if (!Environment.Is64BitOperatingSystem)
            {
                if (!silent) MessageBox.Show("Ta paczka wymaga Windows x64.", "ENVI Podpis");
                return 1;
            }
            if (!silent)
            {
                DialogResult answer = MessageBox.Show(rollback
                    ? "Przywrócić poprzednią wersję ENVI Podpis? Zamknij najpierw wszystkie okna programu."
                    : "Zainstalować lub naprawić ENVI Podpis " + Config.VersionText + "?\r\n\r\nZamknij najpierw wszystkie okna programu. Instalacja jest tylko dla bieżącego użytkownika i tworzy skrót na pulpicie. Podpisywanie z PS pozostaje dostępne.\r\n\r\nPliki programu: " + Installer.InstallDir,
                    "ENVI Podpis — instalator", MessageBoxButtons.OKCancel, MessageBoxIcon.Information);
                if (answer != DialogResult.OK) return 0;
            }
            InstallResult result = null;
            string extracted = Path.Combine(Path.GetTempPath(), "EnviPodpis-setup-" + Guid.NewGuid().ToString("N"));
            using (Form progress = new Form())
            {
                progress.Text = "ENVI Podpis — instalator"; progress.ClientSize = new Size(520, 130);
                progress.StartPosition = FormStartPosition.CenterScreen; progress.ControlBox = false;
                Label text = new Label { Text = "Sprawdzam i instaluję paczkę. Poczekaj…", AutoSize = true, Location = new Point(20, 25) };
                progress.Controls.Add(text);
                Action install = delegate
                {
                    try
                    {
                        if (!rollback) Extract(extracted);
                        result = Installer.InstallOrUpdate(extracted, rollback);
                    }
                    catch (Exception ex) { result = new InstallResult { Outcome = InstallOutcome.CopyFailed, Detail = ex.Message }; }
                    finally { try { Installer.RemoveTree(extracted); } catch (IOException) { } catch (UnauthorizedAccessException) { } }
                };
                if (silent) install();
                else
                {
                    progress.FormClosing += delegate(object sender, FormClosingEventArgs e) { e.Cancel = result == null; };
                    progress.Shown += delegate
                    {
                        Thread thread = new Thread(delegate() { install(); progress.BeginInvoke(new Action(progress.Close)); });
                        thread.SetApartmentState(ApartmentState.STA);
                        thread.Start();
                    };
                    Application.Run(progress);
                }
            }
            return Program.ShowInstallResult(result, silent);
        }
        internal static void Extract(string directory)
        {
            Directory.CreateDirectory(directory);
            using (Stream embedded = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
            {
                if (embedded == null) throw new IOException("Brakuje zawartości instalatora.");
                using (ZipArchive zip = new ZipArchive(embedded, ZipArchiveMode.Read))
                    foreach (ZipArchiveEntry entry in zip.Entries)
                    {
                        if (entry.FullName.EndsWith("/")) continue;
                        string file = Installer.PayloadPath(directory, entry.FullName);
                        Directory.CreateDirectory(Path.GetDirectoryName(file));
                        using (Stream input = entry.Open())
                        using (Stream output = new FileStream(file, FileMode.CreateNew)) input.CopyTo(output);
                    }
            }
            Installer.VerifyPayload(directory);
        }
    }
}
