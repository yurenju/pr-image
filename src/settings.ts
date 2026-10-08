import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const TOKEN_ENV = "PR_IMAGE_BLOB_TOKEN";

export interface Settings {
  /** Read-write token of the one store; inside a Docker Sandbox, a placeholder. */
  token: string;
}

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

/**
 * Everything the tool needs comes from the environment, so that a Docker
 * Sandbox can supply it with nothing more than `sbx secret set-custom`.
 *
 * The token is deliberately not BLOB_READ_WRITE_TOKEN, the name Vercel's own
 * tooling reads: an agent working on an app that uses Vercel Blob would then
 * share one variable between that app's store and this one, and screenshots
 * would land in the wrong store without a single error.
 */
export async function loadSettings(env: NodeJS.ProcessEnv = process.env): Promise<Settings> {
  const token = env[TOKEN_ENV]?.trim() ?? "";
  if (token === "") {
    throw new SettingsError(
      `${TOKEN_ENV} is not set. Set it to the read-write token of your Vercel Blob store.` +
        (await oldConfigNotice(env)),
    );
  }
  return { token };
}

/**
 * Versions before 0.2.0 read R2 settings from a config file. Nothing in it
 * carries over, but a developer who upgraded will go looking there first.
 */
async function oldConfigNotice(env: NodeJS.ProcessEnv): Promise<string> {
  const base = env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
  const path = join(base, "pr-image", "config.json");

  const found = await access(path, constants.F_OK).then(
    () => true,
    () => false,
  );
  return found
    ? `\n${path} is from an earlier version and is no longer read; it can be deleted.`
    : "";
}
