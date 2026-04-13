import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const root = process.cwd();
const inputPath = path.join(root, "docs", "PROJECT_BOOKLET.md");
const outputPath = path.join(root, "docs", "PROJECT_BOOKLET.pdf");

const raw = fs.readFileSync(inputPath, "utf8");
const lines = raw.split(/\r?\n/);

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 54, bottom: 54, left: 54, right: 54 },
  info: {
    Title: "Makkah Maintenance Live - Project Booklet",
    Author: "Codex Assistant",
  },
});

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
const startY = doc.y;
let pageNo = 1;

function drawHeaderFooter() {
  const top = doc.page.margins.top - 24;
  const bottom = doc.page.height - doc.page.margins.bottom + 12;
  doc.font("Helvetica").fontSize(9).fillColor("#64748b");
  doc.text("Makkah Maintenance Live - Project Booklet", doc.page.margins.left, top, {
    width: pageWidth,
    align: "left",
  });
  doc.text(`Page ${pageNo}`, doc.page.margins.left, bottom, {
    width: pageWidth,
    align: "right",
  });
  doc.fillColor("#0f172a");
}

function ensureSpace(minHeight = 24) {
  if (doc.y + minHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    pageNo += 1;
    drawHeaderFooter();
    doc.y = startY;
  }
}

drawHeaderFooter();

for (const line of lines) {
  if (!line.trim()) {
    ensureSpace(12);
    doc.moveDown(0.4);
    continue;
  }

  if (line.startsWith("# ")) {
    ensureSpace(28);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a");
    doc.text(line.replace(/^#\s+/, ""), { width: pageWidth, align: "left" });
    doc.moveDown(0.35);
    continue;
  }

  if (line.startsWith("## ")) {
    ensureSpace(24);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a");
    doc.text(line.replace(/^##\s+/, ""), { width: pageWidth, align: "left" });
    doc.moveDown(0.2);
    continue;
  }

  if (line.startsWith("### ")) {
    ensureSpace(20);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#1e293b");
    doc.text(line.replace(/^###\s+/, ""), { width: pageWidth, align: "left" });
    continue;
  }

  if (line.startsWith("- ")) {
    ensureSpace(16);
    const bulletText = line.replace(/^- /, "• ");
    doc.font("Helvetica").fontSize(11).fillColor("#0f172a");
    doc.text(bulletText, {
      width: pageWidth - 10,
      align: "left",
      indent: 10,
    });
    continue;
  }

  if (line.startsWith("---")) {
    ensureSpace(16);
    const y = doc.y + 4;
    doc.save();
    doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke();
    doc.restore();
    doc.moveDown(0.8);
    continue;
  }

  ensureSpace(16);
  doc.font("Helvetica").fontSize(11).fillColor("#0f172a");
  doc.text(line, { width: pageWidth, align: "left" });
}

doc.end();

await new Promise((resolve, reject) => {
  stream.on("finish", resolve);
  stream.on("error", reject);
});

// eslint-disable-next-line no-console
console.log(`PDF generated: ${outputPath}`);
