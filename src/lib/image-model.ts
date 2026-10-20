import { validateSource } from './note-model';
export const IMAGE_LIMITS = { bytes: 20 * 1024 * 1024, dimension: 12000, pixels: 24000000, title: 200, source: 2048, description: 2000 };
export type ImageFields = { title: string; source: string; description: string; texture?: boolean };
export type SavedImage = ImageFields & { id: string; revision: string; filename: string; byteSize: number; width: number; height: number; format: 'png' | 'jpeg' | 'webp'; createdAt: number; updatedAt: number };
export function imageFields(value: unknown): ImageFields {
  const fields = value as ImageFields;
  if (!fields || (['title', 'source', 'description'] as const).some(key => typeof fields[key] !== 'string' || fields[key].length > IMAGE_LIMITS[key])) throw new Error('Image metadata exceeds its allowed length.');
  if (fields.texture !== undefined && typeof fields.texture !== 'boolean') throw new Error('Texture classification must be true or false.');
  const result = { title: fields.title.trim(), source: fields.source.trim(), description: fields.description.trim() };
  if (!result.title) throw new Error('Add a title before saving.');
  if (!validateSource(result.source)) throw new Error('Use a complete http:// or https:// source URL, or leave it empty.');
  // Omitted classification preserves older clients' metadata updates.
  return { ...result, ...(fields.texture === undefined ? {} : { texture: fields.texture }) };
}
