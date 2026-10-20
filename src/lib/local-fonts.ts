import { validateFontBytes } from './font-loader';
import { fontIdentity, type SavedFont } from './font-model';

/** Browser-owned handles; keep these in memory, never in storage or logs. */
export type LocalFontData = {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Blob>;
};
type FontWindow = Window & { queryLocalFonts?: () => Promise<LocalFontData[]> };

export function localFontAvailability(): string | null {
  if (!window.isSecureContext) return 'Installed-font browsing needs a secure context. Open wayoffmars at wayoffmars.localhost, localhost or 127.0.0.1. You can still choose font files.';
  if (typeof (window as FontWindow).queryLocalFonts !== 'function') return 'This browser does not support installed-font browsing. Use desktop Chrome, or choose font files here.';
  return null;
}

/** Call directly from a click handler, before awaiting any other work. */
export function queryInstalledFonts(): Promise<LocalFontData[]> {
  const unavailable = localFontAvailability();
  if (unavailable) return Promise.reject(new Error(unavailable));
  return (window as FontWindow).queryLocalFonts!();
}

export function localFontError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') return 'Font access was not granted or was canceled. You can retry Browse installed fonts or choose font files.';
    if (error.name === 'SecurityError') return 'The browser blocked font access. Retry from Browse installed fonts at wayoffmars.localhost, localhost or 127.0.0.1, or choose font files.';
    if (error.name === 'NotFoundError') return 'This installed font is no longer available. Browse installed fonts again, or choose its font file.';
  }
  return error instanceof Error ? error.message : 'This installed font could not be read. Browse installed fonts again, or choose its font file.';
}

export async function readInstalledFont(font: LocalFontData): Promise<SavedFont> {
  const blob = await font.blob();
  if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('Choose an installed font smaller than 20 MiB.');
  const bytes = await blob.arrayBuffer();
  validateFontBytes(bytes);
  const signature = new DataView(bytes).getUint32(0);
  const extension = signature === 0x4f54544f ? 'otf' : signature === 0x774f4646 ? 'woff' : signature === 0x774f4632 ? 'woff2' : 'ttf';
  // A display filename only; existing storage always uses the content hash as its path.
  const stem = (font.postscriptName || font.fullName || 'Installed font').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180);
  return { id: await fontIdentity(bytes), name: `${stem}.${extension}`, bytes, size: bytes.byteLength, addedAt: Date.now() };
}
