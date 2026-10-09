using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;

namespace EnviPodpis
{
    internal sealed class ApiException : Exception
    {
        public int Status;            // 0 = brak odpowiedzi HTTP
        public bool NoConnection;
        public bool TimedOut;
        public string ServerMessage;

        public ApiException(string message) : base(message) { }
    }

    internal sealed class JobInfo
    {
        public string Status;
        public List<string> FileNames = new List<string>();
        public string MinProgramVersion;
        public string ExpiresAt;
    }

    internal sealed class PreparedFile
    {
        public string Name;
        public int Pages;
        public string ServerCheckCode;
        public byte[] Hash;
        public string CheckCode;      // liczony lokalnie z hasha, ktory naprawde podpisujemy
    }

    internal sealed class ApiClient
    {
        private readonly string baseUrl;

        public string BaseUrl { get { return baseUrl; } }

        public ApiClient(string baseUrl)
        {
            this.baseUrl = baseUrl.TrimEnd('/');
        }

        public static void ConfigureTls()
        {
            // TLS 1.2 jako minimum. Tls13 = 12288 (jest w .NET 4.8, ale nie na kazdym Windowsie).
            try
            {
                System.Net.ServicePointManager.SecurityProtocol =
                    (SecurityProtocolType)3072 | (SecurityProtocolType)12288;
            }
            catch (Exception)
            {
                System.Net.ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
            }
        }

        public static bool IsValidToken(string token)
        {
            if (token == null || token.Length < 20 || token.Length > 128) return false;
            foreach (char c in token)
            {
                bool ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-';
                if (!ok) return false;
            }
            return true;
        }

        // envi-podpis://job/TOKEN  ->  TOKEN albo null. Nic poza tokenem nie jest brane z linku.
        public static string ParseJobToken(string arg)
        {
            if (arg == null) return null;
            string prefix = Config.ProtocolName + ":";
            if (!arg.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;
            string rest = arg.Substring(prefix.Length).TrimStart('/');
            string[] parts = rest.Split('/');
            if (parts.Length < 2 || !string.Equals(parts[0], "job", StringComparison.OrdinalIgnoreCase)) return null;
            for (int i = 2; i < parts.Length; i++)
            {
                if (parts[i].Length != 0) return null;
            }
            return IsValidToken(parts[1]) ? parts[1] : null;
        }

        public JobInfo GetJob(string token)
        {
            object r = Send("GET", "/signing/jobs/" + token, null, 20000);
            JobInfo job = new JobInfo();
            job.Status = Json.GetString(r, "status");
            job.MinProgramVersion = Json.GetString(r, "minProgramVersion");
            job.ExpiresAt = Json.GetString(r, "expiresAt");
            foreach (object f in Json.GetList(r, "files"))
            {
                job.FileNames.Add(Json.GetString(f, "name") ?? "(bez nazwy)");
            }
            return job;
        }

        public List<PreparedFile> SubmitCertificate(string token, List<string> chainBase64)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["chain"] = chainBase64;
            // Serwer przygotowuje tu PDF-y (eksport, grafika), wiec dajemy mu sporo czasu.
            object r = Send("POST", "/signing/jobs/" + token + "/certificate", body, 120000);
            List<PreparedFile> files = new List<PreparedFile>();
            foreach (object f in Json.GetList(r, "files"))
            {
                PreparedFile p = new PreparedFile();
                p.Name = Json.GetString(f, "name") ?? "(bez nazwy)";
                p.Pages = Json.GetInt(f, "pages", 0);
                p.ServerCheckCode = Json.GetString(f, "checkCode");
                p.Hash = ParseHash(Json.GetString(f, "hashToSign"));
                if (p.Hash == null)
                {
                    throw new ApiException("PS zwrocil nieczytelny skrot pliku.");
                }
                p.CheckCode = FormatCheckCode(p.Hash);
                files.Add(p);
            }
            return files;
        }

        public string SubmitSignatures(string token, List<byte[]> signatures)
        {
            List<object> items = new List<object>();
            for (int i = 0; i < signatures.Count; i++)
            {
                Dictionary<string, object> item = new Dictionary<string, object>();
                item["index"] = i;
                item["signature"] = Convert.ToBase64String(signatures[i]);
                items.Add(item);
            }
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["signatures"] = items;
            // PS zapisuje pliki na Dysku Google, wiec ta odpowiedz moze potrwac.
            object r = Send("POST", "/signing/jobs/" + token + "/signatures", body, 180000);
            return Json.GetString(r, "status");
        }

        public void Cancel(string token, string reason)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["reason"] = reason;
            Send("POST", "/signing/jobs/" + token + "/cancel", body, 8000);
        }

        // hashToSign: 64 znaki hex albo base64 z 32 bajtow.
        public static byte[] ParseHash(string s)
        {
            if (string.IsNullOrEmpty(s)) return null;
            s = s.Trim();
            if (s.Length == 64)
            {
                bool hex = true;
                foreach (char c in s)
                {
                    if (!Uri.IsHexDigit(c)) { hex = false; break; }
                }
                if (hex)
                {
                    byte[] b = new byte[32];
                    for (int i = 0; i < 32; i++) b[i] = Convert.ToByte(s.Substring(i * 2, 2), 16);
                    return b;
                }
            }
            try
            {
                byte[] b64 = Convert.FromBase64String(s);
                return b64.Length == 32 ? b64 : null;
            }
            catch (FormatException) { return null; }
        }

        public static string FormatCheckCode(byte[] hash)
        {
            string hex = hash[0].ToString("X2") + hash[1].ToString("X2") + hash[2].ToString("X2") + hash[3].ToString("X2");
            return hex.Substring(0, 4) + "-" + hex.Substring(4, 4);
        }

        public static string NormalizeCode(string code)
        {
            return code == null ? "" : code.Replace("-", "").Replace(" ", "").ToUpperInvariant();
        }

        private object Send(string method, string path, object body, int timeoutMs)
        {
            string url = baseUrl + path;
            Uri uri = new Uri(url);
            if (uri.Scheme != Uri.UriSchemeHttps && !(uri.IsLoopback && Config.IsDebugBuild))
            {
                throw new ApiException("Niedozwolony adres.");
            }

            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(uri);
            req.Method = method;
            req.Timeout = timeoutMs;
            req.ReadWriteTimeout = timeoutMs;
            req.AllowAutoRedirect = false;
            req.UserAgent = "ENVI-Podpis/" + Config.FormatVersion(Config.CurrentVersion);
            req.Accept = "application/json";

            if (body != null)
            {
                byte[] data = Encoding.UTF8.GetBytes(Json.Serialize(body));
                req.ContentType = "application/json; charset=utf-8";
                req.ContentLength = data.Length;
                try
                {
                    using (Stream s = req.GetRequestStream()) s.Write(data, 0, data.Length);
                }
                catch (WebException ex) { throw Translate(ex); }
            }

            HttpWebResponse resp = null;
            try
            {
                resp = (HttpWebResponse)req.GetResponse();
            }
            catch (WebException ex)
            {
                throw Translate(ex);
            }

            string text;
            int status;
            using (resp)
            {
                status = (int)resp.StatusCode;
                text = ReadAll(resp);
            }
            if (status >= 300)
            {
                ApiException e = new ApiException("HTTP " + status);
                e.Status = status;
                e.ServerMessage = ServerMessageOf(text);
                throw e;
            }
            try { return Json.Parse(text); }
            catch (Exception)
            {
                ApiException e = new ApiException("Odpowiedz PS nie jest czytelna.");
                e.Status = status;
                throw e;
            }
        }

        private static ApiException Translate(WebException ex)
        {
            HttpWebResponse r = ex.Response as HttpWebResponse;
            if (r != null)
            {
                string text;
                int status = (int)r.StatusCode;
                using (r) text = ReadAll(r);
                ApiException e = new ApiException("HTTP " + status);
                e.Status = status;
                e.ServerMessage = ServerMessageOf(text);
                return e;
            }
            ApiException n = new ApiException(ex.Message);
            if (ex.Status == WebExceptionStatus.Timeout) n.TimedOut = true; else n.NoConnection = true;
            return n;
        }

        private static string ReadAll(HttpWebResponse r)
        {
            try
            {
                using (Stream s = r.GetResponseStream())
                using (StreamReader sr = new StreamReader(s, Encoding.UTF8))
                {
                    return sr.ReadToEnd();
                }
            }
            catch (Exception) { return ""; }
        }

        private static string ServerMessageOf(string text)
        {
            try
            {
                object o = Json.Parse(text);
                string m = Json.GetString(o, "errorMessage");
                if (m == null) m = Json.GetString(o, "message");
                if (m != null && m.Length > 300) m = m.Substring(0, 300);
                return m;
            }
            catch (Exception) { return null; }
        }
    }
}
