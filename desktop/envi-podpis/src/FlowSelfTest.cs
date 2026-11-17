#if DEBUG
using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace EnviPodpis
{
    internal static class FlowSelfTest
    {
        internal static void Run(string[] args, Action<bool,string> check)
        { Task.Run(async delegate { await Core(args[3], args[4], check); }).GetAwaiter().GetResult(); }
        private static async Task Core(string package, string fixtures, Action<bool,string> check)
        {
            string directory = Path.Combine(WorkflowStore.Root, "scenario"); Directory.CreateDirectory(directory);
            string original = Path.Combine(directory, "pismo.pdf"); File.Copy(Path.Combine(fixtures, "letter.pdf"), original);
            string originalHash = LocalDocument.Hash(File.ReadAllBytes(original));
            check(WorkflowStore.Destination(original, null) == directory, "local scenario: no destination choice, source sibling default");
            WorkflowStore.Setting("destination", directory);
            check(Json.GetString(WorkflowStore.Settings(), "destination") == directory, "preference survives reread");
            using (RSA key = RSA.Create(2048))
            {
                var request = new CertificateRequest("CN=FLOW TEST ONLY", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                using (X509Certificate2 cert = request.CreateSelfSigned(DateTimeOffset.Now.AddDays(-1), DateTimeOffset.Now.AddDays(1)))
                using (LocalDocument doc = LocalDocument.Load(original))
                {
                    await doc.Prepare(package, cert, new[] { Convert.ToBase64String(cert.RawData) }, CancellationToken.None);
                    string preparedHash = Json.GetString(doc.Prepared, "hash");
                    object render = await doc.Worker.Request(new { op = "render", page = 1 }, CancellationToken.None);
                    check(Convert.FromBase64String(Json.GetString(render,"png")).Length > 100, "scenario: actual prepared document rendered before signature");
                    doc.Confirmed = true;
                    bool failed = false;
                    try { await doc.SignAndSave(cert, null, Path.Combine(directory, "missing"), CancellationToken.None); }
                    catch (IOException) { failed = true; }
                    check(failed && doc.SignAttempted && doc.ValidatedCopy != null && File.Exists(doc.RecoveryPath), "scenario: destination failure after signing retains durable copy");
                    check(Json.GetString(doc.Prepared,"hash") == preparedHash, "scenario: signed hash is the preview hash");
                    var recovered = WorkflowStore.Recover(message => check(false, message)).Single();
                    check(recovered.SignAttempted && recovered.ValidatedCopy.SequenceEqual(doc.ValidatedCopy) && recovered.Worker == null,
                        "scenario: restart restores same signature bytes without card or worker");
                    recovered.Output = LocalDocument.SaveCopy(directory, "pismo", recovered.ValidatedCopy);
                    check(File.ReadAllBytes(recovered.Output).SequenceEqual(doc.ValidatedCopy), "scenario: retry save preserves signature bytes");
                    WorkflowStore.Complete(recovered);
                    check(!WorkflowStore.Recover(message => check(false,message)).Any(), "scenario: successful delivery clears pending recovery");
                    check(LocalDocument.Hash(File.ReadAllBytes(original)) == originalHash, "scenario: original unchanged throughout");
                }
            }
            byte[] contents = new byte[] { 1,2,3,4,5 };
            var mail = new LocalDocument { Source = original, Origin = "mail", ValidatedCopy = contents, TargetDirectory = directory,
                SourceContext = new { MessageId = "synthetic@envi.invalid", To = new[] { "recipient@envi.invalid" }, Subject = "Test" } };
            WorkflowStore.Retain(mail);
            var mailRecovered = WorkflowStore.Recover(message=>check(false,message)).Single();
            check(mailRecovered.Origin == "mail" && Json.GetString(mailRecovered.SourceContext,"MessageId") == "synthetic@envi.invalid", "mail scenario: reply context survives destination failure/restart");
            WorkflowStore.Complete(mailRecovered);
            var drive = new LocalDocument { Source = original, Origin = "drive", ValidatedCopy = contents, TargetDirectory = directory,
                SourceContext = new DriveFile { Id = "sourceId", ParentId = "folderId" }, UploadContext = new DriveUpload { Id = "allocatedId", Md5 = "test" } };
            WorkflowStore.Retain(drive);
            var driveRecovered = WorkflowStore.Recover(message=>check(false,message)).Single();
            check(Json.GetString(driveRecovered.UploadContext,"Id") == "allocatedId", "Drive scenario: preallocated upload ID survives restart, avoiding duplicate copy");
            WorkflowStore.Complete(driveRecovered);
        }
    }
}
#endif
