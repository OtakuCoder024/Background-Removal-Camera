/**
 * Generates all icon assets from icon1.png (552×552 pre-cropped square source).
 *
 * build/icon.ico uses PNG payloads per layer (Windows Vista+). BMP-based ICO
 * caused Explorer to show vertical RGB stripes in List / Large / etc. when the
 * shell picked certain sizes — the DIB layout was easy to get subtly wrong.
 *
 * Outputs:
 *   build/icon.png            — 512×512 RGBA (tray / favicon)
 *   build/icon.ico            — multi-size ICO (PNG layers) — use as build.icon
 *   electron/window-icon.png  — 256×256 opaque (title bar)
 *   public/icon.png           — 512×512 favicon
 */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const srcPath = (() => {
  const p1 = path.join(root, "icon1.png");
  if (fs.existsSync(p1)) return p1;
  return null;
})();

const buildPng = path.join(root, "build", "icon.png");
const buildIco = path.join(root, "build", "icon.ico");
const electronWindowPng = path.join(root, "electron", "window-icon.png");
const publicPng = path.join(root, "public", "icon.png");

const CROP_RATIO = Math.min(0.95, Math.max(0.35, Number(process.env.ICON_CROP_RATIO || 0.65)));

/**
 * Multi-resolution ICO with raw PNG image data per entry (no BMP).
 * ICONDIRENTRY: wBitCount=0 and wPlanes=0 marks PNG (per MS / Wikipedia).
 */
function buildPngIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(count * 16);
  let dataOffset = 6 + count * 16;

  for (let i = 0; i < count; i++) {
    const png = pngBuffers[i];
    if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) {
      throw new Error(`Layer ${i} is not a valid PNG`);
    }
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    const o = i * 16;
    dir.writeUInt8(w >= 256 ? 0 : w, o);
    dir.writeUInt8(h >= 256 ? 0 : h, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(0, o + 4); // planes —0 for PNG-in-ICO
    dir.writeUInt16LE(0, o + 6); // 0 = PNG image data
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(dataOffset, o + 12);
    dataOffset += png.length;
  }

  return Buffer.concat([header, dir, ...pngBuffers]);
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

  const side = Math.min(meta.width ?? 0, meta.height ?? 0);
  const cropSize = Math.round(side * CROP_RATIO);
  const left = Math.floor(((meta.width ?? 0) - cropSize) / 2);
  const top  = Math.floor(((meta.height ?? 0) - cropSize) / 2);
  console.log(`Crop ratio: ${CROP_RATIO} (${cropSize}px from ${side}px)`);

  async function cropResize(size, alpha = true) {
    let s = sharp(raw)
      .extract({ left, top, width: cropSize, height: cropSize })
      .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 });
    if (alpha) s = s.ensureAlpha();
    else s = s.flatten({ background: "#0f1218" });
    return s.png().toBuffer();
  }

  fs.writeFileSync(buildPng, await cropResize(512));
  console.log(`build/icon.png: 512x512 ok`);

  fs.writeFileSync(electronWindowPng, await cropResize(256, false));
  console.log(`electron/window-icon.png: 256x256 opaque ok`);

  fs.copyFileSync(buildPng, publicPng);
  console.log(`public/icon.png: 512x512 ok`);

  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 72, 96, 128, 256];
  const icoPngs = await Promise.all(icoSizes.map((s) => cropResize(s)));

  for (let i = 0; i < icoPngs.length; i++) {
    const m = await sharp(icoPngs[i]).metadata();
    console.log(`  ICO ${icoSizes[i]}x${icoSizes[i]}: ${m.width}x${m.height} ${m.channels}ch`);
  }

  const ico = buildPngIco(icoPngs);
  fs.writeFileSync(buildIco, ico);
  console.log(`build/icon.ico: ${ico.length} bytes (${icoSizes.length} PNG layers) ok`);

  const buf = fs.readFileSync(buildIco);
  const cnt = buf.readUInt16LE(4);
  for (let i = 0; i < cnt; i++) {
    const o = 6 + i * 16;
    const w = buf.readUInt8(o) || 256;
    const h = buf.readUInt8(o + 1) || 256;
    const dataOff = buf.readUInt32LE(o + 12);
    const sig = buf.slice(dataOff, dataOff + 4).toString("hex");
    console.log(`  verify: ${w}x${h} @${dataOff} sig=${sig} ${sig === "89504e47" ? "PNG ok" : "BAD"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
