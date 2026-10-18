import { cp, mkdir, readFile } from "node:fs/promises";

const source = new URL("../node_modules/pdfjs-dist/", import.meta.url);
const { version } = JSON.parse(await readFile(new URL("package.json", source), "utf8"));
const target = new URL(`../public/pdfjs/${version}/`, import.meta.url);
await mkdir(target, { recursive: true });
// Serve parser resources from this app, never a third-party CDN. Versioned paths
// prevent a cached worker from disagreeing with the bundled API after an upgrade.
for (const file of ["build/pdf.worker.min.mjs", "cmaps", "standard_fonts", "LICENSE"]) {
  await cp(new URL(file, source), new URL(file.split("/").at(-1), target), { recursive: true });
}
