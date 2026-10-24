using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class OutlookMailbox
    {
        internal static bool Available { get { try { return Type.GetTypeFromProgID("Outlook.Application") != null; } catch { return false; } } }
        internal static object Open()
        {
            try { return Marshal.GetActiveObject("Outlook.Application"); }
            catch (COMException) { return Activator.CreateInstance(Type.GetTypeFromProgID("Outlook.Application", true)); }
        }
        internal static object Get(object target, string name) { return target.GetType().InvokeMember(name, BindingFlags.GetProperty, null, target, null); }
        internal static object Call(object target, string name, params object[] arguments) { return target.GetType().InvokeMember(name, BindingFlags.InvokeMethod, null, target, arguments); }
        internal static void Set(object target, string name, object value) { target.GetType().InvokeMember(name, BindingFlags.SetProperty, null, target, new object[] { value }); }
        internal static string Text(object target, string name) { return Convert.ToString(Get(target, name)); }
        internal static void Release(object value) { if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }
        internal static MailMessageContext Context(object item)
        {
            object folder = Get(item, "Parent");
            try { return new MailMessageContext { Provider = "outlook", OutlookEntryId = Text(item, "EntryID"), OutlookStoreId = Text(folder, "StoreID"), MessageId = Text(item, "EntryID"), Subject = Text(item, "Subject"), To = new string[0], Cc = new string[0], AccountEmail = "Outlook" }; }
            finally { Release(folder); }
        }
    }
    internal sealed class OutlookSourceForm : Form
    {
        private readonly ListBox messages = new ListBox { Dock = DockStyle.Fill, HorizontalScrollbar = true };
        private readonly CheckedListBox attachments = new CheckedListBox { Dock = DockStyle.Fill, CheckOnClick = true, HorizontalScrollbar = true };
        private readonly ComboBox stores = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 230 };
        private readonly TextBox query = new TextBox { Width = 250 };
        private readonly Label status = new Label { Dock = DockStyle.Fill };
        private readonly int maxDocuments;
        private object application, session;
        private readonly List<MailMessageContext> contexts = new List<MailMessageContext>();
        private readonly List<string> storeIds = new List<string>();
        private readonly List<int> attachmentIndexes = new List<int>();
        private string folderId, folderStoreId;
        private bool initializingStores = true;
        internal readonly List<MailAttachmentDocument> Documents = new List<MailAttachmentDocument>();
        internal OutlookSourceForm(int maxDocuments = 8)
        {
            this.maxDocuments = Math.Max(0, Math.Min(8, maxDocuments)); Text = "Outlook — pismo do podpisania"; ClientSize = new Size(950, 600); MinimumSize = new Size(760, 480); Font = new Font("Segoe UI", 10); StartPosition = FormStartPosition.CenterParent;
            TableLayoutPanel layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 6, Padding = new Padding(16) };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 46)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 55)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 45)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 60)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
            FlowLayoutPanel bar = new FlowLayoutPanel { Dock = DockStyle.Fill }; Button search = new Button { Text = "Szukaj", AutoSize = true }, folder = new Button { Text = "Folder Outlooka…", AutoSize = true }; bar.Controls.Add(stores); bar.Controls.Add(query); bar.Controls.Add(search); bar.Controls.Add(folder); layout.Controls.Add(bar, 0, 0); layout.Controls.Add(messages, 0, 1);
            layout.Controls.Add(new Label { Text = "PDF w wiadomości — miejsce na liście podpisu: " + this.maxDocuments + ". Odznacz zbędne załączniki.", Dock = DockStyle.Fill }, 0, 2); layout.Controls.Add(attachments, 0, 3); layout.Controls.Add(status, 0, 4);
            Button add = new Button { Text = "Dodaj wybrane PDF do podpisu", AutoSize = true }, fallback = new Button { Text = "Inna poczta (IMAP)…", AutoSize = true };
            FlowLayoutPanel footer = new FlowLayoutPanel { Dock = DockStyle.Fill }; footer.Controls.Add(add); footer.Controls.Add(fallback); layout.Controls.Add(footer, 0, 5); Controls.Add(layout);
            fallback.Click += delegate { DialogResult = DialogResult.Retry; Close(); };
            search.Click += delegate { LoadMessages(false); }; query.KeyDown += delegate(object sender, KeyEventArgs e) { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; LoadMessages(false); } };
            stores.SelectedIndexChanged += delegate {
                folderId = folderStoreId = null;
                if (!initializingStores && stores.SelectedIndex >= 0) {
                    try { WorkflowStore.Setting("outlookStore", storeIds[stores.SelectedIndex]); } catch { status.Text = "Nie zapamiętano wyboru skrzynki. Możesz dalej wybrać pismo."; }
                    LoadMessages(false);
                }
            };
            folder.Click += delegate { if (session == null) return; object picked = null; try { picked = OutlookMailbox.Call(session, "PickFolder"); if (picked != null) { folderId = OutlookMailbox.Text(picked, "EntryID"); folderStoreId = OutlookMailbox.Text(picked, "StoreID"); LoadMessages(false); } } catch { status.Text = "Nie wybrano folderu Outlooka. Możesz wyszukać pismo w Odebranych."; } finally { OutlookMailbox.Release(picked); } };
            messages.SelectedIndexChanged += delegate { SelectMessage(); }; add.Click += delegate { Download(); };
            Shown += delegate { Initialize(); };
            FormClosed += delegate { OutlookMailbox.Release(session); OutlookMailbox.Release(application); };
        }
        private void ShowLoading(string message)
        {
            UseWaitCursor = true;
            status.Text = message;
            status.Refresh();
        }
        private void Initialize()
        {
            try
            {
                application = OutlookMailbox.Open(); session = OutlookMailbox.Get(application, "Session"); object collection = OutlookMailbox.Get(session, "Stores");
                try
                {
                    int count = Math.Min(30, Convert.ToInt32(OutlookMailbox.Get(collection, "Count")));
                    for (int i = 1; i <= count; i++) { object store = OutlookMailbox.Call(collection, "Item", i); try { storeIds.Add(OutlookMailbox.Text(store, "StoreID")); stores.Items.Add(OutlookMailbox.Text(store, "DisplayName")); } finally { OutlookMailbox.Release(store); } }
                }
                finally { OutlookMailbox.Release(collection); }
                string selectedStore = null; object current = ActiveMessage();
                if (current != null) try { if (Convert.ToInt32(OutlookMailbox.Get(current, "Class")) == 43) selectedStore = OutlookMailbox.Context(current).OutlookStoreId; } finally { OutlookMailbox.Release(current); }
                if (selectedStore == null || !storeIds.Contains(selectedStore)) try { selectedStore = Json.GetString(WorkflowStore.Settings(), "outlookStore"); } catch { }
                if (stores.Items.Count > 0) stores.SelectedIndex = Math.Max(0, storeIds.IndexOf(selectedStore));
                initializingStores = false;
                LoadMessages(true);
            }
            catch { status.Text = "Nie można odczytać profilu Outlooka. Otwórz Outlook i zaloguj się. Możesz użyć Poczta IMAP w ENVI Podpis."; }
        }
        private object ActiveMessage()
        {
            object inspector = OutlookMailbox.Call(application, "ActiveInspector");
            if (inspector != null) try { return OutlookMailbox.Get(inspector, "CurrentItem"); } finally { OutlookMailbox.Release(inspector); }
            object explorer = OutlookMailbox.Call(application, "ActiveExplorer"); if (explorer == null) return null;
            object selection = null;
            try { selection = OutlookMailbox.Get(explorer, "Selection"); return Convert.ToInt32(OutlookMailbox.Get(selection, "Count")) > 0 ? OutlookMailbox.Call(selection, "Item", 1) : null; }
            finally { OutlookMailbox.Release(selection); OutlookMailbox.Release(explorer); }
        }
        private bool AddMessage(object item, string textFilter)
        {
            if (Convert.ToInt32(OutlookMailbox.Get(item, "Class")) != 43) return false;
            string subject = OutlookMailbox.Text(item, "Subject"), sender = OutlookMailbox.Text(item, "SenderName");
            if (textFilter.Length > 0 && (subject + " " + sender).IndexOf(textFilter, StringComparison.CurrentCultureIgnoreCase) < 0) return false;
            MailMessageContext context = OutlookMailbox.Context(item);
            if (contexts.Any(c => c.OutlookEntryId == context.OutlookEntryId && c.OutlookStoreId == context.OutlookStoreId)) return false;
            object collection = OutlookMailbox.Get(item, "Attachments"); bool hasPdf = false;
            try { for (int i = 1, count = Math.Min(100, Convert.ToInt32(OutlookMailbox.Get(collection, "Count"))); i <= count; i++) { object file = OutlookMailbox.Call(collection, "Item", i); try { if (OutlookMailbox.Text(file, "FileName").EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) { hasPdf = true; break; } } finally { OutlookMailbox.Release(file); } } }
            finally { OutlookMailbox.Release(collection); }
            if (!hasPdf) return false;
            contexts.Add(context); messages.Items.Add(OutlookMailbox.Text(item, "ReceivedTime") + "  |  " + sender + "  |  " + subject); return true;
        }
        private void LoadMessages(bool selectedFirst)
        {
            if (session == null) return;
            UseWaitCursor = true; messages.Items.Clear(); contexts.Clear(); attachments.Items.Clear(); ShowLoading("Odczyt wiadomości z gotowego profilu Outlooka…");
            try
            {
                if (selectedFirst)
                {
                    object current = ActiveMessage(); if (current != null) try { AddMessage(current, ""); } finally { OutlookMailbox.Release(current); }
                }
                object folder;
                if (folderId != null) folder = OutlookMailbox.Call(session, "GetFolderFromID", folderId, folderStoreId);
                else if (stores.SelectedIndex >= 0)
                {
                    object store = OutlookMailbox.Call(session, "GetStoreFromID", storeIds[stores.SelectedIndex]);
                    try { folder = OutlookMailbox.Call(store, "GetDefaultFolder", 6); } finally { OutlookMailbox.Release(store); }
                }
                else folder = OutlookMailbox.Call(session, "GetDefaultFolder", 6);
                try
                {
                    object items = OutlookMailbox.Get(folder, "Items");
                    try
                    {
                        OutlookMailbox.Call(items, "Sort", "[ReceivedTime]", true);
                        int count = Math.Min(200, Convert.ToInt32(OutlookMailbox.Get(items, "Count")));
                        for (int i = 1; i <= count && contexts.Count < 40; i++) { object item = OutlookMailbox.Call(items, "Item", i); try { AddMessage(item, query.Text.Trim()); } finally { OutlookMailbox.Release(item); } }
                    }
                    finally { OutlookMailbox.Release(items); }
                }
                finally { OutlookMailbox.Release(folder); }
                status.Text = "Bieżąca wiadomość z Outlooka jest pierwsza, jeśli ma PDF. Do 40 wyników z 200 ostatnich wiadomości wybranego folderu (domyślnie Odebrane). Szukaj po nadawcy lub temacie.";
                if (contexts.Count > 0) messages.SelectedIndex = 0;
            }
            catch { status.Text = "Nie można odczytać wybranej skrzynki. Wybierz skrzynkę z listy lub otwórz wiadomość w Outlooku i ponów otwarcie okna."; }
            finally { UseWaitCursor = false; }
        }
        private object Message() { MailMessageContext c = contexts[messages.SelectedIndex]; return OutlookMailbox.Call(session, "GetItemFromID", c.OutlookEntryId, c.OutlookStoreId); }
        private void SelectMessage()
        {
            attachments.Items.Clear(); attachmentIndexes.Clear(); if (messages.SelectedIndex < 0) return; object item = null, collection = null;
            ShowLoading("Odczyt załączników wybranej wiadomości. Poczekaj…");
            try
            {
                item = Message(); collection = OutlookMailbox.Get(item, "Attachments"); int count = Math.Min(100, Convert.ToInt32(OutlookMailbox.Get(collection, "Count")));
                for (int i = 1; i <= count; i++) { object file = OutlookMailbox.Call(collection, "Item", i); try { string name = OutlookMailbox.Text(file, "FileName"); if (name.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) { attachmentIndexes.Add(i); attachments.Items.Add(name); } } finally { OutlookMailbox.Release(file); } }
                if (attachments.Items.Count <= maxDocuments) {
                    for (int i = 0; i < attachments.Items.Count; i++) attachments.SetItemChecked(i, true);
                    status.Text = "Wybierz załączniki PDF i kliknij Dodaj wybrane PDF do podpisu.";
                }
                else status.Text = "Wiadomość ma " + attachments.Items.Count + " PDF. Zaznacz maksymalnie " + maxDocuments + "; pozostałe podpiszesz w kolejnej partii.";
            }
            catch { status.Text = "Wiadomość zmieniła się lub zniknęła. Kliknij Szukaj i wybierz ją ponownie."; }
            finally { UseWaitCursor = false; OutlookMailbox.Release(collection); OutlookMailbox.Release(item); }
        }
        private void Download()
        {
            if (maxDocuments == 0) { status.Text = "Lista podpisu jest pełna. Usuń zapisane pliki z listy przed dodaniem kolejnych."; return; }
            if (messages.SelectedIndex < 0 || attachments.CheckedItems.Count == 0 || attachments.CheckedItems.Count > maxDocuments) { status.Text = "Zaznacz od 1 do " + maxDocuments + " załączników PDF."; return; }
            object item = null, collection = null;
            ShowLoading("Ładowanie wybranych załączników PDF. Poczekaj na podgląd dokumentu…");
            try
            {
                item = Message(); collection = OutlookMailbox.Get(item, "Attachments"); string directory = MailClient.NewWorkDirectory(); List<MailAttachmentDocument> documents = new List<MailAttachmentDocument>();
                foreach (int index in attachments.CheckedIndices)
                {
                    object file = OutlookMailbox.Call(collection, "Item", attachmentIndexes[index]);
                    try
                    {
                        if (Convert.ToInt64(OutlookMailbox.Get(file, "Size")) > 32L * 1024 * 1024) throw new IOException("PDF przekracza limit 32 MiB.");
                        string name = OutlookMailbox.Text(file, "FileName"), path = Path.Combine(directory, Guid.NewGuid().ToString("N").Substring(0, 8) + "-" + MailClient.SafeName(name));
                        ShowLoading("Ładowanie PDF: " + name + ". Poczekaj…");
                        OutlookMailbox.Call(file, "SaveAsFile", path);
                        using (FileStream input = File.OpenRead(path)) { byte[] header = new byte[5]; if (input.Length > 32L * 1024 * 1024 || input.Read(header, 0, 5) != 5 || Encoding.ASCII.GetString(header) != "%PDF-") throw new IOException("Załącznik nie jest poprawnym PDF lub przekracza 32 MiB."); }
                        documents.Add(new MailAttachmentDocument { Path = path, Name = name, Context = contexts[messages.SelectedIndex] });
                    }
                    finally { OutlookMailbox.Release(file); }
                }
                Documents.AddRange(documents); DialogResult = DialogResult.OK; Close();
            }
            catch (IOException ex) { status.Text = ex.Message; }
            catch { status.Text = "Nie pobrano wszystkich załączników. Oryginały pozostają w Outlooku. Spróbuj ponownie."; }
            finally { UseWaitCursor = false; OutlookMailbox.Release(collection); OutlookMailbox.Release(item); }
        }
    }

    internal static class OutlookReply
    {
        internal static string Create(MailMessageContext context, IList<string> signedPaths, IDictionary<string, string> expectedHashes, Func<object> open = null)
        {
            if (context == null || string.IsNullOrEmpty(context.OutlookEntryId) || string.IsNullOrEmpty(context.OutlookStoreId) || signedPaths == null || signedPaths.Count == 0 || signedPaths.Count > 8) throw new IOException("Brakuje kontekstu wiadomości lub podpisanych kopii.");
            string directory = MailClient.NewWorkDirectory(); List<string> copies = new List<string>(); long total = 0;
            foreach (string path in signedPaths)
            {
                using (FileStream input = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    total += input.Length; if (input.Length > 32L * 1024 * 1024 || total > 32L * 1024 * 1024) throw new IOException(MailClient.Friendly("TOO_LARGE"));
                    byte[] data = new byte[(int)input.Length]; int at = 0, count; while (at < data.Length && (count = input.Read(data, at, data.Length - at)) > 0) at += count;
                    string expected; if (at != data.Length || data.Length < 5 || Encoding.ASCII.GetString(data, 0, 5) != "%PDF-" || expectedHashes == null || !expectedHashes.TryGetValue(path, out expected) || expected != LocalDocument.Hash(data)) throw new IOException("Podpisana kopia zmieniła się. Przywróć zachowaną kopię przed przygotowaniem odpowiedzi.");
                    string copy = Path.Combine(directory, (copies.Count + 1).ToString() + "-" + MailClient.SafeName(Path.GetFileName(path))); using (FileStream output = new FileStream(copy, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { output.Write(data, 0, data.Length); output.Flush(true); } copies.Add(copy);
                }
            }
            object application = null, session = null, message = null, reply = null, attachments = null;
            try
            {
                application = (open ?? OutlookMailbox.Open)(); session = OutlookMailbox.Get(application, "Session"); message = OutlookMailbox.Call(session, "GetItemFromID", context.OutlookEntryId, context.OutlookStoreId); reply = OutlookMailbox.Call(message, "Reply");
                OutlookMailbox.Set(reply, "BodyFormat", 1); OutlookMailbox.Set(reply, "Body", "Dzień dobry,\r\n\r\nw załączeniu przesyłam podpisane dokumenty.\r\n\r\nPozdrawiam");
                attachments = OutlookMailbox.Get(reply, "Attachments");
                for (int i = Convert.ToInt32(OutlookMailbox.Get(attachments, "Count")); i > 0; i--) OutlookMailbox.Call(attachments, "Remove", i);
                foreach (string copy in copies) { object added = OutlookMailbox.Call(attachments, "Add", copy, 1, Type.Missing, Path.GetFileName(copy)); OutlookMailbox.Release(added); }
                string draft = Path.Combine(directory, "odpowiedz.msg"); OutlookMailbox.Call(reply, "SaveAs", draft, 9);
                if (!File.Exists(draft)) throw new IOException("Outlook nie zapisał szkicu. Podpisane kopie pozostają zachowane.");
                OutlookMailbox.Call(reply, "Display", false); return draft;
            }
            catch (Exception) { throw new IOException("Nie przygotowano odpowiedzi w Outlooku. Otwórz Outlook, sprawdź dostępność oryginalnej wiadomości i ponów — ponowne podpisanie nie jest potrzebne. Kopie zachowano: " + directory); }
            finally { OutlookMailbox.Release(attachments); OutlookMailbox.Release(reply); OutlookMailbox.Release(message); OutlookMailbox.Release(session); OutlookMailbox.Release(application); }
        }
    }
}
