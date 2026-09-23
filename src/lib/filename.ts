/** "red-shirt_2.jpg" -> "red-shirt", "TS-M-RED (3).png" -> "TS-M-RED", "hammer-2.webp" -> "hammer-2" (the server also tries "hammer") */
export function matchKeyFromFilename(name: string): string {
  let base = name.replace(/\.[a-z0-9]+$/i, "").trim();
  base = base.replace(/\s*\(\d+\)$/, "");
  base = base.replace(/[_\s]\d{1,3}$/, "");
  return base.trim();
}
