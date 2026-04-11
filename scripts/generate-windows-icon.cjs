/**
 * Builds build/icon.ico from build/icon.png for electron-builder (Windows .exe / NSIS / taskbar).
 *
 * 1) Center-crop with ICON_CROP_RATIO (default 0.62) so the artwork fills the icon — source art
 *    often has padding that makes the glyph look tiny at 16–256px.
 * 2) Lanczos resize for sharp multi-size layers.
 * 3) Writes public/icon.png at 512×512 so the browser favicon scales up cleanly.
 */
const fs = require("node:fs");
const path = require("node:path");

const sharp = require("sharp");
const toIco = require("to-ico");

const root = path.join(__dirname, "..");
const pngPath = path.join(root, "build", "icon.png");
const icoPath = path.join(root, "build", "icon.ico");
const publicPng = path.join(root, "public", "icon.png");

/** Fraction of min(width,height) kept from the center. Lower = tighter crop = larger-looking subject. */
const CROP_RATIO = Math.min(
  0.95,
  Math.max(0.35, Number(process.env.ICON_CROP_RATIO || 0.62)),
);

async function centerCropSquare(inputBuffer) {
  const meta = await sharp(inputBuffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) {
    throw new Error("Could not read image dimensions");
  }
  const side = Math.min(w, h);
  const cropSize = Math.max(1, Math.round(side * CROP_RATIO));
  const left = Math.floor((w - cropSize) / 2);
  const top = Math.floor((h - cropSize) / 2);
  return sharp(inputBuffer)
    .extract({ left, top, width: cropSize, height: cropSize })
    .ensureAlpha()
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(pngPath)) {
    console.error("Missing", pngPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(pngPath);
  const cropped = await centerCropSquare(raw);
  console.log("Center crop ratio", CROP_RATIO, "(set ICON_CROP_RATIO to tweak)");

  const sizes = [16, 24, 32, 48, 64, 96, 128, 256];
  const buffers = await Promise.all(
    sizes.map((w) =>
      sharp(cropped)
        .resize(w, w, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer(),
    ),
  );
  const ico = await toIco(buffers);
  fs.writeFileSync(icoPath, ico);
  const electronIco = path.join(root, "electron", "icon.ico");
  fs.copyFileSync(icoPath, electronIco);
  console.log("Wrote", icoPath, `(${ico.length} bytes)`);
  console.log("Copied to", electronIco);

  fs.mkdirSync(path.dirname(publicPng), { recursive: true });
  await sharp(cropped)
    .resize(512, 512, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(publicPng);
  console.log("Wrote", publicPng, "(512×512 favicon)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
