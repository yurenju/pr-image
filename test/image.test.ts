import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectImageType } from "../src/image.ts";

// Magic numbers are written out as literals taken from each format's
// specification, so that a mistake in the implementation cannot be mirrored
// by a mistake in the fixture.
const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array(Buffer.from(text, "ascii"));
const concat = (...parts: Uint8Array[]) => Buffer.concat(parts);

describe("detectImageType", () => {
  it("recognises a PNG by its signature", () => {
    const png = concat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), bytes(0, 0, 0, 0));

    assert.deepEqual(detectImageType(png), { contentType: "image/png", extension: "png" });
  });

  it("recognises a JPEG by its start-of-image marker", () => {
    const jpeg = concat(bytes(0xff, 0xd8, 0xff, 0xe0), ascii("\0\x10JFIF"));

    assert.deepEqual(detectImageType(jpeg), { contentType: "image/jpeg", extension: "jpg" });
  });

  it("recognises both GIF versions", () => {
    for (const header of ["GIF87a", "GIF89a"]) {
      assert.deepEqual(detectImageType(ascii(header)), {
        contentType: "image/gif",
        extension: "gif",
      });
    }
  });

  it("recognises a WebP by the brand inside its RIFF container", () => {
    const webp = concat(ascii("RIFF"), bytes(0x24, 0x00, 0x00, 0x00), ascii("WEBP"));

    assert.deepEqual(detectImageType(webp), { contentType: "image/webp", extension: "webp" });
  });

  it("recognises an AVIF by the brand inside its ftyp box", () => {
    const avif = concat(bytes(0x00, 0x00, 0x00, 0x1c), ascii("ftyp"), ascii("avif"));

    assert.deepEqual(detectImageType(avif), { contentType: "image/avif", extension: "avif" });
  });

  it("recognises an AVIF whose brand is only in the compatible list", () => {
    // ISO/IEC 14496-12 ftyp box: size, "ftyp", major brand, minor version,
    // then the compatible brands. Encoders vary over which brand goes where —
    // libavif writes a major brand of "avif", Apple's writes "mif1" and lists
    // "avif" as compatible — so both places have to be looked at.
    const ftyp = concat(
      bytes(0x00, 0x00, 0x00, 0x1c),
      ascii("ftyp"),
      ascii("mif1"),
      bytes(0x00, 0x00, 0x00, 0x00),
      ascii("mif1"),
      ascii("avif"),
      ascii("miaf"),
    );

    assert.deepEqual(detectImageType(ftyp), { contentType: "image/avif", extension: "avif" });
  });

  it("recognises an AVIF image sequence", () => {
    const avis = concat(bytes(0x00, 0x00, 0x00, 0x14), ascii("ftyp"), ascii("avis"));

    assert.deepEqual(detectImageType(avis), { contentType: "image/avif", extension: "avif" });
  });

  it("does not mistake other ISO base media files for AVIF", () => {
    const mp4 = concat(
      bytes(0x00, 0x00, 0x00, 0x18),
      ascii("ftyp"),
      ascii("isom"),
      bytes(0x00, 0x00, 0x02, 0x00),
      ascii("isomiso2mp41"),
    );

    assert.equal(detectImageType(mp4), undefined);
  });

  it("does not mistake a RIFF container that is not a WebP for one", () => {
    const wav = concat(ascii("RIFF"), bytes(0x24, 0x00, 0x00, 0x00), ascii("WAVE"));

    assert.equal(detectImageType(wav), undefined);
  });

  it("refuses SVG even though it is an image", () => {
    // SVG can carry script, and these images are served from a domain of the
    // developer's own. See docs/adr/0002.
    const svg = ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    assert.equal(detectImageType(svg), undefined);
  });

  it("rejects bytes that are not an image at all", () => {
    assert.equal(detectImageType(ascii("just some text, definitely not a PNG")), undefined);
  });

  it("rejects an empty source file", () => {
    assert.equal(detectImageType(new Uint8Array()), undefined);
  });
});
