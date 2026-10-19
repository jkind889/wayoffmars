import { deflateSync } from 'node:zlib';
// Two-frame APNG: Sharp reports this as an ordinary PNG and decodes only frame 1.
export function animatedPng() {
  const crc = (bytes: Buffer) => {
    let value = -1;
    for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
    return (value ^ -1) >>> 0;
  };
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([length, type, data, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  const animation = Buffer.alloc(8); animation.writeUInt32BE(2);
  const frame = (sequence: number) => {
    const data = Buffer.alloc(26); data.writeUInt32BE(sequence); data.writeUInt32BE(1, 4); data.writeUInt32BE(1, 8); data.writeUInt16BE(1, 20); data.writeUInt16BE(10, 22);
    return chunk('fcTL', data);
  };
  const sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('acTL', animation), frame(0), chunk('IDAT', deflateSync(Buffer.from([0,255,0,0,255]))), frame(1), chunk('fdAT', Buffer.concat([sequence, deflateSync(Buffer.from([0,0,0,255,255]))])), chunk('IEND', Buffer.alloc(0))]);
}
