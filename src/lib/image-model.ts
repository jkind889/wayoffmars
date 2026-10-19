import { validateSource } from './note-model';
export const IMAGE_LIMITS = { bytes: 20 * 1024 * 1024, dimension: 12000, pixels: 24000000, title: 200, source: 2048, description: 2000 };
export type ImageFields = { title: string; source: string; description: string };
export type SavedImage = ImageFields & { id: string; revision: string; filename: string; byteSize: number; width: number; height: number; format: 'png' | 'jpeg' | 'webp'; createdAt: number; updatedAt: number };
export function imageFields(value: unknown): ImageFields {
  const fields = value as ImageFields;
  if (!fields || ['title', 'source', 'description'].some(key => typeof fields[key as keyof ImageFields] !== 'string' || fields[key as keyof ImageFields].length > IMAGE_LIMITS[key as keyof ImageFields])) throw new Error('Image metadata exceeds its allowed length.');
  const result = { title: fields.title.trim(), source: fields.source.trim(), description: fields.description.trim() };
  if (!result.title) throw new Error('Add a title before saving.');
  if (!validateSource(result.source)) throw new Error('Use a complete http:// or https:// source URL, or leave it empty.');
  return result;
}
