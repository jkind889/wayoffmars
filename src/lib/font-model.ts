import { validateFontBytes } from "./font-loader";
export type SavedFont = {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  size: number;
  addedAt: number;
};

export async function validateSavedFont(value: unknown): Promise<SavedFont> {
  if (!value || typeof value !== "object") throw new Error("Invalid saved font record.");
  const font = value as SavedFont;
  if (typeof font.id !== "string" || !/^[a-f0-9]{64}$/.test(font.id) ||
      typeof font.name !== "string" || !/\.(ttf|otf|woff2?)$/i.test(font.name) || font.name.length > 512 ||
      !(font.bytes instanceof ArrayBuffer) || font.size !== font.bytes.byteLength ||
      !Number.isFinite(font.addedAt) || font.addedAt < 0) {
    throw new Error("Invalid saved font metadata. Its stored data has been kept.");
  }
  validateFontBytes(font.bytes);
  if (await fontIdentity(font.bytes) !== font.id) throw new Error("Saved font checksum mismatch. Its stored data has been kept.");
  return font;
}

export async function fontIdentity(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

