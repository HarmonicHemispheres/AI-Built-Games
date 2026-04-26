import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const gamesDir = path.join(projectRoot, "games");

export type GameMeta = {
  slug?: string;
  title?: string;
  tagline?: string;
  description?: string;
  category?: string;
  tags?: string[];
  featured?: boolean;
  status?: string;
  created?: string;
  updated?: string;
  version?: string;
  built_with?: { provider?: string; model?: string };
  chat_url?: string;
  entry?: string;
  banner?: string;
  info_url?: string;
  features?: string[];
  controls?: string[];
};

export type LoadedMeta = GameMeta & { folder: string };

export function loadAllMeta(): LoadedMeta[] {
  if (!fs.existsSync(gamesDir)) return [];

  const result: LoadedMeta[] = [];
  for (const entry of fs.readdirSync(gamesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(gamesDir, entry.name, "meta.yaml");
    if (!fs.existsSync(metaPath)) continue;

    const raw = fs.readFileSync(metaPath, "utf8");
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== "object") continue;

    result.push({ ...(parsed as GameMeta), folder: entry.name });
  }
  return result;
}
