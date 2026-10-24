using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace EnviPodpis
{
    internal sealed class DriveFile
    {
        public string Id, Name, MimeType, ParentId, DriveId;
        internal bool IsFolder { get { return MimeType == "application/vnd.google-apps.folder"; } }
        public override string ToString() { return Name; }
    }

    internal sealed class DriveFilePage
    {
        internal readonly List<DriveFile> Files = new List<DriveFile>();
        internal string NextPageToken;
        internal bool Incomplete;
    }

    internal sealed class DriveUpload
    {
        public string Id, ParentId, Name, Path, Md5;
    }

    internal sealed class DriveFiles : IDisposable
    {
        internal const int MaxBytes = 32 * 1024 * 1024;
        private const string Api = "https://www.googleapis.com/drive/v3/";
        private const string Fields = "id,name,mimeType,parents,driveId";
        private readonly HttpClient client;
        private readonly Func<CancellationToken, Task<string>> token;

        internal DriveFiles(DriveAuth auth) : this(auth.GetAccessToken, new HttpClientHandler { AllowAutoRedirect = false }) { }
        internal DriveFiles(Func<CancellationToken, Task<string>> tokenProvider, HttpMessageHandler transport)
        { token = tokenProvider; client = new HttpClient(transport); client.Timeout = TimeSpan.FromMinutes(3); }
        public void Dispose() { client.Dispose(); }

        private static string Q(string value) { return "'" + value.Replace("\\", "\\\\").Replace("'", "\\'") + "'"; }
        private static string E(string value) { return Uri.EscapeDataString(value ?? ""); }
        private static string Id(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length > 256 || value.Any(c => !char.IsLetterOrDigit(c) && c != '-' && c != '_'))
                throw new InvalidOperationException("Nieprawidłowy identyfikator pliku Google.");
            return value;
        }
        private async Task<HttpResponseMessage> Send(HttpMethod method, string url, HttpContent content, CancellationToken ct)
        {
            Uri uri = new Uri(url);
            if (uri.Scheme != "https" || uri.Host != "www.googleapis.com" || !uri.IsDefaultPort) throw new InvalidOperationException("Nieprawidłowy adres Google.");
            using (HttpRequestMessage request = new HttpRequestMessage(method, uri))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await token(ct));
                request.Content = content;
                return await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            }
        }
        private static void Ensure(HttpResponseMessage response)
        {
            if (response.IsSuccessStatusCode) return;
            int code = (int)response.StatusCode;
            throw new InvalidOperationException(code == 401 ? "Zaloguj ponownie konto Google." : code == 403 ? "Google odmówił dostępu. Sprawdź uprawnienia do pliku i folderu." : code == 404 ? "Plik lub folder nie jest już dostępny na tym koncie Google." : "Google nie ukończył operacji (HTTP " + code + "). Możesz ponowić bez ponownego podpisywania.");
        }
        private static async Task<byte[]> Read(HttpResponseMessage response, int limit, CancellationToken ct)
        {
            Ensure(response);
            if (response.Content.Headers.ContentLength > limit) throw new InvalidOperationException("Plik jest za duży. Limit wynosi 32 MiB.");
            using (Stream input = await response.Content.ReadAsStreamAsync())
            using (MemoryStream output = new MemoryStream())
            {
                byte[] buffer = new byte[65536]; int count;
                while ((count = await input.ReadAsync(buffer, 0, buffer.Length, ct)) != 0)
                { if (output.Length + count > limit) throw new InvalidOperationException("Przekroczono dopuszczalny rozmiar odpowiedzi Google."); output.Write(buffer, 0, count); }
                return output.ToArray();
            }
        }
        private async Task<object> GetJson(string url, CancellationToken ct)
        { using (HttpResponseMessage response = await Send(HttpMethod.Get, url, null, ct)) return Json.Parse(Encoding.UTF8.GetString(await Read(response, 2 * 1024 * 1024, ct))); }
        private static DriveFile FileInfo(object data)
        {
            List<object> parents = Json.GetList(data, "parents");
            return new DriveFile { Id = Json.GetString(data, "id"), Name = Json.GetString(data, "name"), MimeType = Json.GetString(data, "mimeType"), ParentId = parents.Count == 0 ? null : Convert.ToString(parents[0]), DriveId = Json.GetString(data, "driveId") };
        }
        internal async Task<string> AccountKey(CancellationToken ct)
        {
            object data = await GetJson(Api + "about?fields=user(permissionId)", ct);
            object user; var fields = Json.AsObject(data);
            if (fields == null || !fields.TryGetValue("user", out user)) throw new InvalidOperationException("Nie ustalono konta Google. Połącz konto ponownie.");
            return Id(Json.GetString(user, "permissionId"));
        }
        internal async Task<DriveFile> GetFolder(string id, CancellationToken ct)
        {
            DriveFile result = FileInfo(await GetJson(Api + "files/" + Id(id) + "?supportsAllDrives=true&fields=" + E(Fields), ct));
            if (!result.IsFolder) throw new InvalidOperationException("Zapamiętane miejsce nie jest już folderem.");
            return result;
        }
        internal async Task<DriveFilePage> List(string search, string folderId, string driveId, string pageToken, CancellationToken ct)
        {
            string query = "trashed=false and (mimeType='application/pdf' or mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.google-apps.folder')";
            if (!string.IsNullOrEmpty(folderId)) query += " and " + Q(Id(folderId)) + " in parents";
            if (!string.IsNullOrWhiteSpace(search)) query += " and name contains " + Q(search.Trim());
            string url = Api + "files?pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=" + E(string.IsNullOrEmpty(folderId) ? "modifiedTime desc" : "folder,name") + "&fields=" + E("nextPageToken,incompleteSearch,files(" + Fields + ")") + "&q=" + E(query);
            if (!string.IsNullOrEmpty(driveId)) url += "&corpora=drive&driveId=" + E(Id(driveId));
            if (!string.IsNullOrEmpty(pageToken)) url += "&pageToken=" + E(pageToken);
            object data = await GetJson(url, ct);
            DriveFilePage result = new DriveFilePage { NextPageToken = Json.GetString(data, "nextPageToken"), Incomplete = Json.GetString(data, "incompleteSearch") == "True" };
            foreach (object item in Json.GetList(data, "files")) result.Files.Add(FileInfo(item));
            return result;
        }
        internal async Task<List<DriveFile>> SharedDrives(CancellationToken ct)
        {
            List<DriveFile> result = new List<DriveFile>(); string next = null;
            do
            {
                object data = await GetJson(Api + "drives?pageSize=100&fields=nextPageToken,drives(id,name)&pageToken=" + E(next), ct);
                foreach (object item in Json.GetList(data, "drives")) result.Add(new DriveFile { Id = Json.GetString(item, "id"), DriveId = Json.GetString(item, "id"), Name = Json.GetString(item, "name"), MimeType = "application/vnd.google-apps.folder" });
                next = Json.GetString(data, "nextPageToken");
            } while (!string.IsNullOrEmpty(next));
            return result;
        }
        internal async Task<string> Download(DriveFile source, string directory, CancellationToken ct)
        {
            if (source == null || (source.MimeType != "application/pdf" && source.MimeType != "application/vnd.google-apps.document")) throw new InvalidOperationException("Wybierz PDF lub dokument Google.");
            string url = Api + "files/" + Id(source.Id) + (source.MimeType == "application/pdf" ? "?alt=media&supportsAllDrives=true" : "/export?mimeType=application%2Fpdf");
            byte[] bytes;
            using (HttpResponseMessage response = await Send(HttpMethod.Get, url, null, ct)) bytes = await Read(response, MaxBytes, ct);
            if (bytes.Length < 5 || Encoding.ASCII.GetString(bytes, 0, 5) != "%PDF-") throw new InvalidOperationException("Google nie zwrócił dokumentu PDF. Niczego nie przygotowano do podpisu.");
            Directory.CreateDirectory(directory);
            string name = Path.GetFileNameWithoutExtension(source.Name ?? "Dokument");
            foreach (char c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
            if (name.Length > 100) name = name.Substring(0, 100);
            string path = Path.Combine(directory, name + "-" + Guid.NewGuid().ToString("N") + ".pdf");
            ct.ThrowIfCancellationRequested();
            using (FileStream file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { file.Write(bytes, 0, bytes.Length); file.Flush(true); }
            return path;
        }
        private static string Hash(byte[] bytes)
        { using (MD5 md5 = MD5.Create()) return BitConverter.ToString(md5.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
        private static byte[] SignedBytes(string path)
        {
            using (FileStream file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                if (file.Length > MaxBytes || file.Length < 5) throw new InvalidOperationException("Podpisany PDF musi mieć nie więcej niż 32 MiB.");
                byte[] bytes = new byte[(int)file.Length]; int offset = 0, read;
                while (offset < bytes.Length && (read = file.Read(bytes, offset, bytes.Length - offset)) > 0) offset += read;
                if (offset != bytes.Length || Encoding.ASCII.GetString(bytes, 0, 5) != "%PDF-") throw new InvalidOperationException("Brak prawidłowej podpisanej kopii PDF.");
                return bytes;
            }
        }
        internal async Task<DriveUpload> PrepareUpload(DriveFile source, string signedPath, CancellationToken ct)
        {
            if (source == null || string.IsNullOrEmpty(source.ParentId)) throw new InvalidOperationException("Nie ustalono folderu oryginału. Podpisana kopia pozostaje lokalnie; wybierz folder docelowy na Dysku.");
            string parent = Id(source.ParentId);
            string hash = Hash(SignedBytes(signedPath));
            object data = await GetJson(Api + "files/generateIds?count=1&space=drive&type=files", ct);
            List<object> ids = Json.GetList(data, "ids");
            if (ids.Count != 1) throw new InvalidOperationException("Google nie przygotował zapisu. Ponów zapis podpisanej kopii.");
            return new DriveUpload { Id = Id(Convert.ToString(ids[0])), ParentId = parent, Name = Path.GetFileNameWithoutExtension(source.Name ?? "Dokument") + " - podpisany.pdf", Path = signedPath, Md5 = hash };
        }
        internal async Task<string> Upload(DriveUpload job, CancellationToken ct)
        {
            if (job == null) throw new ArgumentNullException("job");
            Id(job.Id); Id(job.ParentId);
            byte[] bytes = SignedBytes(job.Path);
            if (Hash(bytes) != job.Md5) throw new InvalidOperationException("Podpisana kopia zmieniła się od przygotowania zapisu. Wysyłanie zatrzymano.");
            using (MultipartContent multipart = new MultipartContent("related"))
            {
                multipart.Add(new StringContent(Json.Serialize(new { id = job.Id, name = job.Name, mimeType = "application/pdf", parents = new[] { job.ParentId } }), Encoding.UTF8, "application/json"));
                ByteArrayContent pdf = new ByteArrayContent(bytes); pdf.Headers.ContentType = new MediaTypeHeaderValue("application/pdf"); multipart.Add(pdf);
                using (HttpResponseMessage response = await Send(HttpMethod.Post, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,md5Checksum", multipart, ct))
                {
                    if (response.StatusCode == HttpStatusCode.Conflict)
                    {
                        object existing = await GetJson(Api + "files/" + Id(job.Id) + "?supportsAllDrives=true&fields=id,md5Checksum,parents", ct);
                        if (Json.GetString(existing, "md5Checksum") != job.Md5 || !Json.GetList(existing, "parents").Any(p => Convert.ToString(p) == job.ParentId)) throw new InvalidOperationException("Nie potwierdzono zawartości zapisanej kopii. Zachowano lokalny podpisany PDF.");
                    }
                    else
                    {
                        object saved = Json.Parse(Encoding.UTF8.GetString(await Read(response, 65536, ct)));
                        if (Json.GetString(saved, "id") != job.Id || Json.GetString(saved, "md5Checksum") != job.Md5) throw new InvalidOperationException("Nie potwierdzono zapisu. Ponów zapis tej samej podpisanej kopii.");
                    }
                }
            }
            return "https://drive.google.com/file/d/" + E(job.Id) + "/view";
        }
        internal async Task<string> ExistingUpload(DriveUpload job, CancellationToken ct)
        {
            if (job == null) throw new ArgumentNullException("job");
            using (HttpResponseMessage response = await Send(HttpMethod.Get, Api + "files/" + Id(job.Id) + "?supportsAllDrives=true&fields=id,md5Checksum,trashed", null, ct))
            {
                if (response.StatusCode == HttpStatusCode.NotFound) return null;
                object data = Json.Parse(Encoding.UTF8.GetString(await Read(response, 65536, ct)));
                if (Json.GetString(data, "id") != job.Id || Json.GetString(data, "md5Checksum") != job.Md5 || Json.GetString(data, "trashed") == "True")
                    throw new InvalidOperationException("Nie potwierdzono zawartości istniejącej kopii na Dysku. Zachowano podpisany PDF; nie zmieniono folderu docelowego.");
                return "https://drive.google.com/file/d/" + E(job.Id) + "/view";
            }
        }
    }
}
