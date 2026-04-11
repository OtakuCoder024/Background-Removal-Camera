/**
 * Generates all icon assets from icon1.png (552×552 pre-cropped square source).
 *
 * icon1.png is ALREADY tight — the figure fills the frame with no transparent padding.
 * We resize it DIRECTLY to each target size (no center-crop needed).
 *
 * Outputs:
 *   build/icon.png            — copy of source
 *   build/icon.ico            — multi-size ICO for .exe / NSIS / taskbar
 *   electron/icon.ico         — same, dev fallback
 *   electron/window-icon.png  — 256×256 PNG for BrowserWindow title bar
 *   public/icon.png           — 512×512 favicon
 */
const fs = require("node:fs");
const path = require("node:path");

const sharp = require("sharp");
const toIco = require("to-ico");

const root = path.join(__dirname, "..");
const srcPath = (() => {
  const p1 = path.join(root, "icon1.png");
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(root, "build", "icon.png");
  if (fs.existsSync(p2)) return p2;
  return null;
})();

const buildPngPath = path.join(root, "build", "icon.png");
const icoPath = path.join(root, "build", "icon.ico");
const publicPng = path.join(root, "public", "icon.png");
const electronWindowPng = path.join(root, "electron", "window-icon.png");
const electronIcoPath = path.join(root, "electron", "icon.ico");

/** Crop factor: 0.65 = keep center 65% of the frame → figure fills the icon prominently. */
const CROP_RATIO = Math.min(0.95, Math.max(0.35, Number(process.env.ICON_CROP_RATIO || 0.65)));

async function cropAndResize(buffer, size, alpha = false) {
  const meta = await sharp(buffer).metadata();
  const side = Math.min(meta.width ?? 0, meta.height ?? 0);
  const cropSize = Math.round(side * CROP_RATIO);
  const left = Math.floor(((meta.width ?? 0) - cropSize) / 2);
  const top  = Math.floor(((meta.height ?? 0) - cropSize) / 2);

  let s = sharp(buffer)
    .extract({ left, top, width: cropSize, height: cropSize })
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 });
  if (!alpha) {
    s = s.flatten({ background: "#0f1218" }).removeAlpha();
  }
  const buf = await s.png().toBuffer();
  const m = await sharp(buf).metadata();
  if (m.width !== size || m.height !== size) {
    throw new Error(`cropAndResize(${size}): got ${m.width}×${m.height}`);
  }
  return buf;
}

async function main() {
  if (!srcPath) {
    console.error("Missing source: add icon1.png to the project root");
    process.exit(1);
  }

  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  fs.mkdirSync(path.join(root, "electron"), { recursive: true });
  fs.mkdirSync(path.dirname(publicPng), { recursive: true });

  const raw = fs.readFileSync(srcPath);
  const meta = await sharp(raw).metadata();
  console.log(`Source: ${path.relative(root, srcPath)} (${meta.width}×${meta.height})`);

  fs.copyFileSync(srcPath, buildPngPath);

  console.log(`Crop ratio: ${CROP_RATIO} (cropSize = ${Math.round((meta.width ?? 552) * CROP_RATIO)}px from ${meta.width}px source)`);

  // ── Window / title-bar icon (BrowserWindow) ───────────────────────────────
  const winBuf = await cropAndResize(raw, 256, false);
  fs.writeFileSync(electronWindowPng, winBuf);
  console.log(`electron/window-icon.png: 256×256 ✓`);

  // ── ICO: .exe / installer / taskbar ──────────────────────────────────────
  const icoSizes = [16, 24, 32, 48, 64, 96, 128, 256];
  const icoBuffers = await Promise.all(icoSizes.map((w) => cropAndResize(raw, w, false)));
  const ico = await toIco(icoBuffers);
  fs.writeFileSync(icoPath, ico);
  fs.copyFileSync(icoPath, electronIcoPath);
  console.log(`build/icon.ico: ${ico.length} bytes, layers: ${icoSizes.join(", ")} ✓`);

  // ── Favicon ───────────────────────────────────────────────────────────────
  const faviconBuf = await cropAndResize(raw, 512, true);
  fs.writeFileSync(publicPng, faviconBuf);
  console.log(`public/icon.png: 512×512 ✓`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
