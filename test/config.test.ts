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

const withReferences = (accessKeyId: string, secretAccessKey = accessKeyId) => ({
  ...valid,
  secretReferences: { accessKeyId, secretAccessKey },
});

const short = withReferences("pr-image r2/access-key-id", "pr-image r2/secret-access-key");

describe("parseConfig and the vault a short secret reference is missing", () => {
  it("leaves a full reference alone, whatever the environment says", () => {
    const config = parseConfig(valid, { PR_IMAGE_VAULT: "some-other-vault" });

    assert.equal(config.secretReferences.accessKeyId, "op://Automation/pr-image r2/access-key-id");
    assert.equal(
      config.secretReferences.secretAccessKey,
      "op://Automation/pr-image r2/secret-access-key",
    );
  });

  it("completes a short reference from PR_IMAGE_VAULT", () => {
    const config = parseConfig(short, { PR_IMAGE_VAULT: "wsl-work" });

    assert.equal(config.secretReferences.accessKeyId, "op://wsl-work/pr-image r2/access-key-id");
    assert.equal(
      config.secretReferences.secretAccessKey,
      "op://wsl-work/pr-image r2/secret-access-key",
    );
  });

  it("completes a short reference from the config file's vault field", () => {
    const config = parseConfig({ ...short, vault: "wsl-work" }, {});

    assert.equal(config.secretReferences.accessKeyId, "op://wsl-work/pr-image r2/access-key-id");
  });

  it("prefers PR_IMAGE_VAULT over the config file's vault field", () => {
    const env = { PR_IMAGE_VAULT: "from-the-environment" };
    const config = parseConfig({ ...short, vault: "from-the-file" }, env);

    assert.equal(
      config.secretReferences.accessKeyId,
      "op://from-the-environment/pr-image r2/access-key-id",
    );
  });

  it("keeps a section in the middle of a short reference", () => {
    const config = parseConfig(withReferences("pr-image r2/r2/access-key-id"), {
      PR_IMAGE_VAULT: "wsl-work",
    });

    assert.equal(config.secretReferences.accessKeyId, "op://wsl-work/pr-image r2/r2/access-key-id");
  });

  it("names PR_IMAGE_VAULT and the vault field when neither supplies one", () => {
    assert.throws(
      () => parseConfig(short, {}),
      (error: Error) =>
        /PR_IMAGE_VAULT/.test(error.message) &&
        /"vault"/.test(error.message) &&
        /accessKeyId/.test(error.message) &&
        /secretAccessKey/.test(error.message),
    );
  });

  it("treats an empty PR_IMAGE_VAULT as no vault at all", () => {
    for (const value of ["", "   "]) {
      assert.throws(() => parseConfig(short, { PR_IMAGE_VAULT: value }), /PR_IMAGE_VAULT/, value);
    }
  });

  it("guesses no vault when there is none to be had", () => {
    // Nothing in the message may suggest a fallback was tried: reading the
    // wrong vault can succeed, and signing with credentials nobody chose is
    // worse than stopping here.
    assert.throws(
      () => parseConfig(short, {}),
      (error: Error) => !/Private|Personal/.test(error.message),
    );
  });

  it("refuses a vault name that would forge a second path segment", () => {
    assert.throws(
      () => parseConfig(short, { PR_IMAGE_VAULT: "wsl-work/pr-image" }),
      /PR_IMAGE_VAULT/,
    );
    assert.throws(() => parseConfig({ ...short, vault: "wsl-work/pr-image" }, {}), /vault/);
    assert.throws(() => parseConfig({ ...short, vault: "" }, {}), /vault/);
  });

  it("rejects a malformed reference instead of reading it as a short one", () => {
    const malformed = [
      "pr-image-r2-key", // no field
      "pr-image-r2-key/", // empty field
      "/access-key-id", // empty item
      "pr-image-r2-key//access-key-id", // empty section
      "op://Automation/pr-image r2", // full form, no field
      "op:///pr-image r2/access-key-id", // full form, no vault
      "op:/Automation/pr-image r2/access-key-id", // one slash short of a scheme
      "ops://Automation/pr-image r2/access-key-id", // not 1Password's scheme
    ];

    for (const value of malformed) {
      assert.throws(
        () => parseConfig(withReferences(value), { PR_IMAGE_VAULT: "wsl-work" }),
        /secretReferences\.accessKeyId/,
        value,
      );
    }
  });
});
