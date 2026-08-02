import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SecretReferences {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface Config {
  /** Cloudflare account the bucket belongs to; forms the S3 endpoint host. */
  accountId: string;
  bucket: string;
  /** Origin the bucket is served from, without a trailing slash. */
  publicBaseUrl: string;
  /** Path to the file holding the 1Password service account token. */
  tokenFile: string;
  secretReferences: SecretReferences;
  maxFileSizeBytes: number;
}

const DEFAULT_MAX_FILE_SIZE_MB = 10;
const SECRET_REFERENCE = /^op:\/\/[^/]+\/[^/]+(\/[^/]+)+$/;

export class ConfigError extends Error {
  problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Configuration is not usable:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/**
 * An image is worthless unless GitHub's image proxy can fetch it, so a base
 * URL has to be more than merely parseable — file:// and op:// parse fine.
 */
function isFetchableOrigin(candidate: string): boolean {
  if (!URL.canParse(candidate)) return false;
  const { protocol } = new URL(candidate);
  return protocol === "https:" || protocol === "http:";
}

export function configPath(): string {
  const base = process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
  return join(base, "pr-image", "config.json");
}

/**
 * Turn whatever is in the config file into a Config, or explain everything
 * that is wrong with it at once — a setup someone does by hand once per
 * machine should not have to be fixed one error at a time.
 */
export function parseConfig(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(["the file does not contain a JSON object"]);
  }

  const source = raw as Record<string, unknown>;
  const problems: string[] = [];

  const text = (field: string): string => {
    const value = source[field];
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`${field} is missing, or is not a non-empty string`);
      return "";
    }
    return value;
  };

  const accountId = text("accountId");
  const bucket = text("bucket");
  const tokenFile = text("tokenFile");

  let publicBaseUrl = text("publicBaseUrl");
  if (publicBaseUrl !== "" && !isFetchableOrigin(publicBaseUrl)) {
    problems.push(
      `publicBaseUrl is not an http or https URL (got ${JSON.stringify(publicBaseUrl)})`,
    );
    publicBaseUrl = "";
  }
  publicBaseUrl = publicBaseUrl.replace(/\/+$/, "");

  const references = source["secretReferences"];
  const secretReferences: SecretReferences = { accessKeyId: "", secretAccessKey: "" };
  if (typeof references !== "object" || references === null) {
    problems.push("secretReferences is missing");
  } else {
    for (const field of ["accessKeyId", "secretAccessKey"] as const) {
      const value = (references as Record<string, unknown>)[field];
      if (typeof value !== "string" || !SECRET_REFERENCE.test(value)) {
        problems.push(
          `secretReferences.${field} is not a 1Password secret reference ` +
            `(expected op://<vault>/<item>/<field>)`,
        );
        continue;
      }
      secretReferences[field] = value;
    }
  }

  const limit = source["maxFileSizeMb"] ?? DEFAULT_MAX_FILE_SIZE_MB;
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    problems.push("maxFileSizeMb is not a positive number");
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    accountId,
    bucket,
    publicBaseUrl,
    tokenFile,
    secretReferences,
    maxFileSizeBytes: (limit as number) * 1024 * 1024,
  };
}

/**
 * Serialise a Config back to the file format.
 *
 * It lives here beside parseConfig so that the two halves of the file format
 * cannot drift apart — a new setting is added in one module, not three.
 * Derived values such as maxFileSizeBytes are not written back; the file
 * carries maxFileSizeMb, or nothing and takes the default.
 */
export function toConfigFile(config: Config): string {
  const written = {
    accountId: config.accountId,
    bucket: config.bucket,
    publicBaseUrl: config.publicBaseUrl,
    tokenFile: config.tokenFile,
    secretReferences: config.secretReferences,
    ...(config.maxFileSizeBytes === DEFAULT_MAX_FILE_SIZE_MB * 1024 * 1024
      ? {}
      : { maxFileSizeMb: config.maxFileSizeBytes / 1024 / 1024 }),
  };

  return `${JSON.stringify(written, null, 2)}\n`;
}

export async function loadConfig(path = configPath()): Promise<Config> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    throw new ConfigError([`no configuration at ${path} — run \`pr-image init\` to create one`]);
  }

  try {
    return parseConfig(JSON.parse(contents));
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError([`${path} is not valid JSON`]);
  }
}
