using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal sealed class DriveFilesForm : Form
    {
        private readonly DriveAuth auth;
        private readonly DriveFiles files;
        private readonly ComboBox location = new ComboBox();
        private readonly TextBox search = new TextBox();
        private readonly CheckBox everywhere = new CheckBox { Text = "Szukaj na całym Dysku", Checked = true, AutoSize = true };
        private readonly ListView list = new ListView();
        private readonly Label status = new Label();
        private readonly Label breadcrumb = new Label();
        private readonly Button find = new Button(), more = new Button(), up = new Button(), choose = new Button(), account = new Button();
        private readonly Stack<DriveFile> history = new Stack<DriveFile>();
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private DriveFile folder;
        private string next, query;
        private DriveFile queryFolder;
        private bool busy;
        private readonly bool selectFolder;
        private string accountKey;
        internal DriveFile SelectedFile { get; private set; }
        internal List<DriveFile> SelectedFiles { get; private set; }
        internal int Capacity = 8;

        internal DriveFilesForm(DriveAuth auth, bool selectFolder = false) : this(auth, new DriveFiles(auth), selectFolder) { }
        internal DriveFilesForm(DriveAuth auth, DriveFiles files, bool selectFolder = false)
        {
            this.auth = auth; this.files = files; this.selectFolder = selectFolder;
            Text = selectFolder ? "ENVI Podpis — folder podpisanej kopii" : "ENVI Podpis — wybierz dokument z Dysku"; Font = new Font("Segoe UI", 10);
            ClientSize = new Size(860, 560); MinimumSize = new Size(680, 460); StartPosition = FormStartPosition.CenterParent;
            TableLayoutPanel root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 6 };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize)); root.RowStyles.Add(new RowStyle(SizeType.AutoSize)); root.RowStyles.Add(new RowStyle(SizeType.AutoSize)); root.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); root.RowStyles.Add(new RowStyle(SizeType.AutoSize)); root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.Controls.Add(new Label { Text = selectFolder ? "Wybierz folder podpisanej kopii" : "Wybierz dokumenty z Dysku", AutoSize = true, Font = new Font("Segoe UI Semibold", 16) }, 0, 0);
            TableLayoutPanel toolbar = new TableLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 4, Padding = new Padding(0, 12, 0, 8) };
            toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 210)); toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            location.DropDownStyle = ComboBoxStyle.DropDownList; location.Dock = DockStyle.Fill; location.AccessibleName = "Miejsce na Dysku";
            search.Dock = DockStyle.Fill; search.AccessibleName = "Nazwa folderu lub pliku albo link folderu";
            find.Text = "Szukaj"; account.Text = "Konto Google…";
            toolbar.Controls.Add(location, 0, 0); toolbar.Controls.Add(search, 1, 0); toolbar.Controls.Add(find, 2, 0); toolbar.Controls.Add(account, 3, 0); root.Controls.Add(toolbar, 0, 1);
            toolbar.Controls.Add(new Label { Text = "Nazwa folderu / pliku lub link folderu", AutoSize = true }, 1, 1);
            toolbar.Controls.Add(everywhere, 0, 1);
            FlowLayoutPanel path = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill }; up.Text = "↑ W górę"; breadcrumb.AutoSize = true; breadcrumb.Padding = new Padding(4, 8, 0, 0); path.Controls.Add(up); path.Controls.Add(breadcrumb); root.Controls.Add(path, 0, 2);
            list.Dock = DockStyle.Fill; list.View = View.Details; list.FullRowSelect = true; list.MultiSelect = !selectFolder; list.HideSelection = false; list.AccessibleName = "Dokumenty i foldery Google Drive"; list.Columns.Add("Nazwa", 510); list.Columns.Add("Rodzaj", 120); root.Controls.Add(list, 0, 3);
            status.AutoSize = true; status.MaximumSize = new Size(1000, 0); status.Dock = DockStyle.Fill; status.Padding = new Padding(0, 10, 0, 10); root.Controls.Add(status, 0, 4);
            FlowLayoutPanel actions = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true }; choose.Text = "Otwórz dokument"; more.Text = "Pokaż kolejne";
            Button cancel = new Button { Text = "Anuluj", DialogResult = DialogResult.Cancel };
            foreach (Button button in new[] { find, account, up, choose, more, cancel }) { button.AutoSize = true; button.MinimumSize = new Size(100, 34); }
            actions.Controls.Add(choose); actions.Controls.Add(more); actions.Controls.Add(cancel); root.Controls.Add(actions, 0, 5); Controls.Add(root); CancelButton = cancel;
            location.Items.Add(new DriveFile { Name = "Ostatnie pliki i foldery" }); location.Items.Add(new DriveFile { Id = "root", Name = "Mój Dysk", MimeType = "application/vnd.google-apps.folder" }); location.SelectedIndex = 0;
            location.SelectedIndexChanged += async delegate { if (busy) return; history.Clear(); folder = location.SelectedItem as DriveFile; if (folder != null && folder.Id == null) folder = null; search.Clear(); await LoadPage(false); };
            find.Click += async delegate { await LoadPage(false); };
            search.KeyDown += async delegate(object sender, KeyEventArgs e) { if (e.KeyCode == Keys.Enter && !busy) { e.SuppressKeyPress = true; await LoadPage(false); } };
            more.Click += async delegate { await LoadPage(true); };
            everywhere.CheckedChanged += delegate { next = null; RefreshButtons(); };
            up.Click += async delegate { await GoUp(); };
            list.SelectedIndexChanged += delegate { RefreshButtons(); if (!busy) status.Text = SelectionHint(); };
            list.ItemActivate += async delegate { await OpenSelected(); };
            choose.Click += async delegate { if (selectFolder && folder != null && queryFolder == folder) { SelectedFile = folder; Remember(folder); DialogResult = DialogResult.OK; Close(); } else await OpenSelected(); };
            account.Click += async delegate { using (DriveLoginForm login = new DriveLoginForm(auth)) login.ShowDialog(this); folder = null; history.Clear(); await Initialize(); };
            Shown += async delegate { await Initialize(); };
            FormClosing += delegate { lifetime.Cancel(); };
            FormClosed += delegate { files.Dispose(); };
            RefreshButtons();
        }

        private void RefreshButtons()
        {
            find.Enabled = !busy; search.Enabled = !busy; location.Enabled = !busy; account.Enabled = !busy; everywhere.Enabled = !busy;
            list.Enabled = !busy;
            up.Enabled = !busy && (history.Count > 0 || (folder != null && !string.IsNullOrEmpty(folder.ParentId))); more.Enabled = !busy && !string.IsNullOrEmpty(next);
            choose.Enabled = !busy && (selectFolder ? folder != null && queryFolder == folder : list.SelectedItems.Count > 0);
            choose.Text = selectFolder ? "Wybierz ten folder" : list.SelectedItems.Count == 1 && ((DriveFile)list.SelectedItems[0].Tag).IsFolder ? "Otwórz folder" : "Dodaj wybrane (" + list.SelectedItems.Count + ")";
        }
        private string SelectionHint()
        {
            return selectFolder ? "Dwuklik otwiera folder. „Wybierz ten folder” zatwierdza miejsce pokazane powyżej." :
                "Dwuklik otwiera folder. Zaznacz pliki z Ctrl / Shift i kliknij „Dodaj wybrane”. Kopie wrócą do folderów oryginałów.";
        }
        private async Task GoUp()
        {
            if (busy) return;
            if (history.Count > 0) { folder = history.Pop(); search.Clear(); await LoadPage(false); return; }
            if (folder == null || string.IsNullOrEmpty(folder.ParentId)) return;
            busy = true; RefreshButtons();
            try { folder = await files.GetFolder(folder.ParentId, lifetime.Token); search.Clear(); }
            catch (OperationCanceledException) { return; }
            catch (Exception ex) { if (!IsDisposed) status.Text = ex.Message; return; }
            finally { busy = false; if (!IsDisposed) RefreshButtons(); }
            await LoadPage(false);
        }
        private async Task Initialize()
        {
            if (busy) return;
            busy = true; RefreshButtons(); status.Text = "Pobieranie listy Dysków…";
            try
            {
                accountKey = await files.AccountKey(lifetime.Token);
                List<DriveFile> drives = await files.SharedDrives(lifetime.Token);
                while (location.Items.Count > 2) location.Items.RemoveAt(location.Items.Count - 1);
                foreach (DriveFile drive in drives) location.Items.Add(drive);
                try
                {
                    string remembered = Json.GetString(WorkflowStore.Settings(), "drive.lastFolder." + accountKey);
                    if (!string.IsNullOrEmpty(remembered))
                    {
                        folder = await files.GetFolder(remembered, lifetime.Token);
                        location.SelectedIndex = 1;
                        for (int i = 2; i < location.Items.Count; i++)
                            if (((DriveFile)location.Items[i]).DriveId == folder.DriveId) location.SelectedIndex = i;
                    }
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception) { folder = null; }
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex) { status.Text = ex.Message + " Użyj „Konto Google…”, jeśli trzeba połączyć konto."; return; }
            finally { busy = false; if (!IsDisposed) RefreshButtons(); }
            await LoadPage(false);
        }
        private async Task LoadPage(bool append)
        {
            if (busy) return;
            busy = true; RefreshButtons(); status.Text = "Pobieranie dokumentów…";
            if (!append) { next = null; queryFolder = null; query = search.Text; list.Items.Clear(); }
            try
            {
                if (!append)
                {
                    if (query.TrimStart().StartsWith("https:", StringComparison.OrdinalIgnoreCase) || query.TrimStart().StartsWith("http:", StringComparison.OrdinalIgnoreCase))
                    {
                        DriveFile linked = await files.GetFolder(DriveFiles.FolderIdFromLink(query), lifetime.Token);
                        history.Clear(); folder = linked; search.Clear(); query = "";
                    }
                    queryFolder = everywhere.Checked && !string.IsNullOrWhiteSpace(query) ? null : folder;
                }
                DriveFilePage page = await files.List(query, queryFolder == null ? null : queryFolder.Id, queryFolder == null ? null : queryFolder.DriveId, append ? next : null, lifetime.Token);
                if (IsDisposed) return;
                foreach (DriveFile file in page.Files)
                { ListViewItem item = new ListViewItem(file.Name); item.SubItems.Add(file.IsFolder ? "Folder" : file.MimeType == "application/pdf" ? "PDF" : "Dokument Google"); item.Tag = file; list.Items.Add(item); }
                next = page.NextPageToken;
                breadcrumb.Text = queryFolder == null ? string.IsNullOrWhiteSpace(query) ? "Ostatnio zmieniane pliki i foldery" : "Wyniki na całym Dysku — foldery i pliki" : queryFolder.Name;
                status.Text = page.Incomplete ? "Wyniki są niepełne. Wybierz konkretny Dysk lub folder, wyłącz „Szukaj na całym Dysku” i ponów wyszukiwanie." :
                    list.Items.Count == 0 ? "Brak wyników. Zmień nazwę, wybierz inny Dysk lub wklej link folderu." : SelectionHint();
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                if (!append) queryFolder = null;
                if (!IsDisposed)
                {
                    if (!append) breadcrumb.Text = "Nie wczytano wybranego miejsca";
                    status.Text = ex.Message + " Użyj „Szukaj”, aby ponowić, lub „Konto Google…”.";
                }
            }
            finally { busy = false; if (!IsDisposed) RefreshButtons(); }
        }
        private async Task OpenSelected()
        {
            if (busy || list.SelectedItems.Count == 0) return;
            List<DriveFile> selected = list.SelectedItems.Cast<ListViewItem>().Select(item => (DriveFile)item.Tag).ToList();
            if (selected.Count == 1 && selected[0].IsFolder)
            {
                if (queryFolder == null) history.Clear(); else history.Push(folder);
                folder = selected[0]; search.Clear(); await LoadPage(false); return;
            }
            if (selectFolder) { status.Text = "To dokument. Otwórz folder dwuklikiem i kliknij „Wybierz ten folder”."; return; }
            if (selected.Any(file => file.IsFolder)) { status.Text = "Zaznacz same dokumenty albo otwórz jeden folder."; return; }
            if (selected.Count > Capacity) { status.Text = "Możesz dodać jeszcze " + Capacity + " dokumentów. Zmniejsz zaznaczenie."; return; }
            busy = true; RefreshButtons();
            try { if (!string.IsNullOrEmpty(selected[0].ParentId)) Remember(await files.GetFolder(selected[0].ParentId, lifetime.Token)); }
            catch (OperationCanceledException) { return; }
            catch (Exception) { }
            finally { busy = false; if (!IsDisposed) RefreshButtons(); }
            if (IsDisposed || lifetime.IsCancellationRequested) return;
            SelectedFiles = selected; SelectedFile = selected[0]; DialogResult = DialogResult.OK; Close();
        }
        private void Remember(DriveFile value)
        {
            if (value == null || accountKey == null) return;
            try { WorkflowStore.Setting("drive.lastFolder." + accountKey, value.Id); }
            catch (Exception) { }
        }
    }
}
