#if DEBUG
using System;
using System.Drawing;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class PreviewSelfTest
    {
        public static void Run(Action<bool, string> report)
        {
            LocalDocument document = new LocalDocument { Source = "synthetic-preview.pdf", Original = new byte[] { 1 },
                Info = Json.Parse("{\"pages\":[{\"width\":600,\"height\":800,\"placeable\":true},{\"width\":600,\"height\":800,\"placeable\":true},{\"width\":800,\"height\":600,\"placeable\":false}],\"stampRel\":{\"width\":0.28,\"height\":0.06}}"),
                Placement = new { page = 2, rect = new { x = 120, y = 120, width = 168, height = 48 } } };
            report(PdfPreviewForm.ClampPage(-1, 3) == 1 && PdfPreviewForm.ClampPage(99, 3) == 3, "preview: page bounds preserve first/last page");
            using (PdfPreviewForm form = new PdfPreviewForm(document, null, true))
            {
                PictureBox picture = (PictureBox)Get(form, "picture");
                Button accept = (Button)Get(form, "accept");
                report((int)Get(form, "requestedPage") == 2, "preview: opens current graphic page");
                picture.Image = new Bitmap(600, 800); picture.Size = new Size(600, 800);
                Set(form, "renderedPage", 2);
                Call(form, "InitializePlacement");
                object placement = Json.Parse(Json.Serialize(form.SelectedPlacement));
                object rect = Json.AsObject(placement)["rect"];
                report(Json.GetInt(placement, "page", 0) == 2 && Math.Abs(Convert.ToDouble(Json.GetString(rect, "x")) - 120) < .1 &&
                    Math.Abs(Convert.ToDouble(Json.GetString(rect, "y")) - 120) < .1 && accept.Enabled,
                    "preview: preserves current placement and converts top-origin coordinates correctly");
                Call(form, "MoveStamp", new Point(-100, 900));
                placement = Json.Parse(Json.Serialize(form.SelectedPlacement)); rect = Json.AsObject(placement)["rect"];
                report(Convert.ToDouble(Json.GetString(rect, "x")) == 0 && Math.Abs(Convert.ToDouble(Json.GetString(rect, "y"))) < .1,
                    "preview: dragging outside page clamps entire graphic inside page");
                Set(form, "rendering", true);
                ((Task)Call(form, "Navigate", 3, false)).GetAwaiter().GetResult();
                ((Task)Call(form, "Navigate", 1, true)).GetAwaiter().GetResult();
                report((int)Get(form, "requestedPage") == 1 && (int)Get(form, "renderedPage") == 0 &&
                    picture.Image == null && !accept.Enabled && form.SelectedPlacement == null,
                    "preview: rapid next/previous clears stale image, placement and acceptance");
                report(!((Button)Get(form, "previous")).Enabled && ((Button)Get(form, "next")).Enabled,
                    "preview: explicit previous decreases page and stops at first page");
                Set(form, "rendering", false);
                Set(form, "renderedPage", 2); picture.Image = new Bitmap(600, 800);
                Call(form, "UpdatePlacement");
                report(form.SelectedPlacement == null && !accept.Enabled, "preview: displayed/requested mismatch cannot authorize stamp");
                picture.Image.Dispose(); picture.Image = null;
            }
        }

        private static object Get(object target, string name) { return target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(target); }
        private static void Set(object target, string name, object value) { target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value); }
        private static object Call(object target, string name, params object[] arguments) { return target.GetType().GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(target, arguments); }
    }
}
#endif
