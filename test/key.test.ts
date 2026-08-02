import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { newKey } from "../src/key.ts";

describe("newKey", () => {
  it("is a random token followed by the image's extension", () => {
    assert.match(newKey("png"), /^[A-Za-z0-9_-]+\.png$/);
    assert.match(newKey("webp"), /^[A-Za-z0-9_-]+\.webp$/);
  });

  it("carries at least 128 bits of entropy", () => {
    // The key is the only thing standing between a public URL and the image
    // behind it (docs/adr/0002), so its randomness is a security property.
    // 128 bits over a 64-character alphabet needs ceil(128 / 6) = 22 characters.
    const [token] = newKey("png").split(".");

    assert.ok(token !== undefined && token.length >= 22, `token was ${token}`);
  });

  it("never repeats itself", () => {
    const keys = new Set(Array.from({ length: 10_000 }, () => newKey("png")));

    assert.equal(keys.size, 10_000);
  });
});
