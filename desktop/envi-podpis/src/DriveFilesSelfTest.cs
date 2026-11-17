#if DEBUG
using System;
using System.IO;
using System.Drawing;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class DriveFilesSelfTest
    {
        private sealed class Transport : HttpMessageHandler
        {
            internal Func<HttpRequestMessage, Task<HttpResponseMessage>> Handle;
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            {
                if (request.RequestUri.Host != "www.googleapis.com" || request.Headers.Authorization.Parameter != "offline-test") throw new Exception("Untrusted transport request");
                return Handle(request);
            }
        }
        private static HttpResponseMessage Response(string json, HttpStatusCode status = HttpStatusCode.OK)
        { return new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8) }; }
        internal static void Run(Action<bool, string> check)
        {
            RunAsync(check).GetAwaiter().GetResult();
        }
        internal static void RunPicker(string directory, Action<bool, string> check)
        {
            string lastQuery = null, lastFolderRequest = null;
            Transport transport = new Transport();
            transport.Handle = delegate(HttpRequestMessage request) {
                string path = request.RequestUri.AbsolutePath;
                if (path.EndsWith("/about")) return Task.FromResult(Response("{\"user\":{\"permissionId\":\"test-picker\"}}"));
                if (path.EndsWith("/drives")) return Task.FromResult(Response("{\"drives\":[]}"));
                if (path.EndsWith("/files/root")) { lastFolderRequest = "root"; return Task.FromResult(Response("{\"id\":\"root\",\"name\":\"Mój Dysk\",\"mimeType\":\"application/vnd.google-apps.folder\"}")); }
                if (path.EndsWith("/files/folder")) { lastFolderRequest = "folder"; return Task.FromResult(Response("{\"id\":\"folder\",\"name\":\"Folder testowy\",\"mimeType\":\"application/vnd.google-apps.folder\",\"parents\":[\"root\"]}")); }
                lastQuery = System.Web.HttpUtility.ParseQueryString(request.RequestUri.Query)["q"];
                return Task.FromResult(Response("{\"files\":[{\"id\":\"folder\",\"name\":\"Folder testowy\",\"mimeType\":\"application/vnd.google-apps.folder\",\"parents\":[\"root\"]},{\"id\":\"one\",\"name\":\"Pierwszy.pdf\",\"mimeType\":\"application/pdf\",\"parents\":[\"folder\"]},{\"id\":\"two\",\"name\":\"Drugi.pdf\",\"mimeType\":\"application/pdf\",\"parents\":[\"folder\"]}]}"));
            };
            using (DriveFilesForm form = new DriveFilesForm(new DriveAuth(), new DriveFiles(delegate { return Task.FromResult("offline-test"); }, transport)))
            {
                form.Show(); Application.DoEvents();
                check(Field<ComboBox>(form, "location").SelectedIndex >= 0 && !string.IsNullOrEmpty(Field<ComboBox>(form, "location").Text), "Drive picker: visible location control has a selected readable label");
                ListView list = Field<ListView>(form, "list");
                TextBox search = Field<TextBox>(form, "search");
                typeof(DriveFilesForm).GetField("folder", BindingFlags.NonPublic | BindingFlags.Instance).SetValue(form,
                    new DriveFile { Id = "unrelated", Name = "Inny folder", MimeType = "application/vnd.google-apps.folder" });
                search.Text = "https://drive.google.com/drive/folders/folder";
                Wait((Task)typeof(DriveFilesForm).GetMethod("LoadPage", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, new object[] { false }));
                check(lastQuery.Contains("'folder' in parents") && search.Text == "", "Drive picker: pasted link opens folder rather than searching link text");
                Wait((Task)typeof(DriveFilesForm).GetMethod("GoUp", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, null));
                check(lastFolderRequest == "root" && Field<DriveFile>(form, "folder").Id == "root", "Drive picker: up from pasted link opens actual parent, not previous unrelated folder");
                search.Text = "https://drive.google.com/drive/folders/folder";
                Wait((Task)typeof(DriveFilesForm).GetMethod("LoadPage", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, new object[] { false }));
                search.Text = "Folder";
                Wait((Task)typeof(DriveFilesForm).GetMethod("LoadPage", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, new object[] { false }));
                check(lastQuery.Contains("name contains 'Folder'") && !lastQuery.Contains(" in parents"), "Drive picker: default name search reaches folders outside current folder");
                list.Items[0].Selected = true;
                Wait((Task)typeof(DriveFilesForm).GetMethod("OpenSelected", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, null));
                Wait((Task)typeof(DriveFilesForm).GetMethod("GoUp", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, null));
                check(lastFolderRequest == "root" && Field<DriveFile>(form, "folder").Id == "root", "Drive picker: up from global folder result opens actual parent");
                search.Text = "https://drive.google.com/drive/folders/folder";
                Wait((Task)typeof(DriveFilesForm).GetMethod("LoadPage", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, new object[] { false }));
                search.Text = "Folder";
                Field<CheckBox>(form, "everywhere").Checked = false;
                Wait((Task)typeof(DriveFilesForm).GetMethod("LoadPage", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, new object[] { false }));
                check(lastQuery.Contains("'folder' in parents"), "Drive picker: user can restrict name search to current folder");
                list.Items[0].Selected = true; list.Items[1].Selected = true;
                Wait((Task)typeof(DriveFilesForm).GetMethod("OpenSelected", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, null));
                check(form.SelectedFiles == null && !form.IsDisposed, "Drive picker: mixed folder and document selection does not sign a folder");
                list.Items[0].Selected = false; list.Items[2].Selected = true; form.Capacity = 1;
                Wait((Task)typeof(DriveFilesForm).GetMethod("OpenSelected", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, null));
                check(form.SelectedFiles == null, "Drive picker: selection exceeding remaining batch capacity stays open");
                form.Capacity = 8;
                list.Items[1].Selected = false; list.Items[1].Selected = true;
                Snapshot(form, directory, "drive-folders-860.png", new Size(860, 560));
                Snapshot(form, directory, "drive-folders-680.png", new Size(680, 460));
                Wait((Task)typeof(DriveFilesForm).GetMethod("OpenSelected", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, null));
                check(form.SelectedFiles != null && form.SelectedFiles.Count == 2 && form.SelectedFiles[0].ParentId == "folder" && form.SelectedFiles[1].ParentId == "folder", "Drive picker: arbitrary multiple documents preserve each original parent");
            }
            Transport folderTransport = new Transport { Handle = transport.Handle };
            using (DriveFilesForm form = new DriveFilesForm(new DriveAuth(), new DriveFiles(delegate { return Task.FromResult("offline-test"); }, folderTransport), true))
            {
                form.Show(); Application.DoEvents();
                TextBox search = Field<TextBox>(form, "search");
                search.Text = "https://drive.google.com/file/d/document/view";
                Wait((Task)typeof(DriveFilesForm).GetMethod("LoadPage", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, new object[] { false }));
                check(!Field<Button>(form, "choose").Enabled, "Drive picker: invalid pasted link cannot confirm stale destination folder");
                search.Text = "Folder";
                Wait((Task)typeof(DriveFilesForm).GetMethod("LoadPage", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, new object[] { false }));
                check(!Field<Button>(form, "choose").Enabled, "Drive picker: destination mode cannot choose unrelated previous folder from global results");
                ListView list = Field<ListView>(form, "list"); list.Items[0].Selected = true;
                Wait((Task)typeof(DriveFilesForm).GetMethod("OpenSelected", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, null));
                check(Field<Button>(form, "choose").Enabled && search.Text == "", "Drive picker: destination mode enters found folder before confirming it");
                Field<Button>(form, "choose").PerformClick();
                check(form.SelectedFile != null && form.SelectedFile.Id == "folder", "Drive picker: destination mode preserves single-folder compatibility");
            }
        }
        private static void Snapshot(Form form, string directory, string name, Size size)
        {
            if (string.IsNullOrEmpty(directory)) return;
            Directory.CreateDirectory(directory); form.ClientSize = size; Application.DoEvents();
            using (Bitmap bitmap = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size)); bitmap.Save(Path.Combine(directory, name)); }
        }
        private static T Field<T>(object value, string name)
        { return (T)value.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(value); }
        private static void Wait(Task task)
        {
            DateTime deadline = DateTime.UtcNow.AddSeconds(10);
            while (!task.IsCompleted && DateTime.UtcNow < deadline) { Application.DoEvents(); Thread.Sleep(1); }
            if (!task.IsCompleted) throw new TimeoutException("Picker operation did not complete.");
            task.GetAwaiter().GetResult();
        }
        private static async Task RunAsync(Action<bool, string> check)
        {
            string root = Path.Combine(Path.GetTempPath(), "envi-drive-offline-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            Transport transport = new Transport(); int call = 0; CancellationToken ct = CancellationToken.None;
            DriveFile source = new DriveFile { Id = "original", Name = "Pismo.pdf", MimeType = "application/pdf", ParentId = "folder", DriveId = "team" };
            try
            {
                using (DriveFiles drive = new DriveFiles(delegate { return Task.FromResult("offline-test"); }, transport))
                {
                    check(DriveFiles.FolderIdFromLink("https://drive.google.com/drive/folders/folder-123?usp=sharing") == "folder-123", "Drive: pasted folder sharing link");
                    check(DriveFiles.FolderIdFromLink(" https://drive.google.com/drive/u/0/folders/team_folder/ ") == "team_folder", "Drive: pasted account-specific folder link");
                    check(DriveFiles.FolderIdFromLink("https://drive.google.com/open?id=folder_123") == "folder_123", "Drive: pasted legacy folder link");
                    foreach (string bad in new[] { "http://drive.google.com/drive/folders/x", "https://drive.google.com.evil.invalid/drive/folders/x", "https://user@drive.google.com/drive/folders/x", "https://drive.google.com/file/d/x/view", "https://drive.google.com/open?id=x%2Fy", "https://drive.google.com:444/drive/folders/x" })
                    {
                        bool invalidLink = false; try { DriveFiles.FolderIdFromLink(bad); } catch (InvalidOperationException) { invalidLink = true; }
                        check(invalidLink, "Drive: invalid or non-folder link rejected without fetching URL");
                    }
                    transport.Handle = delegate(HttpRequestMessage request) {
                        string q = System.Web.HttpUtility.ParseQueryString(request.RequestUri.Query)["q"];
                        check(q.Contains("mimeType='application/vnd.google-apps.folder'") && q.Contains("name contains 'O\\'Brien'"), "Drive: name search includes folders and escapes apostrophes");
                        check(!q.Contains(" in parents") && request.RequestUri.Query.Contains("corpora=allDrives"), "Drive: global search is not restricted to the current folder or shared drive");
                        return Task.FromResult(Response("{\"files\":[{\"id\":\"found-folder\",\"name\":\"O'Brien\",\"mimeType\":\"application/vnd.google-apps.folder\"}]}"));
                    };
                    check((await drive.List("O'Brien", null, null, null, ct)).Files[0].IsFolder, "Drive: folder found by name can be browsed");
                    transport.Handle = delegate(HttpRequestMessage request) {
                        string q = System.Web.HttpUtility.ParseQueryString(request.RequestUri.Query)["q"];
                        check(q.Contains("'folder' in parents") && q.Contains("name contains 'Pismo'"), "Drive: optional folder-only search keeps name and parent filters");
                        return Task.FromResult(Response("{\"files\":[]}"));
                    };
                    await drive.List("Pismo", "folder", null, null, ct);
                    transport.Handle = delegate { return Task.FromResult(Response("{\"user\":{\"permissionId\":\"account-A\"}}")); };
                    check(await drive.AccountKey(ct) == "account-A", "Drive: remembered folder scoped to current Google account");
                    transport.Handle = delegate { return Task.FromResult(Response("{\"id\":\"folder\",\"name\":\"Original folder\",\"mimeType\":\"application/vnd.google-apps.folder\",\"parents\":[\"root\"]}")); };
                    check((await drive.GetFolder("folder", ct)).IsFolder, "Drive: remembered folder verified against Google before reuse");
                    transport.Handle = delegate { return Task.FromResult(Response("{\"id\":\"file\",\"mimeType\":\"application/pdf\"}")); };
                    bool invalidFolder = false; try { await drive.GetFolder("file", ct); } catch (InvalidOperationException) { invalidFolder = true; }
                    check(invalidFolder, "Drive: remembered place must still be a folder");
                    transport.Handle = delegate(HttpRequestMessage request) {
                        ++call; string url = request.RequestUri.OriginalString;
                        check(url.Contains("includeItemsFromAllDrives=true") && url.Contains("corpora=drive") && url.Contains("driveId=team"), "Drive: shared drive query");
                        check(call == 1 || url.Contains("pageToken=next"), "Drive: continuation token");
                        return Task.FromResult(Response(call == 1 ? "{\"nextPageToken\":\"next\",\"files\":[{\"id\":\"one\",\"name\":\"A.pdf\",\"mimeType\":\"application/pdf\",\"parents\":[\"folder\"]}]}" : "{\"files\":[{\"id\":\"two\",\"name\":\"B.pdf\",\"mimeType\":\"application/pdf\"}]}"));
                    };
                    DriveFilePage first = await drive.List("O'Brien", "folder", "team", null, ct);
                    DriveFilePage second = await drive.List("O'Brien", "folder", "team", first.NextPageToken, ct);
                    check(first.Files.Count == 1 && second.Files.Count == 1 && second.NextPageToken == null, "Drive: listing all pages without duplicate requests");
                    call = 0;
                    transport.Handle = delegate(HttpRequestMessage request) {
                        ++call; check(call == 1 || request.RequestUri.OriginalString.Contains("pageToken=next"), "Drive: shared drive continuation");
                        return Task.FromResult(Response(call == 1 ? "{\"nextPageToken\":\"next\",\"drives\":[{\"id\":\"a\",\"name\":\"Team A\"}]}" : "{\"drives\":[{\"id\":\"b\",\"name\":\"Team B\"}]}"));
                    };
                    check((await drive.SharedDrives(ct)).Count == 2, "Drive: shared drives all pages");
                    transport.Handle = delegate { return Task.FromResult(Response("%PDF-1.7\nimmutable snapshot")); };
                    string local = await drive.Download(source, root, ct);
                    check(File.ReadAllText(local).StartsWith("%PDF-") && source.Id == "original", "Drive: source downloaded to new local PDF");
                    string secondLocal = await drive.Download(source, root, ct);
                    check(local != secondLocal && File.Exists(local), "Drive: source snapshot never overwritten");
                    int before = Directory.GetFiles(root).Length;
                    transport.Handle = delegate { return Task.FromResult(Response("failed", HttpStatusCode.ServiceUnavailable)); };
                    bool rejected = false;
                    try { await drive.Download(source, root, ct); } catch (InvalidOperationException) { rejected = true; }
                    check(rejected && Directory.GetFiles(root).Length == before, "Drive: failed download leaves no incomplete PDF");
                    transport.Handle = delegate { return Task.FromResult(Response("not a PDF")); };
                    rejected = false; try { await drive.Download(source, root, ct); } catch (InvalidOperationException) { rejected = true; }
                    check(rejected, "Drive: non-PDF download rejected");
                    transport.Handle = delegate { HttpResponseMessage response = Response("%PDF-"); response.Content.Headers.ContentLength = DriveFiles.MaxBytes + 1L; return Task.FromResult(response); };
                    rejected = false; try { await drive.Download(source, root, ct); } catch (InvalidOperationException) { rejected = true; }
                    check(rejected && Directory.GetFiles(root).Length == before, "Drive: oversized download rejected before writing");
                    transport.Handle = delegate { HttpResponseMessage response = Response("", HttpStatusCode.Redirect); response.Headers.Location = new Uri("https://evil.invalid"); return Task.FromResult(response); };
                    rejected = false; try { await drive.Download(source, root, ct); } catch (InvalidOperationException) { rejected = true; }
                    check(rejected, "Drive: redirects rejected without forwarding bearer token");
                    transport.Handle = delegate(HttpRequestMessage request) { check(request.RequestUri.OriginalString.Contains("/export?mimeType=application%2Fpdf"), "Drive: native Google document PDF export"); return Task.FromResult(Response("%PDF-1.7 exported")); };
                    check(File.Exists(await drive.Download(new DriveFile { Id = "doc", Name = "Dokument", MimeType = "application/vnd.google-apps.document" }, root, ct)), "Drive: exported document captured as local PDF");
                    transport.Handle = delegate { return Task.FromResult(Response("{\"ids\":[\"new-copy\"]}")); };
                    DriveUpload upload = await drive.PrepareUpload(source, local, ct);
                    check(upload.Id == "new-copy" && upload.ParentId == "folder" && upload.Id != source.Id && Json.Serialize(upload).Contains("new-copy"), "Drive: durable preallocated copy ID, original parent");
                    transport.Handle = delegate(HttpRequestMessage request) {
                        check(request.Method == HttpMethod.Post && request.RequestUri.AbsolutePath == "/upload/drive/v3/files", "Drive: create only; no source updates");
                        return Task.FromResult(Response("failed", HttpStatusCode.ServiceUnavailable));
                    };
                    rejected = false; try { await drive.Upload(upload, ct); } catch (InvalidOperationException) { rejected = true; }
                    check(rejected && File.Exists(local), "Drive: upload failure preserves signed file for retry");
                    transport.Handle = async delegate(HttpRequestMessage request) {
                        string body = await request.Content.ReadAsStringAsync();
                        check(body.Contains("new-copy") && body.Contains("folder") && body.Contains("%PDF-"), "Drive: signed PDF and parent uploaded together");
                        return Response("{\"id\":\"new-copy\",\"md5Checksum\":\"" + upload.Md5 + "\"}");
                    };
                    check((await drive.Upload(upload, ct)).Contains("new-copy"), "Drive: confirmed creation returns copy link");
                    call = 0;
                    transport.Handle = delegate(HttpRequestMessage request) {
                        ++call;
                        if (request.Method == HttpMethod.Post) return Task.FromResult(Response("already saved", HttpStatusCode.Conflict));
                        check(request.RequestUri.AbsolutePath == "/drive/v3/files/new-copy", "Drive: retry checks preallocated copy");
                        return Task.FromResult(Response("{\"id\":\"new-copy\",\"md5Checksum\":\"" + upload.Md5 + "\",\"parents\":[\"folder\"]}"));
                    };
                    string link = await drive.Upload(upload, ct);
                    check(call == 2 && link.Contains("new-copy"), "Drive: ambiguous first upload retries idempotently without re-signing");
                    transport.Handle = delegate(HttpRequestMessage request) { return Task.FromResult(request.Method == HttpMethod.Post ? Response("conflict", HttpStatusCode.Conflict) : Response("{\"md5Checksum\":\"different\",\"parents\":[\"folder\"]}")); };
                    rejected = false; try { await drive.Upload(upload, ct); } catch (InvalidOperationException) { rejected = true; }
                    check(rejected, "Drive: conflict requires matching PDF content");
                    transport.Handle = delegate { return Task.FromResult(Response("{\"id\":\"new-copy\",\"md5Checksum\":\"" + upload.Md5 + "\",\"trashed\":false}")); };
                    check((await drive.ExistingUpload(upload, ct)).Contains("new-copy"), "Drive: destination repair recognizes completed copy regardless of parent");
                    transport.Handle = delegate { return Task.FromResult(Response("missing", HttpStatusCode.NotFound)); };
                    check(await drive.ExistingUpload(upload, ct) == null, "Drive: confirmed absent copy permits destination repair with same ID");
                    transport.Handle = delegate { return Task.FromResult(Response("forbidden", HttpStatusCode.Forbidden)); };
                    rejected = false; try { await drive.ExistingUpload(upload, ct); } catch (InvalidOperationException) { rejected = true; }
                    check(rejected, "Drive: unreadable existing-copy state blocks destination change");
                    transport.Handle = delegate { return Task.FromResult(Response("{\"id\":\"new-copy\",\"md5Checksum\":\"different\"}")); };
                    rejected = false; try { await drive.ExistingUpload(upload, ct); } catch (InvalidOperationException) { rejected = true; }
                    check(rejected, "Drive: mismatching copy blocks destination change");
                    transport.Handle = delegate { return Task.FromResult(Response("{\"id\":\"new-copy\",\"md5Checksum\":\"" + upload.Md5 + "\",\"trashed\":true}")); };
                    rejected = false; try { await drive.ExistingUpload(upload, ct); } catch (InvalidOperationException) { rejected = true; }
                    check(rejected, "Drive: trashed copy is not considered delivered");
                    File.AppendAllText(local, "tampered"); int sent = 0;
                    transport.Handle = delegate { ++sent; return Task.FromResult(Response("{}")); };
                    rejected = false; try { await drive.Upload(upload, ct); } catch (InvalidOperationException) { rejected = true; }
                    check(rejected && sent == 0, "Drive: changed signed file rejected before network");
                }
            }
            finally { Directory.Delete(root, true); }
        }
    }
}
#endif
