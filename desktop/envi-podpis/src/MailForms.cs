using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal sealed class MailAccountForm : Form
    {
        private readonly TextBox email = new TextBox(), password = new TextBox(), imap = new TextBox(), smtp = new TextBox();
        private readonly ComboBox port = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
        internal MailAccountForm()
        {
            Text = "Konto pocztowe — ustaw raz"; Font = new Font("Segoe UI", 10); ClientSize = new Size(630, 360); MinimumSize = Size;
            StartPosition = FormStartPosition.CenterParent; password.UseSystemPasswordChar = true; port.Items.AddRange(new object[] { "465 — TLS", "587 — STARTTLS" }); port.SelectedIndex = 0;
            TableLayoutPanel layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 2, RowCount = 7 };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 170)); layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            Add(layout, "Adres konta", email, 0); Add(layout, "Hasło / hasło aplikacji", password, 1); Add(layout, "Serwer IMAP (993)", imap, 2); Add(layout, "Serwer SMTP", smtp, 3); Add(layout, "Port SMTP", port, 4);
            Label note = new Label { Text = "Ustawienia i hasło są szyfrowane dla tego konta Windows.\r\nDane wpisujesz raz. Połączenia wymagają poprawnego certyfikatu TLS.", Dock = DockStyle.Fill, AutoSize = true };
            layout.Controls.Add(note, 0, 5); layout.SetColumnSpan(note, 2);
            Button save = new Button { Text = "Zapamiętaj konto", AutoSize = true }; save.Click += delegate { Save(); }; layout.Controls.Add(save, 1, 6); Controls.Add(layout);
            if (MailClient.Configured) try { object data = MailClient.ReadAccount(); email.Text = Json.GetString(data, "email"); password.Text = Json.GetString(data, "password"); imap.Text = Json.GetString(data, "imapHost"); smtp.Text = Json.GetString(data, "smtpHost"); port.SelectedIndex = Json.GetInt(data, "smtpPort", 465) == 587 ? 1 : 0; } catch (IOException) { }
        }
        private static void Add(TableLayoutPanel panel, string label, Control field, int row)
        { panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 42)); panel.Controls.Add(new Label { Text = label, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, row); field.Dock = DockStyle.Fill; panel.Controls.Add(field, 1, row); }
        private void Save()
        {
            try
            {
                string address = email.Text.Trim(); System.Net.Mail.MailAddress parsed = new System.Net.Mail.MailAddress(address);
                if (parsed.Address != address || string.IsNullOrWhiteSpace(password.Text) || !Host(imap.Text.Trim()) || !Host(smtp.Text.Trim())) throw new FormatException();
                MailClient.SaveAccount(new { email = address, password = password.Text, imapHost = imap.Text.Trim(), smtpHost = smtp.Text.Trim(), smtpPort = port.SelectedIndex == 1 ? 587 : 465 });
                DialogResult = DialogResult.OK; Close();
            }
            catch { MessageBox.Show(this, "Wpisz poprawny adres konta, hasło i nazwy serwerów (bez https://). Dane serwerów podaje dostawca poczty.", "Uzupełnij konto", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        }
        private static bool Host(string value) { return value.Length > 0 && value.Length <= 253 && System.Text.RegularExpressions.Regex.IsMatch(value, "^[a-zA-Z0-9][a-zA-Z0-9.-]*$"); }
    }

    internal sealed class MailSourceForm : Form
    {
        private readonly MailClient client;
        private readonly TextBox query = new TextBox();
        private readonly ListBox messages = new ListBox { Dock = DockStyle.Fill, HorizontalScrollbar = true };
        private readonly CheckedListBox files = new CheckedListBox { Dock = DockStyle.Fill, CheckOnClick = true, HorizontalScrollbar = true };
        private readonly Label status = new Label { Dock = DockStyle.Fill, AutoSize = true };
        private readonly Button search = new Button { Text = "Szukaj", AutoSize = true }, settings = new Button { Text = "Ustawienia poczty", AutoSize = true }, add = new Button { Text = "Dodaj wybrane PDF do podpisu", AutoSize = true };
        private readonly List<object> results = new List<object>();
        private readonly int maxDocuments;
        private readonly Dictionary<string, MailAttachmentDocument> downloaded = new Dictionary<string, MailAttachmentDocument>();
        private string downloadDirectory;
        private string searchIdentity;
        private bool busy;
        public readonly List<MailAttachmentDocument> Documents = new List<MailAttachmentDocument>();
        internal MailSourceForm(string workerDirectory, int maxDocuments = 8)
        {
            this.maxDocuments = Math.Max(0, Math.Min(8, maxDocuments));
            client = new MailClient(workerDirectory); Text = "Poczta — znajdź pismo do podpisania"; Font = new Font("Segoe UI", 10); ClientSize = new Size(950, 620); MinimumSize = new Size(720, 460); StartPosition = FormStartPosition.CenterParent;
            TableLayoutPanel layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 7 };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 55)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 26)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 45)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 58)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
            layout.Controls.Add(new Label { Text = "Nadawca lub temat. Do 40 wyników z ostatnich 2000 wiadomości w Odebranych (180 dni).", Dock = DockStyle.Fill }, 0, 0);
            TableLayoutPanel bar = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3 }; bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); bar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); bar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            query.Dock = DockStyle.Fill; bar.Controls.Add(query, 0, 0); bar.Controls.Add(search, 1, 0); bar.Controls.Add(settings, 2, 0); layout.Controls.Add(bar, 0, 1);
            layout.Controls.Add(messages, 0, 2); layout.Controls.Add(new Label { Text = "PDF w wybranej wiadomości — odznacz zbędne. Miejsce na liście podpisu: " + this.maxDocuments + " PDF (maks. 8 w partii).", Dock = DockStyle.Fill }, 0, 3); layout.Controls.Add(files, 0, 4); layout.Controls.Add(status, 0, 5); layout.Controls.Add(add, 0, 6); Controls.Add(layout);
            search.Click += async delegate { await Search(); }; query.KeyDown += async delegate(object sender, KeyEventArgs e) { if (e.KeyCode == Keys.Enter && !busy) { e.SuppressKeyPress = true; await Search(); } };
            settings.Click += delegate { using (MailAccountForm form = new MailAccountForm()) if (form.ShowDialog(this) == DialogResult.OK) { ClearResults(); status.Text = "Konto zapamiętane. Kliknij Szukaj, aby odczytać wiadomości z tego konta."; } };
            messages.SelectedIndexChanged += delegate { SelectMessage(); }; add.Click += async delegate { await Download(); };
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) { e.Cancel = true; status.Text = "Trwa operacja poczty; poczekaj na wynik (do 90 sekund)."; } };
            Shown += async delegate { if (MailClient.Configured) await Search(); else status.Text = "Brakuje konta pocztowego. Kliknij Ustawienia poczty — wpiszesz dane tylko raz."; };
        }
        private void Busy(bool value) { UseWaitCursor = value; busy = value; search.Enabled = settings.Enabled = add.Enabled = messages.Enabled = files.Enabled = query.Enabled = !value; }
        private void ClearResults()
        { searchIdentity = null; results.Clear(); messages.Items.Clear(); files.Items.Clear(); downloaded.Clear(); Documents.Clear(); downloadDirectory = null; }
        private async Task Search()
        {
            if (!MailClient.Configured) { using (MailAccountForm form = new MailAccountForm()) if (form.ShowDialog(this) != DialogResult.OK) return; }
            Busy(true); status.Text = "Szukanie wiadomości z załącznikami PDF…";
            try
            {
                string identity = MailClient.AccountIdentity(MailClient.ReadAccount());
                object response = await client.Request(new Dictionary<string, object> { { "op", "search" }, { "query", query.Text.Trim() } }, identity);
                if (identity != MailClient.AccountIdentity(MailClient.ReadAccount())) throw new IOException("Konto pocztowe zmieniło się. Kliknij Szukaj ponownie.");
                ClearResults(); searchIdentity = identity;
                results.Clear(); results.AddRange(Json.GetList(response, "messages")); messages.Items.Clear(); files.Items.Clear();
                foreach (object result in results) messages.Items.Add(Json.GetString(result, "date") + "  |  " + Json.GetString(result, "from") + "  |  " + Json.GetString(result, "subject"));
                status.Text = results.Count == 0 ? "Brak pasujących PDF w ostatnich 2000 wiadomościach / 180 dniach. Zmień temat lub nadawcę i kliknij Szukaj." : "Wybierz wiadomość i sprawdź załączniki. Oryginały i znaczniki przeczytania pozostają bez zmian.";
                if (results.Count > 0) messages.SelectedIndex = 0;
            }
            catch (Exception ex) { status.Text = ex.Message; }
            finally { Busy(false); }
        }
        private void SelectMessage()
        {
            files.Items.Clear(); if (messages.SelectedIndex < 0) return;
            List<object> attachments = Json.GetList(results[messages.SelectedIndex], "attachments");
            foreach (object attachment in attachments) files.Items.Add(Json.GetString(attachment, "name") + " (" + (Json.GetInt(attachment, "size", 0) / 1024) + " KB)", attachments.Count <= maxDocuments);
            if (attachments.Count > maxDocuments) status.Text = "Wiadomość ma " + attachments.Count + " PDF. Zaznacz najwyżej " + maxDocuments + " dokumentów; pozostałe podpiszesz w kolejnej partii.";
        }
        private async Task Download()
        {
            try { if (searchIdentity == null || searchIdentity != MailClient.AccountIdentity(MailClient.ReadAccount())) { ClearResults(); status.Text = "Konto pocztowe zmieniło się. Kliknij Szukaj i wybierz wiadomość z bieżącego konta."; return; } }
            catch (IOException ex) { ClearResults(); status.Text = ex.Message; return; }
            if (maxDocuments == 0) { status.Text = "Lista podpisu jest pełna. Zamknij okno i usuń zapisane pliki z listy przed dodaniem kolejnych."; return; }
            if (messages.SelectedIndex < 0 || files.CheckedIndices.Count == 0) { status.Text = "Wybierz wiadomość, a poniżej zaznacz co najmniej jeden załącznik PDF."; return; }
            if (files.CheckedIndices.Count > maxDocuments) { status.Text = "Możesz dodać jeszcze " + maxDocuments + " PDF. Odznacz nadmiarowe dokumenty; niczego nie pominiemy automatycznie."; return; }
            object message = results[messages.SelectedIndex]; List<object> attachments = Json.GetList(message, "attachments"); int[] selected = files.CheckedIndices.Cast<int>().ToArray();
            Busy(true); status.Text = "Pobieranie wybranych PDF do prywatnego katalogu…";
            try
            {
                if (downloadDirectory == null) downloadDirectory = MailClient.NewWorkDirectory();
                object account = MailClient.ReadAccount();
                if (MailClient.AccountIdentity(account) != searchIdentity) throw new IOException("Konto pocztowe zmieniło się. Wyszukaj wiadomość ponownie.");
                MailMessageContext context = new MailMessageContext { Subject = Json.GetString(message, "subject"), MessageId = Json.GetString(message, "messageId"), To = Json.GetList(message, "to").Select(Convert.ToString).ToArray(), Cc = new string[0], AccountEmail = Json.GetString(account, "email"), Provider = "imap", ImapHost = Json.GetString(account, "imapHost"), ImapUidValidity = Json.GetString(message, "validity"), ImapUid = Json.GetString(message, "uid") };
                List<MailAttachmentDocument> chosen = new List<MailAttachmentDocument>();
                foreach (int index in selected)
                {
                    object attachment = attachments[index]; string key = searchIdentity + "/" + Json.GetString(message, "validity") + "/" + Json.GetString(message, "uid") + "/" + Json.GetString(attachment, "part"); MailAttachmentDocument document;
                    if (!downloaded.TryGetValue(key, out document))
                    {
                        object response = await client.Request(new Dictionary<string, object> { { "op", "download" }, { "uid", Json.GetInt(message, "uid", 0) }, { "validity", Json.GetString(message, "validity") }, { "part", Json.GetString(attachment, "part") } }, searchIdentity);
                        byte[] data = Convert.FromBase64String(Json.GetString(response, "data"));
                        if (data.Length > 32 * 1024 * 1024 || data.Length < 5 || Encoding.ASCII.GetString(data, 0, 5) != "%PDF-") throw new IOException("Załącznik nie jest poprawnym PDF lub przekracza 32 MiB.");
                        string name = MailClient.SafeName(Json.GetString(attachment, "name")); string path = Path.Combine(downloadDirectory, Guid.NewGuid().ToString("N").Substring(0, 8) + "-" + name);
                        using (FileStream file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { file.Write(data, 0, data.Length); file.Flush(true); }
                        document = new MailAttachmentDocument { Path = path, Name = name, Context = context }; downloaded.Add(key, document);
                    }
                    chosen.Add(document);
                }
                Documents.Clear(); Documents.AddRange(chosen); DialogResult = DialogResult.OK; busy = false; Close();
            }
            catch (Exception ex) { status.Text = ex.Message + " Pobrane wcześniej kopie są zachowane; możesz ponowić pobieranie."; }
            finally { Busy(false); }
        }
    }

    internal sealed class MailReplyForm : Form
    {
        private readonly MailClient client;
        private readonly MailMessageContext context;
        private readonly IList<string> signedPaths;
        private readonly TextBox to = new TextBox(), cc = new TextBox(), subject = new TextBox(), body = new TextBox { Multiline = true, ScrollBars = ScrollBars.Vertical };
        private readonly Label status = new Label { Dock = DockStyle.Fill, AutoSize = true };
        private readonly Button send = new Button { Text = "Zatwierdzam odbiorców i załączniki — wyślij", AutoSize = true }, draft = new Button { Text = "Zapisz szkic do programu pocztowego", AutoSize = true };
        private readonly Button settings = new Button { Text = "Ustawienia poczty", AutoSize = true };
        private readonly string directory;
        private readonly List<object> attachments = new List<object>();
        private bool busy;
        internal string DraftPath { get { return Path.Combine(directory, "odpowiedz.eml"); } }
        internal bool Completed { get { return File.Exists(DraftPath); } }
        internal bool Sent { get { return File.Exists(SentPath); } }
        private string AttemptPath { get { return Path.Combine(directory, "wysylka-rozpoczeta.txt"); } }
        private string SentPath { get { return Path.Combine(directory, "wyslano.txt"); } }
        internal MailReplyForm(string workerDirectory, MailMessageContext context, IList<string> signedPaths, IDictionary<string, string> expectedHashes = null)
        {
            this.context = context; this.signedPaths = signedPaths; client = new MailClient(workerDirectory);
            if (signedPaths == null || signedPaths.Count == 0) throw new IOException("Brakuje podpisanych kopii do odpowiedzi.");
            long size = 0; List<string> attachmentHashes = new List<string>();
            StringBuilder identity = new StringBuilder((context.AccountEmail ?? "").Trim().ToLowerInvariant() + "\n" + (context.Provider ?? "") + "\n" + (context.ImapHost ?? "").Trim().ToLowerInvariant() + "\n" + context.ImapUidValidity + "\n" + context.ImapUid + "\n" + context.MessageId);
            foreach (string path in signedPaths)
            {
                using (FileStream file = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    if (file.Length > 32 * 1024 * 1024) throw new IOException(MailClient.Friendly("TOO_LARGE"));
                    byte[] data = new byte[(int)file.Length]; int count = 0, read;
                    while (count < data.Length && (read = file.Read(data, count, data.Length - count)) > 0) count += read;
                    if (count != data.Length || data.Length < 5 || Encoding.ASCII.GetString(data, 0, 5) != "%PDF-") throw new IOException("Nie można odczytać podpisanej kopii PDF.");
                    string expected;
                    if (expectedHashes != null && (!expectedHashes.TryGetValue(path, out expected) || expected != LocalDocument.Hash(data))) throw new IOException("Podpisana kopia zmieniła się od sprawdzenia podpisu. Przywróć zachowaną kopię podpisaną przed przygotowaniem odpowiedzi.");
                    size += data.Length; if (size > 32 * 1024 * 1024) throw new IOException(MailClient.Friendly("TOO_LARGE"));
                    attachmentHashes.Add(LocalDocument.Hash(data));
                    attachments.Add(new { name = Path.GetFileName(path), data = Convert.ToBase64String(data) });
                }
            }
            foreach (string hash in attachmentHashes.OrderBy(h => h, StringComparer.Ordinal)) identity.Append("\n" + hash);
            string key; using (SHA256 hash = SHA256.Create()) key = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(identity.ToString()))).Replace("-", "");
            directory = Path.Combine(MailClient.DataDirectory, "Replies", key); MailClient.PrivateDirectory(directory);
            Text = "Odpowiedź z podpisanymi pismami — sprawdź przed wysłaniem"; Font = new Font("Segoe UI", 10); ClientSize = new Size(950, 660); MinimumSize = new Size(760, 540); StartPosition = FormStartPosition.CenterParent;
            TableLayoutPanel layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 2, RowCount = 8 }; layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100)); layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            for (int i = 0; i < 3; i++) layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 90)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
            to.Text = string.Join("; ", context.To ?? new string[0]); cc.Text = string.Join("; ", context.Cc ?? new string[0]); subject.Text = (context.Subject ?? "").StartsWith("Re:", StringComparison.OrdinalIgnoreCase) ? context.Subject : "Re: " + context.Subject; body.Text = "Dzień dobry,\r\n\r\nw załączeniu przesyłam podpisane dokumenty.\r\n\r\nPozdrawiam";
            string fieldsPath = Path.Combine(directory, "tresc.json");
            if (File.Exists(fieldsPath))
            {
                if (new FileInfo(fieldsPath).Length > 262144 || (File.GetAttributes(fieldsPath) & FileAttributes.ReparsePoint) != 0) throw new IOException("Nieprawidłowy zapis szkicu poczty.");
                object fields = Json.Parse(File.ReadAllText(fieldsPath));
                to.Text = Json.GetString(fields, "to"); cc.Text = Json.GetString(fields, "cc"); subject.Text = Json.GetString(fields, "subject"); body.Text = Json.GetString(fields, "body");
            }
            Add(layout, "Do", to, 0); Add(layout, "DW", cc, 1); Add(layout, "Temat", subject, 2); Add(layout, "Treść", body, 3);
            ListBox names = new ListBox { Dock = DockStyle.Fill, HorizontalScrollbar = true }; foreach (string path in signedPaths) names.Items.Add(Path.GetFileName(path) + "   —   " + path); Add(layout, "Załączniki", names, 4);
            layout.Controls.Add(status, 0, 5); layout.SetColumnSpan(status, 2); layout.Controls.Add(send, 1, 6); layout.Controls.Add(draft, 1, 7); layout.Controls.Add(settings, 0, 7); Controls.Add(layout);
            send.Click += async delegate { await Send(); }; draft.Click += async delegate { await SaveDraft(true); };
            settings.Click += delegate { using (MailAccountForm form = new MailAccountForm()) form.ShowDialog(this); };
            FormClosing += delegate(object sender, FormClosingEventArgs e) {
                if (busy) { e.Cancel = true; status.Text = "Poczekaj na wynik operacji poczty. Podpisane kopie pozostają zapisane."; }
                else if (!File.Exists(AttemptPath)) try { SaveFields(); } catch (Exception ex) { e.Cancel = true; status.Text = "Nie zapisano treści szkicu: " + ex.Message; }
            };
            Shown += async delegate { await SaveDraft(false); };
            RefreshState();
        }
        private static void Add(TableLayoutPanel layout, string text, Control control, int row) { layout.Controls.Add(new Label { Text = text, Dock = DockStyle.Fill, TextAlign = ContentAlignment.TopLeft }, 0, row); control.Dock = DockStyle.Fill; layout.Controls.Add(control, 1, row); }
        private void RefreshState()
        {
            send.Enabled = !busy && !File.Exists(AttemptPath); draft.Enabled = settings.Enabled = !busy; to.ReadOnly = cc.ReadOnly = subject.ReadOnly = body.ReadOnly = busy || File.Exists(AttemptPath);
            if (File.Exists(SentPath)) status.Text = "Serwer SMTP potwierdził wysłanie. Podpisane kopie i szkic są zachowane. SMTP nie zapisuje wiadomości w folderze Wysłane.";
            else if (File.Exists(AttemptPath)) status.Text = "Wysyłkę już rozpoczęto. Wynik może być nieznany — sprawdź pocztę przed wysłaniem szkicu ponownie. Podpisane kopie są bezpieczne.\r\nSzkic: " + DraftPath;
        }
        private static string[] Addresses(string text) { return text.Split(new char[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).ToArray(); }
        private void SaveFields()
        {
            string path = Path.Combine(directory, "tresc.json"), temporary = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");
            byte[] value = Encoding.UTF8.GetBytes(Json.Serialize(new { to = to.Text, cc = cc.Text, subject = subject.Text, body = body.Text }));
            using (FileStream file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { file.Write(value, 0, value.Length); file.Flush(true); }
            if (File.Exists(path)) File.Replace(temporary, path, null); else File.Move(temporary, path);
        }
        private async Task<object> Compose()
        {
            SaveFields();
            object account = MailClient.ReadAccount();
            if (!string.Equals(Json.GetString(account, "email"), context.AccountEmail, StringComparison.OrdinalIgnoreCase)) throw new IOException("Wybrane konto pocztowe różni się od konta wiadomości. Przywróć właściwe konto w Ustawieniach poczty.");
            object result = await client.Request(new Dictionary<string, object> { { "op", "draft" }, { "to", Addresses(to.Text) }, { "cc", Addresses(cc.Text) }, { "subject", subject.Text }, { "body", body.Text }, { "inReplyTo", context.MessageId }, { "attachments", attachments } });
            byte[] data = Convert.FromBase64String(Json.GetString(result, "raw")); string temporary = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");
            using (FileStream file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { file.Write(data, 0, data.Length); file.Flush(true); }
            if (File.Exists(DraftPath)) File.Replace(temporary, DraftPath, null); else File.Move(temporary, DraftPath);
            return result;
        }
        private async Task SaveDraft(bool show)
        {
            busy = true; RefreshState();
            try
            {
                if (!File.Exists(AttemptPath)) await Compose();
                status.Text = "Odpowiedź jest gotowa. Sprawdź odbiorców, treść i podpisane PDF, następnie zatwierdź wysłanie.\r\nSzkic: " + DraftPath;
                if (show) { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", "/select,\"" + DraftPath + "\"") { UseShellExecute = true }); }
            }
            catch (Exception ex) { status.Text = ex.Message + " Podpisane kopie nie wymagają ponownego podpisania."; }
            finally { busy = false; RefreshState(); }
        }
        private async Task Send()
        {
            if (File.Exists(AttemptPath)) { RefreshState(); return; }
            busy = true; RefreshState(); status.Text = "Zapisywanie szkicu i wysyłanie zatwierdzonej odpowiedzi…";
            try
            {
                object prepared = await Compose();
                // A durable marker prevents duplicate sends after a timeout, crash or reopening.
                using (FileStream marker = new FileStream(AttemptPath, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { byte[] value = Encoding.UTF8.GetBytes(DateTime.UtcNow.ToString("o")); marker.Write(value, 0, value.Length); marker.Flush(true); }
                await client.Request(new Dictionary<string, object> { { "op", "send" }, { "raw", Json.GetString(prepared, "raw") }, { "envelope", Json.AsObject(prepared)["envelope"] } });
                File.WriteAllText(SentPath, DateTime.UtcNow.ToString("o"));
            }
            catch (MailException ex) { if (ex.Code == "SEND_NOT_STARTED" && File.Exists(AttemptPath)) try { File.Delete(AttemptPath); } catch (IOException) { } status.Text = ex.Message + "\r\nSzkic i podpisane kopie są zachowane: " + DraftPath; }
            catch (Exception ex) { status.Text = ex.Message + "\r\nSzkic i podpisane kopie są zachowane: " + DraftPath; }
            finally { busy = false; RefreshState(); }
        }
    }
}
