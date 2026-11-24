using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal sealed class LocalFilesForm : Form
    {
        private readonly ComboBox favorites = new ComboBox();
        private readonly TextBox folder = new TextBox();
        private readonly FileListView list = new FileListView { CheckBoxes = true };
        private readonly Button favoriteButton = new Button { AutoSize = true, MinimumSize = new Size(80, 34) };
        private readonly Label status = new Label();
        private string current;
        internal string[] SelectedPaths { get; private set; }

        internal LocalFilesForm()
        {
            Text = "ENVI Podpis — foldery na komputerze"; Font = new Font("Segoe UI", 10);
            ClientSize = new Size(860, 560); MinimumSize = new Size(740, 480); StartPosition = FormStartPosition.CenterParent;
            TableLayoutPanel root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 6 };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            for (int i = 0; i < 6; i++) root.RowStyles.Add(new RowStyle(i == 3 ? SizeType.Percent : SizeType.AutoSize, i == 3 ? 100 : 0));
            root.Controls.Add(new Label { Text = "Wybierz folder i zaznacz pliki PDF", AutoSize = true, Font = new Font("Segoe UI Semibold", 16) }, 0, 0);
            FlowLayoutPanel pins = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill };
            pins.Controls.Add(new Label { Text = "Ulubione:", AutoSize = true, Padding = new Padding(0, 7, 0, 0) });
            favorites.Width = 340; favorites.DropDownStyle = ComboBoxStyle.DropDownList; favorites.AccessibleName = "Ulubione foldery lokalne";
            pins.Controls.Add(favorites);
            favoriteButton.Click += delegate { Try(delegate {
                string selected = (string)favorites.SelectedItem;
                Pin(selected ?? current, selected == null);
                RefreshFavorites();
            }); };
            pins.Controls.Add(favoriteButton); root.Controls.Add(pins, 0, 1);
            TableLayoutPanel path = new TableLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 3 };
            path.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); path.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); path.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            folder.Dock = DockStyle.Fill; folder.AccessibleName = "Ścieżka folderu lokalnego lub synchronizowanego";
            path.Controls.Add(folder, 0, 0); path.Controls.Add(Button("Otwórz folder", delegate { LoadFolder(folder.Text); }), 1, 0);
            path.Controls.Add(Button("Przeglądaj / szukaj…", Browse), 2, 0); root.Controls.Add(path, 0, 2);
            list.AccessibleName = "Foldery i pliki PDF — zaznacz pliki do podpisu";
            root.Controls.Add(list, 0, 3);
            status.AutoSize = true; status.MaximumSize = new Size(680, 0); status.Padding = new Padding(0, 8, 0, 8); root.Controls.Add(status, 0, 4);
            FlowLayoutPanel actions = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            actions.Controls.Add(Button("↑ W górę", delegate { if (current != null) { DirectoryInfo parent = Directory.GetParent(current); if (parent != null) LoadFolder(parent.FullName); } }));
            actions.Controls.Add(Button("Dodaj zaznaczone PDF", delegate {
                string[] selected = list.CheckedItems.Cast<ListViewItem>().Where(i => File.Exists((string)i.Tag)).Select(i => (string)i.Tag).ToArray();
                if (selected.Length == 0) { status.Text = "Zaznacz pliki PDF. Dwuklik otwiera folder."; return; }
                SelectedPaths = selected; DialogResult = DialogResult.OK; Close();
            }));
            Button cancel = Button("Anuluj", delegate { DialogResult = DialogResult.Cancel; Close(); }); actions.Controls.Add(cancel); CancelButton = cancel;
            root.Controls.Add(actions, 0, 5); Controls.Add(root);
            favorites.SelectionChangeCommitted += delegate {
                if (favorites.SelectedItem != null) LoadFolder((string)favorites.SelectedItem);
                UpdateFavoriteButton();
            };
            list.CreationColumnClick += delegate {
                bool newestFirst = list.NewestFirst != true;
                list.ListViewItemSorter = new CreationComparer(newestFirst);
                list.NewestFirst = newestFirst;
            };
            folder.KeyDown += delegate(object sender, KeyEventArgs e) { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; LoadFolder(folder.Text); } };
            list.ItemActivate += delegate { if (list.SelectedItems.Count == 1 && Directory.Exists((string)list.SelectedItems[0].Tag)) LoadFolder((string)list.SelectedItems[0].Tag); };
            list.ItemCheck += delegate(object sender, ItemCheckEventArgs e) { if (Directory.Exists((string)list.Items[e.Index].Tag)) e.NewValue = CheckState.Unchecked; };
            Try(RefreshFavorites);
            string last = Json.GetString(WorkflowStore.Settings(), "local.lastFolder");
            LoadFolder(!string.IsNullOrEmpty(last) && Directory.Exists(last) ? last : Downloads);
        }

        private static Button Button(string text, Action action)
        { Button button = new Button { Text = text, AutoSize = true, MinimumSize = new Size(80, 34) }; button.Click += delegate { action(); }; return button; }
        private void Try(Action action) { try { action(); } catch (Exception ex) { status.Text = ex.Message; } }
        internal static string Downloads { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"); } }
        internal static List<string> FavoritePaths()
        {
            string saved = Json.GetString(WorkflowStore.Settings(), "local.favorites");
            return string.IsNullOrEmpty(saved) ? new List<string> { Downloads } : Json.GetList(Json.Parse(saved), "paths").Select(Convert.ToString).Where(p => !string.IsNullOrWhiteSpace(p)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }
        internal static void Pin(string value, bool add)
        {
            string path = Path.GetFullPath(value.Trim());
            if (add && !Directory.Exists(path)) throw new IOException("Folder jest niedostępny. Sprawdź ścieżkę lub podłącz dysk.");
            List<string> paths = FavoritePaths(); paths.RemoveAll(p => SameFolder(p, path));
            if (add) paths.Add(path);
            WorkflowStore.Setting("local.favorites", Json.Serialize(new { paths = paths }));
        }
        private static bool SameFolder(string left, string right)
        {
            return left != null && right != null &&
                string.Equals(left.TrimEnd('\\', '/'), right.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase);
        }
        private void RefreshFavorites()
        {
            favorites.Items.Clear();
            foreach (string path in FavoritePaths()) favorites.Items.Add(path);
            SelectCurrentFavorite();
        }
        private void SelectCurrentFavorite()
        {
            favorites.SelectedItem = favorites.Items.Cast<string>().FirstOrDefault(path => SameFolder(path, current));
            UpdateFavoriteButton();
        }
        private void UpdateFavoriteButton()
        {
            bool pinned = favorites.SelectedItem != null;
            favoriteButton.Enabled = pinned || current != null;
            favoriteButton.Text = pinned ? "★ Usuń z ulubionych" : "☆ Dodaj do ulubionych";
        }
        internal void LoadFolder(string path)
        {
            Try(delegate {
                string full = Path.GetFullPath(path.Trim());
                // List only this directory; Windows handles recursive searches in the native picker.
                DirectoryInfo directory = new DirectoryInfo(full);
                DirectoryInfo[] directories = directory.GetDirectories();
                FileInfo[] pdfs = directory.GetFiles("*.pdf");
                ListViewItem[] entries = directories.OrderBy(p => p.Name, StringComparer.CurrentCultureIgnoreCase).Select(p => Entry(p, true))
                    .Concat(pdfs.OrderBy(p => p.Name, StringComparer.CurrentCultureIgnoreCase).Select(p => Entry(p, false))).ToArray();
                list.Items.Clear(); current = folder.Text = full;
                list.Items.AddRange(entries);
                SelectCurrentFavorite();
                WorkflowStore.Setting("local.lastFolder", full);
                status.Text = "Zaznacz dowolne PDF. Dwuklik otwiera folder. „Przeglądaj / szukaj…” otwiera wyszukiwarkę Windows. Grafikę wybierzesz na liście przed podpisaniem. Kopie domyślnie trafią obok oryginałów.";
            });
        }
        private static ListViewItem Entry(FileSystemInfo info, bool isFolder)
        {
            DateTime created = info.CreationTimeUtc;
            return FileListView.Entry(info.Name, isFolder ? "Folder" : "PDF", isFolder,
                created == DateTime.FromFileTimeUtc(0) ? (DateTimeOffset?)null : new DateTimeOffset(created), info.FullName);
        }
        private sealed class CreationComparer : IComparer
        {
            private readonly bool newestFirst;
            internal CreationComparer(bool newestFirst) { this.newestFirst = newestFirst; }
            public int Compare(object first, object second)
            {
                ListViewItem left = (ListViewItem)first, right = (ListViewItem)second;
                DateTimeOffset? a = (DateTimeOffset?)left.SubItems[FileListView.CreatedColumn].Tag;
                DateTimeOffset? b = (DateTimeOffset?)right.SubItems[FileListView.CreatedColumn].Tag;
                int order = a.HasValue && b.HasValue ? a.Value.CompareTo(b.Value) * (newestFirst ? -1 : 1) : b.HasValue.CompareTo(a.HasValue);
                return order == 0 ? StringComparer.CurrentCultureIgnoreCase.Compare(left.Text, right.Text) : order;
            }
        }
        private void Browse()
        {
            Try(delegate {
                using (OpenFileDialog dialog = new OpenFileDialog { Title = "Przeglądaj foldery i wyszukuj PDF — zaznacz dowolne pliki", Filter = "PDF (*.pdf)|*.pdf", Multiselect = true, AutoUpgradeEnabled = true, InitialDirectory = current ?? Downloads })
                {
                    foreach (string path in FavoritePaths()) if (Directory.Exists(path)) dialog.CustomPlaces.Add(path);
                    if (dialog.ShowDialog(this) != DialogResult.OK) return;
                    string[] selected = dialog.FileNames;
                    LoadFolder(Path.GetDirectoryName(selected[0]));
                    foreach (string path in selected)
                    {
                        ListViewItem item = list.Items.Cast<ListViewItem>().FirstOrDefault(i => string.Equals((string)i.Tag, path, StringComparison.OrdinalIgnoreCase));
                        if (item == null) item = list.Items.Add(Entry(new FileInfo(path), false));
                        item.Checked = true;
                    }
                    status.Text = "Zaznaczono " + selected.Length + " PDF. Kliknij „Dodaj zaznaczone PDF”, aby przejść dalej.";
                }
            });
        }
    }
}
