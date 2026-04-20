/**
 * يولّد أيقونات UP FLOW: favicon في app/ فقط (لا public/favicon — يتسبب بتعارض الكاش)
 * + upflow-pwa-*.png لـ manifest/PWA بأسماء جديدة لكسر كاش المتصفحات.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const toIco = require("to-ico");

const root = path.join(__dirname, "..");
const svgPath = path.join(root, "public", "icons", "upflow-app-icon.svg");
const appleTouchSvgPath = path.join(root, "public", "icons", "upflow-apple-touch-lockup.svg");
const svg = fs.readFileSync(svgPath);
const appleTouchSvg = fs.readFileSync(appleTouchSvgPath);

async function main() {
  const out = async (size, file) => {
    await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
    console.log("wrote", path.relative(root, file));
  };

  const pub = path.join(root, "public");
  const icons = path.join(pub, "icons");
  const appDir = path.join(root, "app");

  await out(16, path.join(pub, "_favicon-16.png"));
  await out(32, path.join(pub, "_favicon-32.png"));
  await sharp(appleTouchSvg).resize(180, 180).png({ compressionLevel: 9 }).toFile(path.join(pub, "apple-touch-icon.png"));
  console.log("wrote", path.relative(root, path.join(pub, "apple-touch-icon.png")));

  /** أسماء جديدة — لا تعتمد على android-chrome* (كاش قديم) */
  await out(192, path.join(pub, "upflow-pwa-192.png"));
  await out(512, path.join(pub, "upflow-pwa-512.png"));
  await out(192, path.join(icons, "icon-192.png"));
  await out(512, path.join(icons, "icon-512.png"));

  const buf16 = await sharp(svg).resize(16, 16).png().toBuffer();
  const buf32 = await sharp(svg).resize(32, 32).png().toBuffer();
  const icoBuf = await toIco([buf16, buf32]);
  /** فقط داخل app — Next يخدم /favicon.ico من هنا بدون تعارض مع public */
  fs.writeFileSync(path.join(appDir, "favicon.ico"), icoBuf);
  console.log("wrote", path.relative(root, path.join(appDir, "favicon.ico")));

  fs.unlinkSync(path.join(pub, "_favicon-16.png"));
  fs.unlinkSync(path.join(pub, "_favicon-32.png"));

  fs.copyFileSync(path.join(pub, "upflow-pwa-512.png"), path.join(appDir, "icon.png"));
  fs.copyFileSync(path.join(pub, "apple-touch-icon.png"), path.join(appDir, "apple-icon.png"));
  console.log("wrote app/icon.png, app/apple-icon.png (Next.js metadata)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
