export interface ImageType {
  contentType: string;
  extension: string;
}

const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0));

interface Fragment {
  offset: number;
  magic: readonly number[];
}

const matches = (source: Uint8Array, fragments: readonly Fragment[]) =>
  fragments.every(({ offset, magic }) =>
    magic.every((byte, index) => source[offset + index] === byte),
  );

/**
 * Formats a screenshot tool can realistically produce. SVG is deliberately
 * absent: it can carry script, and these images are served from a domain the
 * developer owns, so that script would run on their origin.
 */
const SIGNATURES: ReadonlyArray<{
  fragments: readonly Fragment[];
  type: ImageType;
}> = [
  {
    fragments: [{ offset: 0, magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
    type: { contentType: "image/png", extension: "png" },
  },
  {
    fragments: [{ offset: 0, magic: [0xff, 0xd8, 0xff] }],
    type: { contentType: "image/jpeg", extension: "jpg" },
  },
  {
    fragments: [{ offset: 0, magic: ascii("GIF87a") }],
    type: { contentType: "image/gif", extension: "gif" },
  },
  {
    fragments: [{ offset: 0, magic: ascii("GIF89a") }],
    type: { contentType: "image/gif", extension: "gif" },
  },
  // RIFF and ftyp are containers shared with non-image formats — audio in the
  // first case, video in the second — so both the container and the brand that
  // follows it have to match.
  {
    fragments: [
      { offset: 0, magic: ascii("RIFF") },
      { offset: 8, magic: ascii("WEBP") },
    ],
    type: { contentType: "image/webp", extension: "webp" },
  },
];

const AVIF: ImageType = { contentType: "image/avif", extension: "avif" };
const AVIF_BRANDS = new Set(["avif", "avis"]);

/**
 * AVIF shares the ISO base media container with MP4 and HEIC, so the ftyp box
 * has to be read rather than pattern-matched. Encoders disagree about where
 * the brand goes — libavif makes "avif" the major brand, others declare
 * "mif1" and list "avif" among the compatible brands — so both are checked.
 */
function isAvif(source: Uint8Array): boolean {
  if (!matches(source, [{ offset: 4, magic: ascii("ftyp") }])) return false;

  const boxSize = new DataView(source.buffer, source.byteOffset, source.byteLength).getUint32(0);
  const end = Math.min(boxSize === 0 ? source.byteLength : boxSize, source.byteLength);
  const brands = new TextDecoder("latin1").decode(source.subarray(8, end));

  // Brand at 8 is the major one; from 16 they are the compatible list. The
  // minor version at 12 is a number, so it is skipped rather than read as text.
  const candidates = [brands.slice(0, 4), ...(brands.slice(8).match(/.{4}/g) ?? [])];
  return candidates.some((brand) => AVIF_BRANDS.has(brand));
}

/**
 * Identify an image by its leading bytes rather than its file name. The
 * extension a source file happens to carry is a claim, not evidence, and a
 * wrong Content-Type renders as a download prompt instead of a picture.
 *
 * Returns undefined for anything not recognised, including SVG.
 */
export function detectImageType(source: Uint8Array): ImageType | undefined {
  const match = SIGNATURES.find(({ fragments }) => matches(source, fragments));
  if (match !== undefined) return match.type;
  return isAvif(source) ? AVIF : undefined;
}
