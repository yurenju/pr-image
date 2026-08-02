import { randomBytes } from "node:crypto";

/** 16 bytes is 128 bits, which base64url renders as 22 characters. */
const TOKEN_BYTES = 16;

/**
 * Mint the identifier an image will live under.
 *
 * The token is the only secret protecting a public URL, so it comes from a
 * cryptographic source and encodes nothing — no repository, no date, no
 * original file name. See docs/adr/0002.
 */
export function newKey(extension: string): string {
  return `${randomBytes(TOKEN_BYTES).toString("base64url")}.${extension}`;
}
