/**
 * Post-build script: patches the portable and NSIS installer exes with the
 * correct multi-layer icon using rcedit.
 *
 * NSIS's makensis embeds icons incorrectly (garbled green grid for some sizes).
 * rcedit (the same tool Electron uses for the unpacked exe) handles all ICO
 * formats correctly, so we run it on the two wrapper exes after the build.
 */
const fs = require("node:fs");
const path = require("node:path");
const { rcedit } = require("rcedit");

const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");
const icoPath = path.join(root, "build", "icon.ico");

async function main() {
  if (!fs.existsSync(icoPath)) {
    console.error(`Missing ${icoPath} — run "npm run icons" first`);
    process.exit(1);
  }

  if (!fs.existsSync(releaseDir)) {
    console.error(`Missing ${releaseDir} — run electron-builder first`);
    process.exit(1);
  }

  const exes = fs.readdirSync(releaseDir)
    .filter(f => f.endsWith(".exe") && !f.startsWith("__"))
    .map(f => path.join(releaseDir, f));

  if (exes.length === 0) {
    console.log("No exe files found in release/");
    return;
  }

  for (const exe of exes) {
    const name = path.basename(exe);
    try {
      await rcedit(exe, { icon: icoPath });
      console.log(`Patched: ${name}`);
    } catch (err) {
      console.error(`Failed to patch ${name}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
