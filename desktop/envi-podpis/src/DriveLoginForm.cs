using System;
using System.Drawing;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal sealed class DriveLoginForm : Form
    {
        private readonly DriveAuth auth;
        private readonly Label status = new Label();
        private readonly Button import = new Button();
        private readonly Button login = new Button();
        private readonly Button logout = new Button();
        private readonly Button cancel = new Button();
        private CancellationTokenSource operation;

        internal DriveLoginForm(DriveAuth account = null)
        {
            auth = account ?? new DriveAuth();
            Text = "ENVI Podpis — konto Google"; Font = new Font("Segoe UI", 10);
            ClientSize = new Size(640, 310); MinimumSize = new Size(550, 340);
            StartPosition = FormStartPosition.CenterParent;
            TableLayoutPanel root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), ColumnCount = 1, RowCount = 4 };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize)); root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.Controls.Add(new Label { Text = "Połącz z Dyskiem Google", AutoSize = true, Font = new Font("Segoe UI Semibold", 17) }, 0, 0);
            Label explanation = new Label { Text = "Wybierz pobrany JSON ENVI Podpis. Konfiguracja i zapamiętana zgoda zostaną zaszyfrowane na Twoim koncie Windows. Hasło Google wpisujesz wyłącznie w przeglądarce.", AutoSize = true, Dock = DockStyle.Fill, Padding = new Padding(0, 12, 0, 12) };
            root.Controls.Add(explanation, 0, 1);
            status.AutoSize = true; status.Dock = DockStyle.Fill; status.AccessibleName = "Stan połączenia Google"; root.Controls.Add(status, 0, 2);
            FlowLayoutPanel buttons = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
            import.Text = "Wybierz JSON…"; login.Text = "Zaloguj Google"; logout.Text = "Wyloguj lokalnie"; cancel.Text = "Zamknij";
            foreach (Button button in new[] { import, login, logout, cancel }) { button.AutoSize = true; button.MinimumSize = new Size(110, 36); buttons.Controls.Add(button); }
            root.Controls.Add(buttons, 0, 3); Controls.Add(root);
            import.Click += delegate {
                using (OpenFileDialog dialog = new OpenFileDialog { Filter = "Konfiguracja Google (*.json)|*.json", Title = "Wybierz JSON ENVI Podpis — plik pozostaje lokalnie" })
                    if (dialog.ShowDialog(this) == DialogResult.OK)
                        try { auth.Import(dialog.FileName); RefreshState(); status.Text += "\r\nOryginalny JSON pozostaje w dotychczasowym miejscu."; }
                        catch (Exception ex) { RefreshState(); status.Text = ex.Message; }
            };
            login.Click += async delegate { await Login(); };
            logout.Click += delegate {
                try { auth.Logout(); RefreshState(); status.Text = "Wylogowano na tym komputerze. Konfiguracja została zachowana.\r\nCofnięcie zgody w Google jest dostępne w ustawieniach konta Google → Połączenia z aplikacjami."; }
                catch (Exception ex) { RefreshState(); status.Text = ex.Message; }
            };
            cancel.Click += delegate { if (operation != null) operation.Cancel(); else Close(); };
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (operation != null) { e.Cancel = true; operation.Cancel(); } };
            RefreshState();
        }

        private void RefreshState()
        {
            bool configured = false;
            bool connected = false;
            string message;
            try { configured = auth.Configured; connected = auth.Connected; message = connected ? "Zapamiętano zgodę Google. Dostępność połączenia zostanie sprawdzona przy użyciu Dysku." : configured ? "Konfiguracja zapisana. Zaloguj się kontem organizacji ENVI.\r\nGoogle poprosi o szeroki dostęp do Dysku, zgodnie z wybranym modelem obsługi folderów." : "Najpierw wybierz pobrany JSON klienta ENVI Podpis."; }
            catch (Exception ex) { message = ex.Message; configured = false; }
            import.Enabled = operation == null; login.Enabled = operation == null && configured && !connected; logout.Enabled = operation == null && connected;
            cancel.Text = operation == null ? "Zamknij" : "Przerwij"; status.Text = message;
        }

        private async Task Login()
        {
            operation = new CancellationTokenSource(); RefreshState();
            status.Text = "Dokończ logowanie i zgodę w przeglądarce.\r\nOczekiwanie do 3 minut. Możesz przerwać przyciskiem poniżej.";
            string result;
            try { await auth.Login(operation.Token); result = "Zalogowano. Zgoda Google jest zapisana i zaszyfrowana lokalnie.\r\nNie pobrano ani nie zmieniono żadnego dokumentu."; }
            catch (OperationCanceledException) { result = "Przerwano logowanie. Nie zapisano nowej zgody."; }
            catch (InvalidOperationException ex) { result = ex.Message; }
            catch (Exception) { result = "Nie ukończono logowania. Sprawdź połączenie, zgodę Google i konfigurację klienta. Możesz spróbować ponownie."; }
            finally { operation.Dispose(); operation = null; }
            RefreshState(); status.Text = result;
        }
    }
}
