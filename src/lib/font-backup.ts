import { validateFontBytes } from "./font-loader";
import { validateSavedFont, type SavedFont } from "./font-storage";

export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const MAX_BACKUP_FONTS = 500;
const FORMAT = "wayoffmars-font-backup";
export const BACKUP_VERSION = 1;

function encode(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes);
  let binary = "";
  for (let offset = 0; offset < data.length; offset += 32768) {
    binary += String.fromCharCode(...data.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

export function createBackup(fonts: SavedFont[]): Blob {
  if (fonts.length > MAX_BACKUP_FONTS) throw new Error("A backup supports up to 500 fonts. Keep original files for larger collections.");
  // Base64 expands by roughly one third. Bound memory before encoding.
  if (fonts.reduce((size, font) => size + Math.ceil(font.size / 3) * 4 + 2048, 256) > MAX_BACKUP_BYTES) {
    throw new Error("This backup would exceed 100 MiB. Keep original font files or split the collection.");
  }
  const backup = {
    format: FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    fonts: fonts.map(({ bytes, ...metadata }) => ({ ...metadata, encoding: "base64", data: encode(bytes) })),
  };
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  if (blob.size > MAX_BACKUP_BYTES) throw new Error("This backup exceeds 100 MiB.");
  return blob;
}

/** Validate the envelope before making any changes. Entries are validated individually. */
export async function readBackup(file: File): Promise<unknown[]> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error("Choose a backup smaller than 100 MiB.");
  let value: unknown;
  try { value = JSON.parse(await file.text()); }
  catch { throw new Error("This backup could not be read as JSON. Choose a wayoffmars backup."); }
  if (!value || typeof value !== "object" || !("format" in value) || value.format !== FORMAT ||
      !("version" in value) || value.version !== BACKUP_VERSION) {
    throw new Error("Unsupported backup format or version. Choose a wayoffmars version 1 backup.");
  }
  if (!("fonts" in value) || !Array.isArray(value.fonts) || value.fonts.length > MAX_BACKUP_FONTS) {
    throw new Error("Invalid backup manifest. A backup supports up to 500 fonts.");
  }
  return value.fonts;
}

export async function readBackupFont(value: unknown): Promise<SavedFont> {
  if (!value || typeof value !== "object") throw new Error("Invalid backup font entry.");
  const entry = value as Record<string, unknown>;
  if (entry.encoding !== "base64" || typeof entry.data !== "string" || entry.data.length > Math.ceil(20 * 1024 * 1024 / 3) * 4 ||
      entry.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.data)) {
    throw new Error("Invalid font bytes in backup.");
  }
  const binary = atob(entry.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  validateFontBytes(bytes.buffer);
  return validateSavedFont({ id: entry.id, name: entry.name, size: entry.size, addedAt: entry.addedAt, bytes: bytes.buffer });
}
