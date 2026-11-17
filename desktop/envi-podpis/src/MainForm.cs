using System;
using System.Collections.Generic;
using System.Drawing;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal enum Step
    {
        None,
        Loading,
        Files,
        Preparing,
        Pin,
        Signing,
        Sending,
        Done,
        Error,
        Info
    }

    internal sealed class MainForm : Form
    {
        private readonly Label lblTitle = new Label();
        private readonly Label lblBody = new Label();
        private readonly ListView lvFiles = new ListView();
        private readonly Label lblCertCaption = new Label();
        private readonly ComboBox cmbCert = new ComboBox();
        private readonly Label lblPinCaption = new Label();
        private readonly TextBox txtPin = new TextBox();
        private readonly ProgressBar bar = new ProgressBar();
        private readonly Label lblNote = new Label();
        private readonly Button btnPrimary = new Button();
        private readonly Button btnSecondary = new Button();
        private readonly Timer closeTimer = new Timer();

        private Action primaryAction;
        private Action secondaryAction;
        private Step step = Step.None;

        // stan zlecenia
        private string token;
        private ApiClient api;
        private JobInfo job;
        private List<CertCandidate> certs;
        private List<PreparedFile> prepared;
        private bool cancelSent;
        private bool jobFinished;
        private int closeCountdown;
        private Action afterClose;

        public MainForm()
        {
            Text = Config.ProductName;
            Font = new Font("Segoe UI", 10f);
            AutoScaleMode = AutoScaleMode.Font;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = true;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(660, 540);
            // Okno zostaje na wierzchu, zeby mozna je bylo porownac z kodami w PS obok.
            TopMost = true;

            TableLayoutPanel root = new TableLayoutPanel();
            root.Dock = DockStyle.Fill;
            root.ColumnCount = 1;
            root.RowCount = 4;
            root.Padding = new Padding(20, 16, 20, 16);
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

            lblTitle.AutoSize = true;
            lblTitle.Font = new Font("Segoe UI Semibold", 15f);
            lblTitle.Margin = new Padding(0, 0, 0, 8);
            lblBody.AutoSize = true;
            lblBody.Margin = new Padding(0, 0, 0, 12);

            TableLayoutPanel content = new TableLayoutPanel();
            content.Dock = DockStyle.Fill;
            content.ColumnCount = 1;
            content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            content.Margin = new Padding(0);
            content.RowCount = 7;
            content.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            for (int i = 0; i < 6; i++) content.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            lvFiles.Dock = DockStyle.Fill;
            lvFiles.View = View.Details;
            lvFiles.FullRowSelect = true;
            lvFiles.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            lvFiles.HideSelection = true;
            lvFiles.MultiSelect = false;
            lvFiles.Margin = new Padding(0, 0, 0, 10);
            lvFiles.SizeChanged += delegate { FitColumns(); };

            lblCertCaption.AutoSize = true;
            lblCertCaption.Text = "Certyfikat, którym podpiszesz:";
            lblCertCaption.Margin = new Padding(0, 0, 0, 4);
            cmbCert.Dock = DockStyle.Top;
            cmbCert.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbCert.Margin = new Padding(0, 0, 0, 10);

            lblPinCaption.AutoSize = true;
            lblPinCaption.Text = "PIN do karty:";
            lblPinCaption.Margin = new Padding(0, 0, 0, 4);
            txtPin.Dock = DockStyle.Top;
            txtPin.UseSystemPasswordChar = true;
            // Bez tego czytniki ekranu i automatyzacja widza wpisany tekst jako nazwe pola.
            txtPin.AccessibleName = "PIN do karty";
            txtPin.Margin = new Padding(0, 0, 0, 10);
            txtPin.TextChanged += delegate
            {
                if (step == Step.Pin) btnPrimary.Enabled = txtPin.Text.Length > 0;
            };

            bar.Dock = DockStyle.Top;
            bar.Margin = new Padding(0, 4, 0, 10);
            lblNote.AutoSize = true;
            lblNote.ForeColor = Color.FromArgb(70, 70, 70);

            content.Controls.Add(lvFiles, 0, 0);
            content.Controls.Add(lblCertCaption, 0, 1);
            content.Controls.Add(cmbCert, 0, 2);
            content.Controls.Add(lblPinCaption, 0, 3);
            content.Controls.Add(txtPin, 0, 4);
            content.Controls.Add(bar, 0, 5);
            content.Controls.Add(lblNote, 0, 6);

            FlowLayoutPanel buttons = new FlowLayoutPanel();
            buttons.FlowDirection = FlowDirection.RightToLeft;
            buttons.AutoSize = true;
            buttons.Dock = DockStyle.Fill;
            buttons.Margin = new Padding(0, 8, 0, 0);
            StyleButton(btnPrimary);
            StyleButton(btnSecondary);
            btnPrimary.Click += delegate { if (primaryAction != null) primaryAction(); };
            btnSecondary.Click += delegate { if (secondaryAction != null) secondaryAction(); };
            buttons.Controls.Add(btnPrimary);
            buttons.Controls.Add(btnSecondary);

            root.Controls.Add(lblTitle, 0, 0);
            root.Controls.Add(lblBody, 0, 1);
            root.Controls.Add(content, 0, 2);
            root.Controls.Add(buttons, 0, 3);
            Controls.Add(root);
            AcceptButton = btnPrimary;

            closeTimer.Interval = 1000;
            closeTimer.Tick += delegate { OnCloseTick(); };

            Load += delegate { FitLabels(); };
            SizeChanged += delegate { FitLabels(); };
            FormClosing += OnFormClosing;
        }

        private static void StyleButton(Button b)
        {
            b.AutoSize = true;
            b.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            b.MinimumSize = new Size(120, 36);
            b.Padding = new Padding(10, 2, 10, 2);
            b.Margin = new Padding(8, 0, 0, 0);
            b.UseVisualStyleBackColor = true;
        }

        private void FitLabels()
        {
            int w = ClientSize.Width - 40;
            lblTitle.MaximumSize = new Size(w, 0);
            lblBody.MaximumSize = new Size(w, 0);
            lblNote.MaximumSize = new Size(w, 0);
        }

        private void FitColumns()
        {
            if (lvFiles.Columns.Count == 0) return;
            float k = DeviceDpi / 96f;
            int total = lvFiles.ClientSize.Width;
            if (lvFiles.Columns.Count == 1)
            {
                lvFiles.Columns[0].Width = total;
            }
            else
            {
                int pages = (int)(80 * k);
                int code = (int)(150 * k);
                lvFiles.Columns[0].Width = Math.Max(100, total - pages - code);
                lvFiles.Columns[1].Width = pages;
                lvFiles.Columns[2].Width = code;
            }
        }

        // ---------- widoki (kazdy mowi, co sie dzieje i co dalej) ----------

        private void Reset(Step s, string title, string body)
        {
            step = s;
            closeTimer.Stop();
            lblTitle.Text = title;
            lblBody.Text = body;
            lvFiles.Visible = false;
            lblCertCaption.Visible = false;
            cmbCert.Visible = false;
            lblPinCaption.Visible = false;
            lblPinCaption.Text = "PIN do karty:";
            lblPinCaption.ForeColor = SystemColors.ControlText;
            txtPin.Visible = false;
            bar.Visible = false;
            lblNote.Text = "";
            lblNote.ForeColor = Color.FromArgb(70, 70, 70);
            lblNote.Visible = false;
            btnPrimary.Visible = false;
            btnSecondary.Visible = false;
            btnPrimary.Enabled = true;
            btnSecondary.Enabled = true;
            primaryAction = null;
            secondaryAction = null;
            AcceptButton = btnPrimary;
            ClientSize = new Size(ClientSize.Width, 360);
            FitLabels();
        }

        private void SetNote(string text)
        {
            lblNote.Text = text;
            lblNote.Visible = !string.IsNullOrEmpty(text);
        }

        private void SetButtons(string primaryText, Action primary, string secondaryText, Action secondary)
        {
            if (primaryText != null)
            {
                btnPrimary.Text = primaryText;
                btnPrimary.Visible = true;
                primaryAction = primary;
            }
            if (secondaryText != null)
            {
                btnSecondary.Text = secondaryText;
                btnSecondary.Visible = true;
                secondaryAction = secondary;
            }
        }

        public void ShowLoading()
        {
            Reset(Step.Loading, "Łączę z PS…", "Pobieram z PS listę plików do podpisania. To potrwa kilka sekund.");
            bar.Style = ProgressBarStyle.Marquee;
            bar.Visible = true;
            SetButtons(null, null, "Anuluj", OnCancelClicked);
        }

        public void ShowInfo(string title, string body, string buttonText, Action onClose)
        {
            Reset(Step.Info, title, body);
            afterClose = onClose;
            SetButtons(buttonText, delegate { Close(); }, null, null);
        }

        public void ShowFiles(List<string> names, List<CertCandidate> candidates, string preferredThumbprint)
        {
            Reset(Step.Files,
                "Do podpisania: " + Messages.FilesCount(names.Count),
                "Te pliki podpiszesz swoim certyfikatem kwalifikowanym. Na razie niczego nie podpisujemy i nie pytamy o PIN.");
            lvFiles.Columns.Clear();
            lvFiles.Columns.Add("Plik", 400);
            lvFiles.Items.Clear();
            foreach (string n in names) lvFiles.Items.Add(new ListViewItem(n));
            lvFiles.Visible = true;
            ClientSize = new Size(ClientSize.Width, 540);
            FitColumns();

            certs = candidates;
            cmbCert.Items.Clear();
            int selected = 0;
            for (int i = 0; i < candidates.Count; i++)
            {
                cmbCert.Items.Add(candidates[i]);
                if (preferredThumbprint != null && string.Equals(candidates[i].Thumbprint, preferredThumbprint, StringComparison.OrdinalIgnoreCase)) selected = i;
            }
            cmbCert.SelectedIndex = selected;
            lblCertCaption.Text = candidates.Count > 1 ? "Wybierz certyfikat, którym podpiszesz:" : "Certyfikat, którym podpiszesz:";
            lblCertCaption.Visible = true;
            cmbCert.Visible = true;
            SetNote("Co dalej: kliknij „Podpisz”. Zobaczysz kody kontrolne plików i dopiero wtedy wpiszesz PIN.");
            SetButtons("Podpisz", OnSignClicked, "Anuluj", OnCancelClicked);
        }

        public void ShowPreparing()
        {
            Reset(Step.Preparing, "Przygotowuję pliki w PS…",
                "PS dodaje do dokumentów grafikę podpisu z Twoim nazwiskiem i liczy kody kontrolne. Zwykle trwa to od kilku do kilkunastu sekund. Nie zamykaj tego okna.");
            bar.Style = ProgressBarStyle.Marquee;
            bar.Visible = true;
            SetNote("Co dalej: po chwili pojawią się kody kontrolne do porównania z PS.");
            SetButtons(null, null, "Anuluj", OnCancelClicked);
        }

        public void ShowPin(List<PreparedFile> files)
        {
            Reset(Step.Pin, "Sprawdź kody i wpisz PIN",
                "Sprawdź, czy kody zgadzają się z tymi w PS. Jeśli któryś się różni, kliknij „Anuluj” i niczego nie podpisuj.");
            lvFiles.Columns.Clear();
            lvFiles.Columns.Add("Plik", 300);
            lvFiles.Columns.Add("Strony", 80);
            lvFiles.Columns.Add("Kod kontrolny", 150);
            lvFiles.Items.Clear();
            Font codeFont = new Font("Consolas", 11f, FontStyle.Bold);
            foreach (PreparedFile f in files)
            {
                ListViewItem it = new ListViewItem(f.Name);
                it.UseItemStyleForSubItems = false;
                it.SubItems.Add(f.Pages > 0 ? f.Pages.ToString() : "-");
                ListViewItem.ListViewSubItem code = it.SubItems.Add(f.CheckCode);
                code.Font = codeFont;
                lvFiles.Items.Add(it);
            }
            lvFiles.Visible = true;
            ClientSize = new Size(ClientSize.Width, 540);
            FitColumns();
            lblPinCaption.Visible = true;
            txtPin.Visible = true;
            txtPin.Clear();
            SetNote("Wpisz PIN tylko tutaj. Program nie zapisuje go ani nie wysyła. Jeśli PIN będzie błędny, program od razu się zatrzyma, bo karta liczy błędne próby.");
            SetButtons("Podpisz " + Messages.FilesCount(files.Count), OnPinSignClicked, "Anuluj", OnCancelClicked);
            btnPrimary.Enabled = false;
            txtPin.Focus();
        }

        public void ShowSigning(int index, int total)
        {
            if (step != Step.Signing)
            {
                Reset(Step.Signing, "", "Nie wyjmuj karty i nie zamykaj okna. Podpisanie jednego pliku trwa około sekundy.");
                bar.Visible = true;
                bar.Style = ProgressBarStyle.Continuous;
                SetNote("Co dalej: nic nie trzeba robić. Za chwilę wyślę podpisy do PS.");
            }
            lblTitle.Text = "Podpisuję " + (index + 1) + " z " + total + "…";
            bar.Minimum = 0;
            bar.Maximum = total;
            bar.Value = Math.Min(index, total);
        }

        public void ShowSending()
        {
            Reset(Step.Sending, "Wysyłam podpisy do PS…",
                "PS składa podpisane pliki i zapisuje je w folderze pisma. To może potrwać kilkanaście sekund. Nie zamykaj okna.");
            bar.Style = ProgressBarStyle.Marquee;
            bar.Visible = true;
            SetNote("Co dalej: gdy skończę, zobaczysz tu „Gotowe”.");
        }

        public void ShowDone()
        {
            Reset(Step.Done, "Gotowe — wróć do PS", "");
            jobFinished = true;
            closeCountdown = 6;
            SetButtons("Zamknij", delegate { Close(); }, null, null);
            SetNote("Podpisane pliki są zapisane w folderze pisma w PS.");
            UpdateCloseText();
            closeTimer.Start();
        }

        public void ShowError(ErrorInfo e)
        {
            Reset(Step.Error, e.Title, e.Message);
            SetNote("Co teraz: " + e.NextStep);
            lblNote.ForeColor = Color.Black;
            if (!string.IsNullOrEmpty(e.Technical))
            {
                lblPinCaption.Text = "Kod do zgłoszenia (jeśli będzie potrzebny): " + e.Technical;
                lblPinCaption.ForeColor = Color.FromArgb(110, 110, 110);
                lblPinCaption.Visible = true;
            }
            SetButtons("Zamknij", delegate { Close(); }, null, null);
        }

        private void UpdateCloseText()
        {
            lblBody.Text = "Okno zamknie się samo za " + closeCountdown + " s. Możesz je też zamknąć teraz.";
        }

        private void OnCloseTick()
        {
            closeCountdown--;
            if (closeCountdown <= 0)
            {
                closeTimer.Stop();
                Close();
                return;
            }
            UpdateCloseText();
        }

        // ---------- przebieg zlecenia ----------

        public async void RunJob(string jobToken)
        {
            token = jobToken;
            ShowLoading();

            JobInfo loaded = null;
            ApiClient usedApi = null;
            ErrorInfo err = null;
            await Task.Run(delegate
            {
                try { loaded = FindJob(jobToken, out usedApi); }
                catch (ApiException ex) { err = Messages.FromApi(ex); }
                catch (Exception ex) { err = Messages.Unexpected(ex); }
            });
            if (IsDisposed) return;
            if (err != null) { Fail(err, false); return; }
            job = loaded;
            api = usedApi;

            string st = (job.Status ?? "").ToLowerInvariant();
            if (st == "expired" || st == "cancelled" || st == "canceled" || st == "done" || st == "failed")
            {
                Fail(Messages.FromJobStatus(st), false);
                return;
            }

            Version min;
            if (!string.IsNullOrEmpty(job.MinProgramVersion) && Version.TryParse(job.MinProgramVersion, out min) && min > Config.CurrentVersion)
            {
                Fail(Messages.OutdatedProgram(job.MinProgramVersion), false);
                return;
            }

            await FindCertificatesAndShow();
        }

        private async Task FindCertificatesAndShow()
        {
            ShowLoading();
            lblTitle.Text = "Szukam certyfikatu na karcie…";
            lblBody.Text = "Sprawdzam, który certyfikat kwalifikowany jest dostępny w Windows.";
            List<CertCandidate> found = null;
            int skipped = 0;
            ErrorInfo err = null;
            await Task.Run(delegate
            {
                try { found = CertStore.FindQualified(out skipped); }
                catch (Exception ex) { err = Messages.Unexpected(ex); }
            });
            if (IsDisposed) return;
            if (err != null) { Fail(err, true); return; }
            if (found.Count == 0)
            {
                ErrorInfo e = Messages.NoCertificate(skipped);
                Reset(Step.Error, e.Title, e.Message);
                SetNote("Co teraz: " + e.NextStep);
                lblNote.ForeColor = Color.Black;
                if (skipped > 0) SetButtons("Zamknij", delegate { Close(); }, null, null);
                else SetButtons("Szukaj ponownie", async delegate { await FindCertificatesAndShow(); }, "Anuluj", OnCancelClicked);
                return;
            }
            ShowFiles(job.FileNames, found, CertStore.LoadLastThumbprint());
        }

        private JobInfo FindJob(string jobToken, out ApiClient usedApi)
        {
            string[] hosts = Config.AllowedBaseUrls;
            ApiException last = null;
            for (int i = 0; i < hosts.Length; i++)
            {
                ApiClient c = new ApiClient(hosts[i]);
                try
                {
                    JobInfo j = c.GetJob(jobToken);
                    usedApi = c;
                    return j;
                }
                catch (ApiException ex)
                {
                    last = ex;
                    bool tryNext = (ex.Status == 404 || ex.NoConnection) && i < hosts.Length - 1;
                    if (!tryNext) throw;
                }
            }
            throw last ?? new ApiException("Brak adresu PS.");
        }

        private async void OnSignClicked()
        {
            CertCandidate sel = cmbCert.SelectedItem as CertCandidate;
            if (sel == null) return;
            CertStore.SaveLastThumbprint(sel.Thumbprint);
            ShowPreparing();

            List<PreparedFile> files = null;
            ErrorInfo err = null;
            ApiClient client = api;
            string tk = token;
            await Task.Run(delegate
            {
                try
                {
                    List<string> chain = CertStore.BuildChainBase64(sel.Cert);
                    files = client.SubmitCertificate(tk, chain);
                }
                catch (ApiException ex) { err = Messages.FromApi(ex); }
                catch (Exception ex) { err = Messages.Unexpected(ex); }
            });
            if (IsDisposed || cancelSent) return;
            if (err != null) { Fail(err, true); return; }
            if (files.Count != job.FileNames.Count || files.Count == 0) { Fail(Messages.WrongFileCount(), true); return; }
            foreach (PreparedFile f in files)
            {
                if (!string.IsNullOrEmpty(f.ServerCheckCode) && ApiClient.NormalizeCode(f.ServerCheckCode) != ApiClient.NormalizeCode(f.CheckCode))
                {
                    Fail(Messages.CodesDiffer(), true);
                    return;
                }
            }
            prepared = files;
            ShowPin(files);
        }

        private async void OnPinSignClicked()
        {
            if (txtPin.Text.Length == 0) return;
            CertCandidate sel = cmbCert.SelectedItem as CertCandidate;
            X509Certificate2 cert = sel.Cert;
            List<PreparedFile> files = prepared;

            // PIN tylko jako bajty w pamieci, na czas tej serii; po niej zerowany.
            byte[] pin = Encoding.Unicode.GetBytes(txtPin.Text + "\0");
            txtPin.Clear();

            List<byte[]> hashes = new List<byte[]>();
            foreach (PreparedFile f in files) hashes.Add(f.Hash);

            ShowSigning(0, files.Count);
            List<byte[]> signatures = null;
            SigningException serr = null;
            Exception other = null;
            await Task.Run(delegate
            {
                try
                {
                    signatures = SignatureBatch.Run(cert, pin, hashes, delegate (int i, int n)
                    {
                        try { BeginInvoke(new Action(delegate { ShowSigning(i, n); })); } catch (Exception) { }
                    });
                }
                catch (SigningException ex) { serr = ex; }
                catch (Exception ex) { other = ex; }
                finally { Array.Clear(pin, 0, pin.Length); }
            });
            if (IsDisposed) return;
            if (serr != null) { Fail(Messages.FromSigning(serr, files.Count), true); return; }
            if (other != null) { Fail(Messages.Unexpected(other), true); return; }

            ShowSending();
            string status = null;
            ApiException sendErr = null;
            ApiClient client = api;
            string tk = token;
            await Task.Run(delegate
            {
                try { status = client.SubmitSignatures(tk, signatures); }
                catch (ApiException ex) { sendErr = ex; }
            });
            if (IsDisposed) return;
            if (sendErr != null) { Fail(Messages.SendFailed(sendErr), false); return; }

            string s = (status ?? "").ToLowerInvariant();
            if (s == "failed" || s == "cancelled" || s == "canceled" || s == "expired")
            {
                ErrorInfo e = new ErrorInfo();
                e.Title = "PS nie zapisał podpisów";
                e.Message = "Podpisy zostały złożone, ale PS ich nie przyjął (status: " + s + ").";
                e.NextStep = "Wróć do PS i kliknij „Podpisz” jeszcze raz.";
                Fail(e, false);
                return;
            }
            ShowDone();
        }

        private void OnCancelClicked()
        {
            Close();   // FormClosing wysyla anulowanie do PS
        }

        // Pokazuje blad od razu; opcjonalnie anuluje zlecenie w PS (zeby PS nie czekal w nieskonczonosc).
        private void Fail(ErrorInfo e, bool cancelJob)
        {
            ShowError(e);
            jobFinished = true;
            if (cancelJob && e.CancelReason != null) SendCancel(e.CancelReason, 4000);
        }

        private void SendCancel(string reason, int waitMs)
        {
            if (cancelSent || api == null || token == null) return;
            cancelSent = true;
            ApiClient client = api;
            string tk = token;
            Task t = Task.Run(delegate
            {
                try { client.Cancel(tk, reason); } catch (Exception) { }
            });
            try { t.Wait(waitMs); } catch (Exception) { }
        }

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            if (step == Step.Signing || step == Step.Sending)
            {
                if (e.CloseReason == CloseReason.UserClosing)
                {
                    e.Cancel = true;
                    SetNote("Poczekaj, aż program skończy — zamknięcie teraz przerwałoby podpisywanie.");
                    return;
                }
            }
            if (!jobFinished && token != null && api != null && (step == Step.Files || step == Step.Preparing || step == Step.Pin || step == Step.Loading))
            {
                SendCancel("user_cancelled", 4000);
            }
            if (txtPin != null) txtPin.Clear();
            if (afterClose != null) afterClose();
        }
    }
}
