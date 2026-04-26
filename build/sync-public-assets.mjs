import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");

const pathsToCopy = [
  "games",
  "templates",
  "banner.png",
  "coming_soon_banner.png",
  "coming_soon_banner_sq.png"
];

function rmIfExists(target) {
  if (!fs.existsSync(target)) {
    return;
  }

  fs.rmSync(target, { recursive: true, force: true });
}

function copyPath(sourceRelative) {
  const source = path.join(root, sourceRelative);
  const destination = path.join(publicDir, sourceRelative);

  if (!fs.existsSync(source)) {
    return;
  }

  rmIfExists(destination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  console.log(`[sync] copied ${sourceRelative}`);
}

function run() {
  fs.mkdirSync(publicDir, { recursive: true });

  for (const item of pathsToCopy) {
    copyPath(item);
  }
}

run();
