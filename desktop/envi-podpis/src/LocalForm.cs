using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal sealed class LocalForm : Form
    {
        private readonly string package;
        private readonly List<LocalDocument> documents = new List<LocalDocument>();
        private readonly DataGridView files = new DataGridView();
        private readonly ComboBox certificate = new ComboBox();
        private readonly Label note = new Label();
        private readonly ProgressBar progress = new ProgressBar { Dock = DockStyle.Top, Height = 8, Style = ProgressBarStyle.Marquee, Visible = false, AccessibleName = "Trwa przygotowanie dokumentu" };
        private readonly Label destination = new Label();
        private readonly FlowLayoutPanel actions = new FlowLayoutPanel();
        private readonly Button prepare = new Button();
        private readonly Button sign = new Button();
        private readonly Button cancel = new Button();
        private readonly Button save = new Button();
        private CancellationTokenSource operation;
        private bool busy;
        private string outputDirectory;
        private readonly DriveAuth driveAuth = new DriveAuth();
        private bool loading;
        private bool automaticReview = true;
        private bool testCertificate = false;

        public LocalForm(string workerPackage)
        {
            package = workerPackage;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Text = "ENVI Podpis"; Font = new Font("Segoe UI", 10);
            ClientSize = new Size(1000, 650); MinimumSize = new Size(780, 560);
            StartPosition = FormStartPosition.CenterScreen;
            TableLayoutPanel root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 7 };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            for (int i = 0; i < 7; i++) root.RowStyles.Add(new RowStyle(i == 2 ? SizeType.Percent : SizeType.AutoSize, i == 2 ? 100 : 0));
            Label title = new Label { Text = "Sprawdź dokument i podpisz", AutoSize = true, Font = new Font("Segoe UI Semibold", 17) };
            Label intro = new Label { Text = "Wybierz dokument z komputera, Dysku lub poczty. Sprawdź podgląd i wpisz PIN. Kopie zapiszą się automatycznie; oryginały pozostają bez zmian.", AutoSize = true, Padding = new Padding(0, 6, 0, 12) };
            files.Dock = DockStyle.Fill; files.AllowUserToAddRows = false; files.AllowUserToDeleteRows = false;
            files.AllowUserToResizeRows = false; files.RowHeadersVisible = false; files.AutoGenerateColumns = false;
            files.SelectionMode = DataGridViewSelectionMode.FullRowSelect; files.MultiSelect = false;
            files.BackgroundColor = Color.White; files.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            files.Columns.Add(new DataGridViewTextBoxColumn { Name = "name", HeaderText = "Wybrany plik", ReadOnly = true, FillWeight = 40 });
            files.Columns.Add(new DataGridViewCheckBoxColumn { Name = "graphic", HeaderText = "Grafika", FillWeight = 10 });
            files.Columns.Add(new DataGridViewTextBoxColumn { Name = "state", HeaderText = "Stan", ReadOnly = true, FillWeight = 18 });
            files.Columns.Add(new DataGridViewTextBoxColumn { Name = "result", HeaderText = "Wynik / co zrobić", ReadOnly = true, FillWeight = 32 });
            files.CurrentCellDirtyStateChanged += delegate { if (files.IsCurrentCellDirty) files.CommitEdit(DataGridViewDataErrorContexts.Commit); };
            files.CellValueChanged += delegate(object sender, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex < 0 || e.ColumnIndex != 1) return;
                LocalDocument doc = files.Rows[e.RowIndex].Tag as LocalDocument;
                if (doc == null || doc.SignAttempted) return;
                doc.Graphic = Convert.ToBoolean(files.Rows[e.RowIndex].Cells[1].Value);
                doc.ResetPreview(); RefreshRow(doc); UpdateButtons();
            };
            files.SelectionChanged += delegate { UpdateButtons(); };
            AllowDrop = true; files.AllowDrop = true;
            DragEventHandler over = delegate(object sender, DragEventArgs e) { if (!busy && e.Data.GetDataPresent(DataFormats.FileDrop)) e.Effect = DragDropEffects.Copy; };
            DragEventHandler drop = async delegate(object sender, DragEventArgs e) { if (!busy) await AddFiles((string[])e.Data.GetData(DataFormats.FileDrop)); };
            DragEnter += over; DragDrop += drop; files.DragEnter += over; files.DragDrop += drop;

            actions.AutoSize = true; actions.Dock = DockStyle.Fill;
            AddButton(actions, "Z Dysku…", async delegate { try { await FromDrive(); } catch (Exception ex) { note.Text = ex.Message; } });
            AddButton(actions, "Z poczty…", async delegate { try { await FromMail(); } catch (Exception ex) { note.Text = ex.Message; } });
            AddButton(actions, "Dodaj PDF…", async delegate {
                using (OpenFileDialog dialog = new OpenFileDialog { Filter = "PDF (*.pdf)|*.pdf", Multiselect = true })
                    if (dialog.ShowDialog(this) == DialogResult.OK) await AddFiles(dialog.FileNames);
            });
            AddButton(actions, "Usuń z listy", delegate {
                LocalDocument doc = Selected();
                if (files.SelectedRows.Count == 0) return;
                if (doc != null) {
                    if (doc.RecoveryPath != null) { note.Text = "Podpisana kopia czeka na dostarczenie. Najpierw zapisz / dostarcz ją przyciskiem poniżej."; return; }
                    doc.Dispose(); documents.Remove(doc);
                }
                files.Rows.RemoveAt(files.SelectedRows[0].Index); UpdateButtons();
            });
            AddButton(actions, "Miejsce kopii…", async delegate {
                try {
                LocalDocument doc = Selected();
                if (doc != null && doc.Origin == "drive")
                {
                    if (doc.SignAttempted && doc.RecoveryPath == null) { note.Text = "Ta kopia została już zapisana na Dysku."; return; }
                    if (doc.UploadContext != null)
                    {
                        bool absent = false;
                        await WithOperation(async delegate {
                            using (DriveFiles client = new DriveFiles(driveAuth))
                            {
                                string existing = await client.ExistingUpload(DriveJob(doc.UploadContext), operation.Token);
                                if (existing == null) absent = true;
                                else { WorkflowStore.Complete(doc); doc.Status = "Kopia była już zapisana"; doc.Error = existing; RefreshRow(doc); note.Text = "Potwierdzono wcześniejszy zapis: " + existing; }
                            }
                        });
                        if (!absent) return;
                    }
                    using (DriveFilesForm picker = new DriveFilesForm(driveAuth, true))
                    {
                        if (picker.ShowDialog(this) != DialogResult.OK) return;
                        DriveFile source = DriveSource(doc.SourceContext); source.ParentId = picker.SelectedFile.Id; doc.SourceContext = source;
                        if (doc.UploadContext != null) { DriveUpload job = DriveJob(doc.UploadContext); job.ParentId = source.ParentId; doc.UploadContext = job; }
                        WorkflowStore.Retain(doc); note.Text = "Kopia na Dysku: " + picker.SelectedFile.Name + ". Wybierz Zapisz / dostarcz ponownie.";
                    }
                }
                else using (FolderBrowserDialog dialog = new FolderBrowserDialog { Description = "Gdzie zapisać podpisane kopie PDF?", SelectedPath = outputDirectory ?? "" })
                {
                    if (dialog.ShowDialog(this) != DialogResult.OK) return;
                    if (doc != null && doc.Origin == "mail") { doc.TargetDirectory = dialog.SelectedPath; WorkflowStore.Retain(doc); }
                    else { outputDirectory = dialog.SelectedPath; WorkflowStore.Setting("destination", outputDirectory); }
                    UpdateButtons();
                }
                } catch (Exception ex) { note.Text = ex.Message; }
            });
            AddButton(actions, "Kopie obok oryginału", delegate { outputDirectory = null; WorkflowStore.Setting("destination", ""); UpdateButtons(); });
            AddButton(actions, "Odśwież kartę", delegate { ReloadCertificates(); });
            destination.AutoSize = true;
            try { outputDirectory = Json.GetString(WorkflowStore.Settings(), "destination"); } catch (Exception ex) { note.Text = "Nie odczytano ustawień: " + ex.Message; }
            certificate.Dock = DockStyle.Top; certificate.DropDownStyle = ComboBoxStyle.DropDownList; certificate.AccessibleName = "Certyfikat do podpisu";
            certificate.SelectedIndexChanged += delegate {
                if (loading) return;
                foreach (LocalDocument doc in documents.Where(d => !d.SignAttempted)) { doc.ResetPreview(); RefreshRow(doc); }
                UpdateButtons();
            };
            FlowLayoutPanel footer = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill };
            Setup(prepare, "Podgląd / miejsce"); prepare.Click += async delegate { await WithOperation(PreviewSelected); };
            Setup(sign, "Sprawdź i podpisz"); sign.Click += async delegate { await WithOperation(ReviewAndSign); };
            Setup(save, "Zapisz / dostarcz ponownie"); save.Click += async delegate { await WithOperation(async delegate {
                LocalDocument doc = Selected(); if (doc == null || doc.ValidatedCopy == null) return;
                await Deliver(doc); RefreshRow(doc); await ReplyToMail();
            }); };
            Setup(cancel, "Przerwij"); cancel.Click += delegate { if (operation != null) { operation.Cancel(); note.Text = "Przerywanie. Trwający podpis karty zostanie sprawdzony i zapisany przed zatrzymaniem."; } };
            footer.Controls.Add(prepare); footer.Controls.Add(sign); footer.Controls.Add(save); footer.Controls.Add(cancel);
            note.AutoSize = true; note.Padding = new Padding(0, 10, 0, 0);
            note.Text = "Podpisy są sprawdzane kryptograficznie lokalnie. Zaufanie do certyfikatu i unieważnienia online nie są tutaj sprawdzane.";
            TableLayoutPanel settings = new TableLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, ColumnCount = 1 };
            settings.Controls.Add(new Label { Text = "Certyfikat do podpisu:", AutoSize = true }); settings.Controls.Add(certificate);
            settings.Controls.Add(destination); settings.Controls.Add(progress);
            root.Controls.Add(title, 0, 0); root.Controls.Add(intro, 0, 1); root.Controls.Add(files, 0, 2);
            root.Controls.Add(actions, 0, 3); root.Controls.Add(settings, 0, 4); root.Controls.Add(footer, 0, 5); root.Controls.Add(note, 0, 6);
            Controls.Add(root);
            SizeChanged += delegate { intro.MaximumSize = note.MaximumSize = destination.MaximumSize = new Size(Math.Max(300, ClientSize.Width - 40), 0); };
            intro.MaximumSize = note.MaximumSize = destination.MaximumSize = new Size(ClientSize.Width - 40, 0);
            Shown += delegate {
                if (!testCertificate) ReloadCertificates();
                foreach (LocalDocument doc in WorkflowStore.Recover(delegate(string message) { note.Text = message; }))
                { documents.Add(doc); AddRow(doc); }
                UpdateButtons();
            };
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) { e.Cancel = true; operation.Cancel(); note.Text = "Poczekaj na zatrzymanie operacji, potem zamknij okno."; } };
            FormClosed += delegate {
                foreach (LocalDocument doc in documents) doc.Dispose();
                foreach (CertCandidate cc in certificate.Items) cc.Cert.Reset();
            };
        }

        private void ReloadCertificates()
        {
            if (busy) return;
            string previous = Cert() == null ? null : Cert().Thumbprint;
            loading = true;
            try
            {
                foreach (CertCandidate cc in certificate.Items) cc.Cert.Reset();
                certificate.Items.Clear(); int skipped;
                foreach (CertCandidate cc in CertStore.FindQualified(out skipped)) certificate.Items.Add(cc);
                string preferred = previous ?? Json.GetString(WorkflowStore.Settings(), "certificate");
                foreach (CertCandidate cc in certificate.Items) if (cc.Thumbprint == preferred) certificate.SelectedItem = cc;
                if (certificate.SelectedIndex < 0 && certificate.Items.Count > 0) certificate.SelectedIndex = 0;
            }
            catch (Exception ex) { note.Text = "Nie odczytano karty: " + ex.Message; }
            finally { loading = false; }
            foreach (LocalDocument doc in documents.Where(d => !d.SignAttempted)) { doc.ResetPreview(); RefreshRow(doc); }
            UpdateButtons();
        }

        private void AddRow(LocalDocument doc)
        {
            int index = files.Rows.Add(Path.GetFileName(doc.Source), doc.Graphic, doc.Status, doc.Output ?? "");
            files.Rows[index].Tag = doc; files.Rows[index].Cells[0].ToolTipText = doc.Source;
            files.Rows[index].Cells[1].ReadOnly = doc.SignAttempted;
            files.ClearSelection(); files.Rows[index].Selected = true;
        }

        private static void Setup(Button b, string text) { b.Text = text; b.AutoSize = true; b.MinimumSize = new Size(90, 36); }
        private static void AddButton(FlowLayoutPanel panel, string text, Action action)
        { Button b = new Button(); Setup(b, text); b.Click += delegate { action(); }; panel.Controls.Add(b); }
        private LocalDocument Selected() { return files.SelectedRows.Count == 0 ? null : files.SelectedRows[0].Tag as LocalDocument; }
        private CertCandidate Cert() { return certificate.SelectedItem as CertCandidate; }

        internal async Task AddFiles(string[] paths, Action<LocalDocument> configure = null)
        {
            await WithOperation(async delegate {
                foreach (string path in paths)
                {
                    if (operation.IsCancellationRequested) break;
                    LocalDocument doc = null;
                    try
                    {
                        if (documents.Any(d => string.Equals(d.Source, Path.GetFullPath(path), StringComparison.OrdinalIgnoreCase))) continue;
                        // shortcut: one live worker per confirmed file; use shared document handles before allowing larger batches.
                        if (documents.Count >= 8) throw new IOException("Lista mieści do 8 PDF. Usuń z listy zapisane pliki przed dodaniem kolejnych.");
                        if (documents.Sum(d => d.Original == null ? 0L : (long)d.Original.Length) + new FileInfo(path).Length > 256L * 1024 * 1024)
                            throw new IOException("Lista przekracza 256 MiB. Podpisz mniejszą partię.");
                        note.Text = "Ładowanie PDF: " + Path.GetFileName(path) + ". Poczekaj na podgląd dokumentu…"; note.Refresh();
                        doc = LocalDocument.Load(path);
                        using (PdfWorker worker = await PdfWorker.Start(package, operation.Token))
                            doc.Info = await worker.Request(new { op = "inspect", pdf = Convert.ToBase64String(doc.Original) }, operation.Token);
                        doc.TargetDirectory = WorkflowStore.Destination(doc.Source, outputDirectory);
                        if (configure != null) configure(doc);
                        documents.Add(doc); AddRow(doc);
                    }
                    catch (OperationCanceledException) { if (doc != null) doc.Dispose(); break; }
                    catch (Exception ex)
                    {
                        if (doc != null) doc.Dispose();
                        int index = files.Rows.Add(Path.GetFileName(path), false, "Błąd", ex.Message);
                        files.Rows[index].Cells[1].ReadOnly = true;
                        files.Rows[index].Cells[3].ToolTipText = ex.Message;
                        note.Text = Path.GetFileName(path) + ": " + ex.Message;
                    }
                }
                if (automaticReview) await ReviewAndSign();
            });
        }

        private async Task FromDrive()
        {
            DriveFile source;
            using (DriveFilesForm picker = new DriveFilesForm(driveAuth))
            { if (picker.ShowDialog(this) != DialogResult.OK) return; source = picker.SelectedFile; }
            string path = null;
            await WithOperation(async delegate {
                using (DriveFiles client = new DriveFiles(driveAuth))
                    path = await client.Download(source, Path.Combine(WorkflowStore.Root, "incoming", Guid.NewGuid().ToString("N")), operation.Token);
            });
            if (path != null) await AddFiles(new[] { path }, delegate(LocalDocument doc) {
                doc.Origin = "drive"; doc.SourceContext = source;
                doc.TargetDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "ENVI Podpis", "Dysk");
                Directory.CreateDirectory(doc.TargetDirectory);
            });
        }

        private async Task FromMail()
        {
            int capacity = 8 - documents.Count;
            if (capacity <= 0) { note.Text = "Usuń zapisane dokumenty z listy przed dodaniem kolejnych."; return; }
            List<MailAttachmentDocument> attachments = null;
            if (OutlookMailbox.Available)
            {
                using (OutlookSourceForm picker = new OutlookSourceForm(capacity))
                {
                    DialogResult result = picker.ShowDialog(this);
                    if (result == DialogResult.OK) attachments = picker.Documents;
                    else if (result != DialogResult.Retry) return;
                }
            }
            if (attachments == null)
                using (MailSourceForm picker = new MailSourceForm(package, capacity))
                { if (picker.ShowDialog(this) != DialogResult.OK) return; attachments = picker.Documents; }
            await AddFiles(attachments.Select(a => a.Path).ToArray(), delegate(LocalDocument doc) {
                MailAttachmentDocument item = attachments.First(a => string.Equals(Path.GetFullPath(a.Path), doc.Source, StringComparison.OrdinalIgnoreCase));
                doc.Origin = "mail"; doc.SourceContext = item.Context;
                doc.TargetDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "ENVI Podpis", "Poczta");
                Directory.CreateDirectory(doc.TargetDirectory);
            });
        }

        private static DriveFile DriveSource(object value)
        {
            value = Json.Parse(Json.Serialize(value));
            return new DriveFile { Id = Json.GetString(value, "Id"), Name = Json.GetString(value, "Name"), MimeType = Json.GetString(value, "MimeType"),
                ParentId = Json.GetString(value, "ParentId"), DriveId = Json.GetString(value, "DriveId") };
        }
        private static DriveUpload DriveJob(object value)
        {
            value = Json.Parse(Json.Serialize(value));
            return new DriveUpload { Id = Json.GetString(value, "Id"), ParentId = Json.GetString(value, "ParentId"), Name = Json.GetString(value, "Name"),
                Path = Json.GetString(value, "Path"), Md5 = Json.GetString(value, "Md5") };
        }

        private async Task Deliver(LocalDocument doc)
        {
            if (doc.ValidatedCopy == null) throw new IOException("Brak zweryfikowanej kopii do dostarczenia.");
            WorkflowStore.Retain(doc);
            // Recover from a destination error without ever entering the signing path again.
            if (string.IsNullOrEmpty(doc.Output) || !File.Exists(doc.Output) || new FileInfo(doc.Output).Length > 32L * 1024 * 1024 || LocalDocument.Hash(File.ReadAllBytes(doc.Output)) != LocalDocument.Hash(doc.ValidatedCopy))
            {
                string target = doc.Origin == "local" ? WorkflowStore.Destination(doc.Source, outputDirectory) : doc.TargetDirectory;
                doc.Output = LocalDocument.SaveCopy(target, Path.GetFileNameWithoutExtension(doc.Source), doc.ValidatedCopy);
                if (doc.UploadContext != null) {
                    DriveUpload job = DriveJob(doc.UploadContext); job.Path = doc.Output; doc.UploadContext = job;
                }
                WorkflowStore.Retain(doc);
            }
            doc.Error = null;
            if (doc.Origin == "drive")
            {
                using (DriveFiles client = new DriveFiles(driveAuth))
                {
                    if (doc.UploadContext == null) {
                        doc.UploadContext = await client.PrepareUpload(DriveSource(doc.SourceContext), doc.Output, operation.Token);
                        WorkflowStore.Retain(doc);
                    }
                    string url = await client.Upload(DriveJob(doc.UploadContext), operation.Token);
                    doc.Status = "Zapisano na Dysku"; doc.Error = url;
                }
                WorkflowStore.Complete(doc);
            }
            else if (doc.Origin == "mail") { doc.Status = "Kopia gotowa do odpowiedzi"; WorkflowStore.Retain(doc); }
            else { doc.Status = "Zapisano"; WorkflowStore.Complete(doc); }
        }

        private async Task ReplyToMail()
        {
            List<LocalDocument> ready = documents.Where(d => d.Origin == "mail" && d.ValidatedCopy != null && d.Output != null && d.RecoveryPath != null).ToList();
            foreach (var group in ready.GroupBy(d => Json.Serialize(d.SourceContext)))
            {
                MailMessageContext context = MailMessageContext.FromJson(Json.Parse(Json.Serialize(group.First().SourceContext)));
                if (context.Provider == "outlook")
                {
                    string draft = OutlookReply.Create(context, group.Select(d => d.Output).ToList(), group.ToDictionary(d => d.Output, d => LocalDocument.Hash(d.ValidatedCopy)));
                    // Native Outlook owns approval/send and its error recovery; preserve a durable local draft.
                    WorkflowStore.Setting("lastOutlookReply", draft);
                    foreach (LocalDocument doc in group) { WorkflowStore.Complete(doc); doc.Status = "Odpowiedź gotowa w Outlooku"; doc.Error = "Szkic: " + draft; RefreshRow(doc); }
                    note.Text = "Sprawdź odbiorców i podpisane załączniki w Outlooku, następnie wybierz Wyślij. Szkic lokalny: " + draft;
                    continue;
                }
                using (MailReplyForm reply = new MailReplyForm(package, context, group.Select(d => d.Output).ToList(), group.ToDictionary(d => d.Output, d => LocalDocument.Hash(d.ValidatedCopy))))
                {
                    reply.ShowDialog(this);
                    if (reply.Completed && !reply.Sent) foreach (LocalDocument doc in group) { doc.Status = "Szkic zachowany — otwórz odpowiedź"; RefreshRow(doc); }
                    if (reply.Sent) foreach (LocalDocument doc in group) { WorkflowStore.Complete(doc); doc.Status = "Wysłano odpowiedź"; RefreshRow(doc); }
                }
            }
            await Task.FromResult(0);
        }

        private async Task WithOperation(Func<Task> action)
        {
            if (busy) return;
            busy = true; operation = new CancellationTokenSource(); note.Text = "Trwa przygotowanie lub zapis dokumentów. Możesz przerwać przyciskiem Przerwij."; UpdateButtons();
            progress.Visible = true; string outcome = null;
            try { await Task.Yield(); await action(); }
            catch (OperationCanceledException) { outcome = "Przerwano. Zapisane kopie są wskazane na liście."; }
            catch (Exception ex) { outcome = ex.Message; }
            finally { progress.Visible = false; busy = false; operation.Dispose(); operation = null; UpdateButtons(); if (outcome != null) note.Text = outcome; }
        }

        private async Task PreviewSelected() { await Preview(Selected()); }

        private async Task Preview(LocalDocument doc)
        {
            CertCandidate cc = Cert();
            if (doc == null || cc == null || doc.SignAttempted) return;
            try
            {
                // Baseline B includes the signer; avoid Windows chain discovery/AIA network access in the offline flow.
                List<string> chain = new List<string> { Convert.ToBase64String(cc.Cert.RawData) };
                while (true)
                {
                    bool needsPlace = false;
                    try { await doc.Prepare(package, cc.Cert, chain, operation.Token); }
                    catch (PdfWorkerException ex) { if (ex.Code != "PLACEMENT_BLOCKED") throw; needsPlace = true; }
                    if (needsPlace) { if (!await ChoosePlace(doc)) return; continue; }
                    using (PdfPreviewForm view = new PdfPreviewForm(doc, doc.Worker, false))
                    {
                        DialogResult result = view.ShowDialog(this);
                        operation.Token.ThrowIfCancellationRequested();
                        if (result == DialogResult.OK) { doc.Confirmed = true; doc.Status = "Gotowy"; break; }
                        if (result == DialogResult.Retry && doc.Prepared != null && doc.Graphic)
                            doc.Placement = Json.AsObject(doc.Prepared)["placement"];
                        doc.ResetPreview();
                        if (result != DialogResult.Retry) { doc.Status = "Anulowano"; break; }
                    }
                    if (!await ChoosePlace(doc)) break;
                }
            }
            catch (OperationCanceledException) { doc.ResetPreview(); doc.Status = "Anulowano"; throw; }
            catch (Exception ex) { doc.ResetPreview(); doc.Status = "Błąd"; note.Text = ex.Message; RefreshRow(doc, ex.Message); return; }
            finally { RefreshRow(doc); }
        }

        private async Task<bool> ChoosePlace(LocalDocument doc)
        {
            doc.ResetPreview(); doc.Status = "Wskaż miejsce"; RefreshRow(doc);
            using (PdfWorker worker = await PdfWorker.Start(package, operation.Token))
            using (PdfPreviewForm view = new PdfPreviewForm(doc, worker, true))
            {
                if (view.ShowDialog(this) != DialogResult.OK) { doc.Status = "Anulowano"; return false; }
                operation.Token.ThrowIfCancellationRequested();
                doc.Placement = view.SelectedPlacement; return true;
            }
        }

        private async Task ReviewAndSign()
        {
            if (Cert() == null) { note.Text = "Włóż kartę i wybierz Odśwież kartę. Dokumenty pozostają na liście."; return; }
            foreach (LocalDocument doc in documents.Where(d => !d.SignAttempted).ToList())
            {
                if (!doc.Confirmed) await Preview(doc);
                if (!doc.Confirmed) return;
            }
            await SignAll();
        }

        private async Task SignAll()
        {
            CertCandidate cc = Cert();
            List<LocalDocument> batch = documents.Where(d => !d.SignAttempted).ToList();
            if (cc == null || batch.Count == 0 || batch.Any(d => !d.Confirmed)) return;
            WorkflowStore.Setting("certificate", cc.Thumbprint);
            Directory.CreateDirectory(Path.Combine(WorkflowStore.Root, "pending"));
            WorkflowStore.Write(Path.Combine(WorkflowStore.Root, "pending", "write-check.tmp"), new { checkedAt = DateTime.UtcNow.ToString("o") });
            DriveInfo disk = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(WorkflowStore.Root)));
            if (disk.AvailableFreeSpace < batch.Sum(d => (long)d.Original.Length * 2) + 64L * 1024 * 1024)
                throw new IOException("Za mało miejsca na bezpieczne zachowanie podpisanych kopii. Zwolnij miejsce na dysku lokalnym przed wpisaniem PIN-u.");
            foreach (LocalDocument doc in batch) using (doc.LockUnchangedSource()) { }
            byte[] pin = null;
            try
            {
                using (Form dialog = new Form { Text = "PIN — " + batch.Count + " plików", Font = Font, ClientSize = new Size(470, 185),
                    StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false })
                {
                    Label label = new Label { Text = "Zatwierdzone podglądy są gotowe. Wpisz PIN raz.\r\nPierwszy błąd PIN-u zatrzyma całą partię.", AutoSize = true, Location = new Point(16, 16) };
                    TextBox entry = new TextBox { UseSystemPasswordChar = true, AccessibleName = "PIN do karty", Location = new Point(16, 75), Width = 435 };
                    Button ok = new Button { Text = "Podpisz", DialogResult = DialogResult.OK, Location = new Point(240, 130), Width = 100, Enabled = false };
                    Button back = new Button { Text = "Anuluj", DialogResult = DialogResult.Cancel, Location = new Point(350, 130), Width = 100 };
                    entry.TextChanged += delegate { ok.Enabled = entry.Text.Length > 0; };
                    dialog.Controls.AddRange(new Control[] { label, entry, ok, back }); dialog.AcceptButton = ok; dialog.CancelButton = back;
                    if (dialog.ShowDialog(this) != DialogResult.OK) return;
                    pin = Encoding.Unicode.GetBytes(entry.Text + "\0"); entry.Clear();
                }
                foreach (LocalDocument doc in batch)
                {
                    operation.Token.ThrowIfCancellationRequested();
                    doc.Status = "Podpisywanie"; RefreshRow(doc);
                    try {
                        string target = doc.Origin == "local" ? WorkflowStore.Destination(doc.Source, outputDirectory) : doc.TargetDirectory;
                        await doc.SignAndSave(cc.Cert, pin, target, operation.Token);
                        RefreshRow(doc);
                    }
                    catch (Exception ex)
                    {
                        string message = ex is SigningException ? Messages.FromSigning((SigningException)ex, 1).Title +
                            ". Partia przerwana bez ponawiania PIN-u. Zapisane wcześniej kopie są na liście. Sprawdź kartę i komunikat jej wystawcy przed kolejną próbą." : ex.Message;
                        doc.Status = doc.ValidatedCopy != null ? "Podpis zachowany — ponów dostarczenie" : ex is OperationCanceledException ? "Anulowano" : "Błąd"; doc.Dispose(); RefreshRow(doc, message);
                        foreach (LocalDocument waiting in batch.Where(d => !d.SignAttempted)) { waiting.Status = "Anulowano"; RefreshRow(waiting); }
                        if (ex is OperationCanceledException) throw;
                        throw new InvalidOperationException(message, ex);
                    }
                }
                note.Text = "Zapisano zweryfikowane kopie. Oryginały zachowane.";
            }
            finally
            {
                if (pin != null) Array.Clear(pin, 0, pin.Length);
                if (operation.IsCancellationRequested)
                    foreach (LocalDocument doc in batch.Where(d => !d.SignAttempted)) { doc.Status = "Anulowano"; RefreshRow(doc); }
            }
            // Clear PIN before any network delivery or reply review can keep the operation open.
            foreach (LocalDocument doc in batch.Where(d => d.ValidatedCopy != null))
            {
                try { await Deliver(doc); RefreshRow(doc); }
                catch (Exception ex) { doc.Status = "Podpis zachowany — ponów dostarczenie"; RefreshRow(doc, ex.Message); note.Text = ex.Message; }
            }
            await ReplyToMail();
        }

        private void RefreshRow(LocalDocument doc, string error = null)
        {
            foreach (DataGridViewRow row in files.Rows)
                if (row.Tag == doc)
                {
                    row.Cells[2].Value = doc.Status;
                    if (error != null) doc.Error = error;
                    row.Cells[3].Value = doc.Error ?? doc.Output ?? "";
                    row.Cells[3].ToolTipText = (doc.Error ?? "") + "\r\n" + (doc.Output ?? "");
                    row.Cells[1].ReadOnly = doc.SignAttempted;
                }
        }

        private void UpdateButtons()
        {
            actions.Enabled = !busy; certificate.Enabled = !busy; files.Enabled = !busy;
            LocalDocument selected = Selected();
            prepare.Enabled = !busy && Cert() != null && selected != null && !selected.SignAttempted;
            List<LocalDocument> pending = documents.Where(d => !d.SignAttempted).ToList();
            sign.Enabled = !busy && Cert() != null && pending.Count > 0;
            save.Enabled = !busy && selected != null && selected.ValidatedCopy != null;
            cancel.Enabled = busy;
            foreach (Control action in actions.Controls) if (action.Text == "Kopie obok oryginału") action.Visible = !string.IsNullOrEmpty(outputDirectory);
            destination.Text = string.IsNullOrEmpty(outputDirectory) ? "Kopie lokalne: obok oryginału. Dysk: folder dokumentu. Poczta: zachowane lokalnie i w odpowiedzi." : "Kopie lokalne: " + outputDirectory + ". Dysk i poczta zachowują własne miejsca.";
            sign.Text = pending.Any(d => !d.Confirmed) ? "Sprawdź i podpisz" : "Podpisz — wpisz PIN";
            if (!busy && Cert() == null) note.Text = "Brak ważnego certyfikatu. Włóż kartę i kliknij Odśwież kartę; lista dokumentów zostanie zachowana.";
            else if (!busy && documents.Count == 0) note.Text = "Dodaj PDF, wybierz Z Dysku lub Z poczty. Podgląd otworzy się automatycznie.";
            else if (!busy && selected != null && selected.RecoveryPath != null) note.Text = "Podpis jest zachowany. Zapisz / dostarcz ponownie użyje tej kopii bez karty i PIN-u.";
        }

#if DEBUG
        internal void UseTestCertificate(X509Certificate2 cert)
        {
            testCertificate = true; automaticReview = false; loading = true; certificate.Items.Clear(); certificate.Items.Add(new CertCandidate { Cert = cert, Thumbprint = cert.Thumbprint, Display = "Jan Testowy — WYŁĄCZNIE TEST, klucz programowy" });
            certificate.SelectedIndex = 0; loading = false;
        }
#endif
    }
}
