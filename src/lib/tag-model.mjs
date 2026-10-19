/** Match the existing note convention: trim and lowercase, without slugging. */
export const tagKey = label => label.trim().toLowerCase();
export const TAG_LIMIT = 1000;
/** @param {unknown} value @returns {string[]} */
export function normalizeTags(value) {
  if (!Array.isArray(value) || !value.every(tag => typeof tag === 'string' && tag.trim()) || value.join(',').length > TAG_LIMIT) {
    throw new Error('Use nonempty text tags, up to 1,000 characters in total.');
  }
  return [...new Map(value.map(label => [tagKey(label), label.trim()])).values()];
}
