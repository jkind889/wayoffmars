/** Same-origin requests only. No remote services or automatic legacy migration. */
export async function localRequest<T>(kind: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/library?kind=${kind}`, { cache: "no-store", method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json", "X-Wayoffmars": "1" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Local storage request failed. Retry.");
  return result as T;
}
export function encodeBytes(bytes: ArrayBuffer): string {
  const array = new Uint8Array(bytes); let text = "";
  for (let i = 0; i < array.length; i += 8192) text += String.fromCharCode(...array.subarray(i, i + 8192));
  return btoa(text);
}
export function decodeBytes(text: string): ArrayBuffer { return Uint8Array.from(atob(text), c => c.charCodeAt(0)).buffer; }
