/** Tiny valid PDFs generated in tests; no third-party document content. */
export function makePdf(pages: string[], encrypted = false, xfa = false, active = false): Buffer {
  const objects = [
    `<< /Type /Catalog ${active ? '/OpenAction << /S /JavaScript /JS <6170702e616c65727428226163746976652229> >>' : ''} /Pages 2 0 R /PageLabels << /Nums [0 << /S /r >>] >>${xfa ? ` /AcroForm << /XFA ${5 + pages.length * 2} 0 R >>` : ""} >>`,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const imageId = 4 + pages.length * 2;
  for (const stream of pages) {
    objects.push(`<< /Type /Page ${active ? '/Annots [<< /Type /Annot /Subtype /Link /Rect [0 0 600 800] /A << /S /URI /URI (https://example.invalid/pdf-active-content) >> >>]' : ''} /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> /XObject << /Scan ${imageId} 0 R >> >> /Contents ${objects.length + 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  // An image-only page exercises the no-text path without requiring OCR assets.
  objects.push("<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\nX\nendstream");
  if (xfa) objects.push("<< /Length 7 >>\nstream\n<xdp />\nendstream");
  if (encrypted) objects.push(`<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${"ab".repeat(32)}> /U <${"cd".repeat(32)}> /P -4 >>`);
  let content = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(content)); content += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encrypted ? ` /Encrypt ${objects.length} 0 R /ID [<00112233445566778899aabbccddeeff00><00112233445566778899aabbccddeeff00>]` : ""} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}
export const textPage = (text: string) => `BT /F1 12 Tf 40 700 Td (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`;
export const imagePage = "q 500 0 0 700 0 0 cm /Scan Do Q";
