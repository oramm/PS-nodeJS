#if DEBUG
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class MailSelfTest
    {
        internal static void Run(Action<bool, string> check)
        {
            string root = Path.Combine(Path.GetTempPath(), "envi-mail-test-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
            string originalStore = MailClient.DataDirectory; MailClient.DataDirectory = Path.Combine(root, "mail");
            string replyDirectory = null;
            try
            {
                MailMessageContext context = new MailMessageContext { Subject = "Pismo", MessageId = "<" + Guid.NewGuid().ToString("N") + "@example.invalid>", AccountEmail = "synthetic@example.invalid", To = new string[] { "sender@example.invalid" }, Cc = new string[0], Provider = "outlook", OutlookEntryId = "synthetic-entry", OutlookStoreId = "synthetic-store" };
                MailMessageContext restored = MailMessageContext.FromJson(Json.Parse(Json.Serialize(context)));
                MailClient.SaveAccount(new { email = "synthetic@example.invalid", password = "synthetic-test-only", imapHost = "imap.example.invalid", smtpHost = "smtp.example.invalid", smtpPort = 465 });
                check(Json.GetString(MailClient.ReadAccount(), "email") == "synthetic@example.invalid", "konto i adres zapamietane bez ponownego wpisywania");
                using (MailAccountForm account = new MailAccountForm())
                    check(((TextBox)typeof(MailAccountForm).GetField("email", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(account)).Text == "synthetic@example.invalid" &&
                        ((TextBox)typeof(MailAccountForm).GetField("imap", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(account)).Text == "imap.example.invalid" &&
                        ((TextBox)typeof(MailAccountForm).GetField("smtp", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(account)).Text == "smtp.example.invalid", "ponowne otwarcie ustawien wypelnia adres i oba serwery");
                using (MailSourceForm source = new MailSourceForm(root, 3))
                {
                    check((int)typeof(MailSourceForm).GetField("maxDocuments", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(source) == 3, "poczta respektuje pozostale miejsca na liscie podpisu");
                    var sourceResults = (List<object>)typeof(MailSourceForm).GetField("results", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(source);
                    List<object> many = new List<object>(); for (int i = 0; i < 5; i++) many.Add(new { name = "pismo.pdf", size = 100, part = i.ToString() });
                    sourceResults.Add(Json.Parse(Json.Serialize(new { attachments = many })));
                    ListBox messages = (ListBox)typeof(MailSourceForm).GetField("messages", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(source); messages.Items.Add("Syntetyczna wiadomosc"); messages.SelectedIndex = 0;
                    CheckedListBox files = (CheckedListBox)typeof(MailSourceForm).GetField("files", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(source);
                    check(files.Items.Count == 5 && files.CheckedItems.Count == 0, "nadmiar zalacznikow wymaga jawnego wyboru zamiast cichego podpisania podzbioru");
                    typeof(MailSourceForm).GetField("searchIdentity", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(source, MailClient.AccountIdentity(MailClient.ReadAccount())); files.SetItemChecked(0, true);
                    MailClient.SaveAccount(new { email = "other@example.invalid", password = "synthetic-test-only", imapHost = "imap.example.invalid", smtpHost = "smtp.example.invalid", smtpPort = 465 });
                    ((System.Threading.Tasks.Task)typeof(MailSourceForm).GetMethod("Download", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(source, null)).GetAwaiter().GetResult();
                    check(source.Documents.Count == 0 && messages.Items.Count == 0 && files.Items.Count == 0, "zmiana konta odrzuca stare UID i czysci wybor przed pobraniem");
                    MailClient.SaveAccount(new { email = "synthetic@example.invalid", password = "synthetic-test-only", imapHost = "imap.example.invalid", smtpHost = "smtp.example.invalid", smtpPort = 465 });
                }
                check(restored.Subject == context.Subject && restored.MessageId == context.MessageId && restored.To[0] == context.To[0] && restored.AccountEmail == context.AccountEmail && restored.Provider == "outlook" && restored.OutlookEntryId == "synthetic-entry" && restored.OutlookStoreId == "synthetic-store", "kontekst poczty i Outlooka przezywa zapis i wznowienie");
                check(MailClient.SafeName("../CON.pdf").IndexOfAny(Path.GetInvalidFileNameChars()) < 0 && MailClient.SafeName("CON").StartsWith("pismo-"), "nazwa zalacznika nie tworzy sciezki ani urzadzenia Windows");
                string file = Path.Combine(root, "podpisane.pdf"); byte[] content = System.Text.Encoding.ASCII.GetBytes("%PDF-1.4\nsynthetic\n%%EOF"); File.WriteAllBytes(file, content);
                Dictionary<string, string> hashes = new Dictionary<string, string> { { file, LocalDocument.Hash(content) } };
                using (MailReplyForm form = new MailReplyForm(root, restored, new string[] { file }, hashes))
                {
                    replyDirectory = Path.GetDirectoryName(form.DraftPath);
                    check(!form.Completed && !form.Sent, "otwarcie formularza nie oznacza przygotowania ani wyslania");
                    ((TextBox)typeof(MailReplyForm).GetField("to", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(form)).Text = "changed@example.invalid";
                    ((TextBox)typeof(MailReplyForm).GetField("body", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(form)).Text = "Zapamietana tresc";
                    typeof(MailReplyForm).GetMethod("SaveFields", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(form, null);
                }
                using (MailReplyForm form = new MailReplyForm(root, restored, new string[] { file }, hashes))
                {
                    check(((TextBox)typeof(MailReplyForm).GetField("to", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(form)).Text == "changed@example.invalid" &&
                        ((TextBox)typeof(MailReplyForm).GetField("body", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(form)).Text == "Zapamietana tresc", "zmienieni odbiorcy i tresc zachowani po ponownym otwarciu");
                    File.WriteAllText(Path.Combine(replyDirectory, "wysylka-rozpoczeta.txt"), "synthetic");
                }
                using (MailReplyForm form = new MailReplyForm(root, restored, new string[] { file }, hashes))
                    check(!((Button)typeof(MailReplyForm).GetField("send", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(form)).Enabled, "nieznany wynik wysylki blokuje ponowienie po wznowieniu");
                string renamed = Path.Combine(root, "odtworzony-pdp-1.pdf"); File.WriteAllBytes(renamed, content);
                using (MailReplyForm form = new MailReplyForm(root, restored, new string[] { renamed }, new Dictionary<string, string> { { renamed, hashes[file] } }))
                    check(Path.GetDirectoryName(form.DraftPath) == replyDirectory && !((Button)typeof(MailReplyForm).GetField("send", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(form)).Enabled, "odtworzenie tych samych podpisanych bajtow pod inna nazwa nie omija blokady wysylki");
                FakeOutlook outlook = new FakeOutlook();
                string nativeDraft = OutlookReply.Create(restored, new string[] { file }, hashes, delegate { return outlook; });
                check(File.Exists(nativeDraft) && outlook.Session.Original.Response.Displayed && outlook.Session.Original.Response.Attachments.Payloads.Count == 1 &&
                    LocalDocument.Hash(outlook.Session.Original.Response.Attachments.Payloads[0]) == hashes[file], "Outlook: lokalny szkic i widoczna odpowiedz z dokladnie podpisanym zalacznikiem");
                check(outlook.Session.Original.Response.Attachments.Removed == 2 && outlook.Session.Original.Replies == 1, "Outlook: oryginalne zalaczniki usuniete tylko z nowej odpowiedzi; brak automatycznego Send");
                File.WriteAllText(file, "%PDF-1.4\nchanged\n%%EOF"); bool rejected = false;
                try { using (MailReplyForm form = new MailReplyForm(root, restored, new string[] { file }, hashes)) { } }
                catch (IOException ex) { rejected = ex.Message.Contains("zmieniła"); }
                check(rejected, "podmieniona podpisana kopia odrzucona przed szkicem");
                int opened = 0; rejected = false;
                try { OutlookReply.Create(restored, new string[] { file }, hashes, delegate { opened++; return outlook; }); }
                catch (IOException) { rejected = true; }
                check(rejected && opened == 0, "Outlook: podmiana podpisanego PDF zatrzymana przed otwarciem poczty");
            }
            finally { MailClient.DataDirectory = originalStore; Directory.Delete(root, true); }
        }
        public sealed class FakeOutlook
        {
            public FakeSession Session { get; private set; }
            public FakeOutlook() { Session = new FakeSession(); }
        }
        public sealed class FakeSession
        {
            public FakeOriginal Original = new FakeOriginal();
            public object GetItemFromID(string entry, string store) { if (entry != "synthetic-entry" || store != "synthetic-store") throw new Exception("wrong original"); return Original; }
        }
        public sealed class FakeOriginal
        {
            public FakeResponse Response = new FakeResponse(); public int Replies;
            public object Reply() { Replies++; return Response; }
        }
        public sealed class FakeResponse
        {
            public int BodyFormat { get; set; } public string Body { get; set; }
            public FakeAttachments Attachments { get; private set; } public bool Displayed;
            public FakeResponse() { Attachments = new FakeAttachments(); }
            public void SaveAs(string path, int format) { if (format != 9) throw new Exception("not Unicode MSG"); File.WriteAllText(path, "synthetic-only-msg"); }
            public void Display(bool modal) { Displayed = true; }
        }
        public sealed class FakeAttachments
        {
            public int Count { get { return 2 - Removed + Payloads.Count; } }
            public int Removed; public List<byte[]> Payloads = new List<byte[]>();
            public void Remove(int index) { Removed++; }
            public object Add(string path, int type, object position = null, string name = null) { if (type != 1) throw new Exception("not by value"); Payloads.Add(File.ReadAllBytes(path)); return null; }
        }
    }
}
#endif
