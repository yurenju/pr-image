import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseConfig } from "../src/config.ts";

const valid = {
  accountId: "0123456789abcdef0123456789abcdef",
  bucket: "pr-images",
  publicBaseUrl: "https://img.example.com",
  tokenFile: "/home/dev/.config/op/service-account-token",
  secretReferences: {
    accessKeyId: "op://Automation/pr-image r2/access-key-id",
    secretAccessKey: "op://Automation/pr-image r2/secret-access-key",
  },
};

const withoutField = (field: string) => {
  const { [field]: _removed, ...rest } = valid as Record<string, unknown>;
  return rest;
};

describe("parseConfig", () => {
  it("accepts a complete configuration", () => {
    const config = parseConfig(valid);

    assert.equal(config.accountId, valid.accountId);
    assert.equal(config.bucket, "pr-images");
    assert.equal(config.secretReferences.accessKeyId, valid.secretReferences.accessKeyId);
  });

  it("defaults the size limit when it is not given", () => {
    assert.equal(parseConfig(valid).maxFileSizeBytes, 10 * 1024 * 1024);
  });

  it("honours a size limit that is given", () => {
    assert.equal(parseConfig({ ...valid, maxFileSizeMb: 2 }).maxFileSizeBytes, 2 * 1024 * 1024);
  });

  it("names the field that is missing", () => {
    for (const field of ["accountId", "bucket", "publicBaseUrl", "tokenFile"]) {
      assert.throws(() => parseConfig(withoutField(field)), new RegExp(field), `for ${field}`);
    }
  });

  it("reports every problem at once rather than one per run", () => {
    assert.throws(
      () => parseConfig({ bucket: "pr-images" }),
      (error: Error) =>
        /accountId/.test(error.message) &&
        /publicBaseUrl/.test(error.message) &&
        /tokenFile/.test(error.message),
    );
  });

  it("rejects a public base URL that is not a URL", () => {
    assert.throws(() => parseConfig({ ...valid, publicBaseUrl: "img.example.com" }), /publicBaseUrl/);
  });

  it("rejects a public base URL that is not something a browser can fetch", () => {
    // URL.canParse alone accepts these, but images have to be reachable by
    // GitHub's image proxy, not just parseable.
    for (const url of ["file:///tmp/images", "ftp://img.example.com", "op://vault/item/field"]) {
      assert.throws(() => parseConfig({ ...valid, publicBaseUrl: url }), /publicBaseUrl/, url);
    }
  });

  it("allows a plain http public base URL", () => {
    assert.equal(
      parseConfig({ ...valid, publicBaseUrl: "http://localhost:8080" }).publicBaseUrl,
      "http://localhost:8080",
    );
  });

  it("drops a trailing slash from the public base URL", () => {
    const config = parseConfig({ ...valid, publicBaseUrl: "https://img.example.com/" });

    assert.equal(config.publicBaseUrl, "https://img.example.com");
  });

  it("says which secret reference is malformed", () => {
    assert.throws(
      () =>
        parseConfig({
          ...valid,
          secretReferences: { ...valid.secretReferences, secretAccessKey: "not-a-reference" },
        }),
      /secretAccessKey/,
    );
  });

  it("rejects anything that is not an object", () => {
    assert.throws(() => parseConfig("nope"));
    assert.throws(() => parseConfig(null));
  });
});
