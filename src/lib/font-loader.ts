const MAX_FONT_BYTES = 20 * 1024 * 1024;
const FONT_EXTENSION = /\.(ttf|otf|woff2?)$/i;
const FONT_SIGNATURES = new Set([
  0x00010000, // TrueType
  0x74727565, // Apple TrueType ("true")
  0x4f54544f, // OpenType ("OTTO")
  0x774f4646, // WOFF ("wOFF")
  0x774f4632, // WOFF2 ("wOF2")
]);

/** Read and decode a font in the browser. Registration belongs to the caller. */
export async function readFont(file: File): Promise<ArrayBuffer> {
  if (!FONT_EXTENSION.test(file.name)) {
    throw new Error("Choose a TTF, OTF, WOFF or WOFF2 font file.");
  }
  if (file.size === 0) {
    throw new Error("This file is empty. Choose a font file with content.");
  }
  if (file.size > MAX_FONT_BYTES) {
    throw new Error("This file is too large. Choose a font smaller than 20 MiB.");
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error("This file could not be read. Try choosing it again.");
  }

  validateFontBytes(bytes);
  return bytes;
}

export function validateFontBytes(bytes: ArrayBuffer) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FONT_BYTES ||
    bytes.byteLength < 4 ||
    !FONT_SIGNATURES.has(new DataView(bytes).getUint32(0))
  ) {
    throw new Error("This file does not contain a supported font.");
  }

}

export async function loadFontBytes(bytes: ArrayBuffer, family: string): Promise<FontFace> {
  validateFontBytes(bytes);
  if (typeof FontFace === "undefined") {
    throw new Error("This browser does not support font previews.");
  }
  try {
    const face = new FontFace(family, bytes);
    return await face.load();
  } catch {
    throw new Error(
      "The browser could not decode this font. It may be damaged or unsupported.",
    );
  }
}

export async function loadFont(file: File, family: string): Promise<FontFace> {
  return loadFontBytes(await readFont(file), family);
}
