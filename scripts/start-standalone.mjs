import { access, cp } from "node:fs/promises";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
try {
  await access(projectFile(".next/standalone/server.js"));
} catch {
  throw new Error("Production output is missing. Run npm run build before npm start.");
}
// Next's standalone output omits static/public assets; copy them for native serving.
await cp(projectFile(".next/static"), projectFile(".next/standalone/.next/static"), { recursive: true });
try {
  await cp(projectFile("public"), projectFile(".next/standalone/public"), { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
process.env.HOSTNAME = "127.0.0.1";
await import(projectFile(".next/standalone/server.js").href);
