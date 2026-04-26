const baseUrl = import.meta.env.BASE_URL || "/";
const normalizedBase = baseUrl === "/" ? "" : baseUrl.replace(/\/$/, "");

export function withBase(path: string): string;
export function withBase(path: string | undefined): string | undefined;
export function withBase(path?: string): string | undefined {
  if (!path) return path;
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (normalizedBase && path.startsWith(`${normalizedBase}/`)) return path;
  return path === "/" ? `${normalizedBase}/` || "/" : `${normalizedBase}${path}`;
}

export function resolveGameAssetPath(folder: string, value?: string): string | undefined {
  if (!value) return undefined;
  if (/^[a-z]+:/i.test(value) || value.startsWith("//")) return value;
  if (value.startsWith("/")) return withBase(value);
  return withBase(`/games/${folder}/${value}`);
}