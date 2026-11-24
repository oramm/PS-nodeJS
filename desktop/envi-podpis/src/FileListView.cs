using System;
using System.Drawing;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal sealed class FileListView : ListView
    {
        internal const int CreatedColumn = 2;
        private const string CreatedLabel = "Utworzono";
        private readonly ImageList icons = new ImageList { ColorDepth = ColorDepth.Depth32Bit };
        private readonly Bitmap folderIcon = new Bitmap(16, 16), fileIcon = new Bitmap(16, 16);
        private bool? newestFirst;
        internal event EventHandler CreationColumnClick;

        internal FileListView()
        {
            Dock = DockStyle.Fill; View = View.Details; FullRowSelect = true; HideSelection = false;
            Columns.Add("Nazwa", 340); Columns.Add("Rodzaj", 130); Columns.Add(CreatedLabel, 145);
            Point[] folder = { new Point(1, 4), new Point(6, 4), new Point(8, 6), new Point(14, 6), new Point(14, 13), new Point(1, 13) };
            Point[] file = { new Point(3, 1), new Point(9, 1), new Point(12, 4), new Point(12, 14), new Point(3, 14) };
            using (Graphics graphics = Graphics.FromImage(folderIcon))
            using (Brush fill = new SolidBrush(SystemInformation.HighContrast ? SystemColors.Window : Color.FromArgb(255, 210, 114)))
            using (Pen outline = new Pen(SystemInformation.HighContrast ? SystemColors.WindowText : Color.FromArgb(139, 91, 20)))
            {
                graphics.FillPolygon(fill, folder);
                graphics.DrawPolygon(outline, folder);
            }
            using (Graphics graphics = Graphics.FromImage(fileIcon))
            {
                graphics.FillPolygon(SystemBrushes.Window, file);
                graphics.DrawPolygon(SystemPens.WindowText, file);
                graphics.DrawLines(SystemPens.WindowText, new[] { new Point(9, 1), new Point(9, 4), new Point(12, 4) });
            }
            icons.Images.Add(folderIcon);
            icons.Images.Add(fileIcon);
            SmallImageList = icons;
        }

        internal bool? NewestFirst
        {
            get { return newestFirst; }
            set
            {
                newestFirst = value;
                Columns[CreatedColumn].Text = CreatedLabel + (value == true ? " ↓" : value == false ? " ↑" : "");
            }
        }

        internal static ListViewItem Entry(string name, string kind, bool isFolder, DateTimeOffset? created, object source)
        {
            ListViewItem item = new ListViewItem(name, isFolder ? 0 : 1) { Tag = source };
            item.SubItems.Add(kind);
            item.SubItems.Add(created.HasValue ? created.Value.ToLocalTime().ToString("dd.MM.yyyy HH:mm") : "—").Tag = created;
            return item;
        }

        protected override void OnColumnClick(ColumnClickEventArgs e)
        {
            base.OnColumnClick(e);
            if (e.Column == CreatedColumn && CreationColumnClick != null) CreationColumnClick(this, EventArgs.Empty);
        }

        protected override void OnSizeChanged(EventArgs e)
        {
            base.OnSizeChanged(e);
            if (Columns.Count == 3)
                Columns[0].Width = Math.Max(160, ClientSize.Width - Columns[1].Width - Columns[2].Width - SystemInformation.VerticalScrollBarWidth - 4);
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing) { icons.Dispose(); folderIcon.Dispose(); fileIcon.Dispose(); }
        }
    }
}
