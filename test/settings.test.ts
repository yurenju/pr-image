import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { loadSettings } from "../src/settings.ts";

/** An environment whose config directory is empty, so no old config file is found. */
async function cleanEnv(vars: Record<string, string> = {}): Promise<NodeJS.ProcessEnv> {
  const configHome = await mkdtemp(join(tmpdir(), "pr-image-settings-"));
  return { XDG_CONFIG_HOME: configHome, ...vars };
}

describe("loadSettings", () => {
  it("names the environment variable to set when the token is missing", async () => {
    await assert.rejects(loadSettings(await cleanEnv()), /PR_IMAGE_BLOB_TOKEN/);
  });

  it("treats a blank token as missing", async () => {
    await assert.rejects(
      loadSettings(await cleanEnv({ PR_IMAGE_BLOB_TOKEN: "  \n" })),
      /PR_IMAGE_BLOB_TOKEN/,
    );
  });

  it("says the old config file is no longer read when one is still there", async () => {
    const env = await cleanEnv();
    const oldConfig = join(env["XDG_CONFIG_HOME"]!, "pr-image", "config.json");
    await mkdir(dirname(oldConfig), { recursive: true });
    await writeFile(oldConfig, "{}");

    await assert.rejects(loadSettings(env), (error: Error) => {
      assert.match(error.message, /PR_IMAGE_BLOB_TOKEN/);
      assert.ok(error.message.includes(oldConfig), error.message);
      return true;
    });
  });

  it("does not mention an old config file when there is none", async () => {
    await assert.rejects(loadSettings(await cleanEnv()), (error: Error) => {
      assert.doesNotMatch(error.message, /config\.json/);
      return true;
    });
  });

  it("trims the token, since a pasted value often carries a newline", async () => {
    const settings = await loadSettings(await cleanEnv({ PR_IMAGE_BLOB_TOKEN: "sbx-cs-abc123\n" }));

    assert.equal(settings.token, "sbx-cs-abc123");
  });
});
