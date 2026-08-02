import { constants } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

import { configPath, parseConfig, toConfigFile } from "./config.ts";

const DEFAULT_TOKEN_FILE = join(homedir(), ".config", "op", "service-account-token");

/**
 * Walk the developer through the per-machine half of the setup.
 *
 * Everything on the Cloudflare and 1Password side is done once by hand and
 * documented in the README. What repeats on every new machine is this file
 * and a token, so this is all `init` covers.
 */
export async function init(): Promise<void> {
  const path = configPath();

  if (await exists(path)) {
    throw new Error(`${path} already exists. Edit it directly, or delete it and run init again.`);
  }

  const rl = createInterface({ input: process.stdin });
  // Pulling lines off the async iterator rather than using
  // readline/promises' question(): that one only ever resolves once when
  // stdin is a pipe, so answers fed from a script would hang after the first.
  // Prompts go to stderr so a piped run's output stays clean.
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string): Promise<string> => {
    process.stderr.write(prompt);
    const { value, done } = await lines.next();
    if (done === true) throw new Error("Input ended before every question was answered.");
    return (value as string).trim();
  };

  try {
    const accountId = await ask("Cloudflare account id: ");
    const bucket = await ask("R2 bucket name: ");
    const publicBaseUrl = await ask("Public base URL (e.g. https://img.example.com): ");
    const tokenFile =
      (await ask(`1Password service account token file [${DEFAULT_TOKEN_FILE}]: `)) ||
      DEFAULT_TOKEN_FILE;
    const item = await ask("1Password secret reference prefix (op://<vault>/<item>): ");
    const prefix = item.trim().replace(/\/+$/, "");

    const config = parseConfig({
      accountId,
      bucket,
      publicBaseUrl,
      tokenFile,
      secretReferences: {
        accessKeyId: `${prefix}/access-key-id`,
        secretAccessKey: `${prefix}/secret-access-key`,
      },
    });

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, toConfigFile(config), { mode: 0o600 });

    process.stderr.write(`\nWrote ${path}\n`);
    await warnAboutToken(config.tokenFile);
  } finally {
    rl.close();
  }
}

const exists = (path: string) =>
  access(path, constants.F_OK).then(
    () => true,
    () => false,
  );

/**
 * Check the token file without ever reading it — its contents are the secret,
 * and nothing here needs them.
 */
async function warnAboutToken(path: string): Promise<void> {
  let mode: number;
  try {
    mode = (await stat(path)).mode;
  } catch {
    process.stderr.write(
      `\nWarning: no token file at ${path} yet.\n` +
        `Create it with your 1Password service account token, then: chmod 600 ${path}\n`,
    );
    return;
  }

  if ((mode & 0o077) !== 0) {
    process.stderr.write(
      `\nWarning: ${path} is readable by other users. Fix it with: chmod 600 ${path}\n`,
    );
  }
}
