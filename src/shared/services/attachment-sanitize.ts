/**
 * Drop location metadata from images the route stores.
 * Canvas resize already drops EXIF for images it redraws; this also covers
 * passthrough files that were not resized.
 */

const JPEG_APP1 = 0xe1;
const JPEG_SOS = 0xda;

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function stripJpegApp1(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;

  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) {
      parts.push(bytes.subarray(i));
      break;
    }
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) break;

    const marker = bytes[i];
    const markerStart = i - 1;
    i += 1;

    if (marker === 0xd9) {
      parts.push(Uint8Array.of(0xff, marker));
      break;
    }
    if (marker === JPEG_SOS) {
      parts.push(bytes.subarray(markerStart));
      break;
    }
    const standalone = (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01;
    if (standalone) {
      parts.push(Uint8Array.of(0xff, marker));
      continue;
    }
    if (i + 1 >= bytes.length) break;

    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) {
      parts.push(bytes.subarray(markerStart));
      break;
    }

    const segmentEnd = i + length;
    if (marker !== JPEG_APP1) {
      parts.push(bytes.subarray(markerStart, segmentEnd));
    }
    i = segmentEnd;
  }

  return concat(parts);
}

const PNG_TEXT_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);

function stripPngText(bytes: Uint8Array): Uint8Array {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || signature.some((byte, index) => bytes[index] !== byte)) return bytes;

  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;

  while (i + 8 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + i, 4).getUint32(0);
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const chunkEnd = i + 12 + length;
    if (length < 0 || chunkEnd > bytes.length) {
      parts.push(bytes.subarray(i));
      break;
    }
    if (!PNG_TEXT_CHUNKS.has(type)) {
      parts.push(bytes.subarray(i, chunkEnd));
    }
    i = chunkEnd;
  }

  return concat(parts);
}

const WEBP_DROP = new Set(["EXIF", "XMP "]);

function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 12) return bytes;
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (riff !== "RIFF" || webp !== "WEBP") return bytes;

  const chunks: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const size = new DataView(bytes.buffer, bytes.byteOffset + i + 4, 4).getUint32(0, true);
    const dataEnd = i + 8 + size;
    if (dataEnd > bytes.length) break;
    const paddedEnd = dataEnd + (size % 2);
    const chunkEnd = paddedEnd <= bytes.length ? paddedEnd : dataEnd;
    if (!WEBP_DROP.has(fourcc)) chunks.push(bytes.subarray(i, chunkEnd));
    i = chunkEnd;
  }

  const payload = concat(chunks);
  const out = new Uint8Array(12 + payload.length);
  out.set(bytes.subarray(0, 4), 0);
  new DataView(out.buffer).setUint32(4, 4 + payload.length, true);
  out.set(bytes.subarray(8, 12), 8);
  out.set(payload, 12);
  return out;
}

export function stripImageMetadata(bytes: Uint8Array, mime: string): Uint8Array {
  if (mime === "image/jpeg") return stripJpegApp1(bytes);
  if (mime === "image/png") return stripPngText(bytes);
  if (mime === "image/webp") return stripWebpMetadata(bytes);
  return bytes;
}
