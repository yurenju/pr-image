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
/** `op://<vault>/<item>/<field>`, with room for a section between the last two. */
const FULL_REFERENCE = /^op:\/\/[^/]+\/[^/]+(\/[^/]+)+$/;
/** The same thing with the `op://<vault>/` prefix left off: `<item>/<field>`. */
const SHORT_REFERENCE = /^[^/]+\/[^/]+(\/[^/]+)*$/;
const VAULT_ENV = "PR_IMAGE_VAULT";

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

/**
 * Find the vault the short-form secret references live in.
 *
 * One config file is shared by every machine in a scope, but each machine
 * gets a vault of its own, so that one machine's credentials can be revoked
 * without disturbing the others. The file's coordinate is the scope; the
 * vault's coordinate is machine × scope. That extra dimension is the one
 * thing the file cannot say, so it comes from the environment first and the
 * file only as a fallback, for machines whose environment nobody sets up.
 *
 * There is deliberately no default. A guessed vault can resolve, and then the
 * upload is signed with credentials nobody chose.
 */
function resolveVault(
  source: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  problems: string[],
): string | undefined {
  const fromEnv = env[VAULT_ENV]?.trim() ?? "";
  if (fromEnv !== "") {
    if (fromEnv.includes("/")) {
      problems.push(
        `${VAULT_ENV} is a vault name, so it cannot contain a / ` +
          `(got ${JSON.stringify(fromEnv)})`,
      );
      return undefined;
    }
    return fromEnv;
  }

  const fromFile = source["vault"];
  if (fromFile === undefined) return undefined;
  if (typeof fromFile !== "string" || fromFile.trim() === "" || fromFile.includes("/")) {
    problems.push("vault is not a vault name (expected a non-empty string without a /)");
    return undefined;
  }
  return fromFile.trim();
}

/**
 * Expand one secret reference to the full `op://` form 1Password resolves.
 *
 * Both forms are accepted, and that is not a transitional courtesy: machines
 * are upgraded to this version before any config file is rewritten, so a
 * version that understood only the short form would break every machine still
 * carrying the old file the moment the first one was edited.
 */
function fullReference(
  field: string,
  value: unknown,
  vault: string | undefined,
  problems: string[],
): string {
  if (typeof value !== "string" || value.trim() === "") {
    problems.push(`secretReferences.${field} is missing, or is not a non-empty string`);
    return "";
  }

  // Anything wearing a scheme is a full reference that got mistyped. Falling
  // through to the short form would turn `op:/vault/item/field` into an item
  // literally called `op:`, and 1Password would report that as a missing item.
  if (value.startsWith("op:") || value.includes("://")) {
    if (!FULL_REFERENCE.test(value)) {
      problems.push(
        `secretReferences.${field} is not a 1Password secret reference ` +
          `(expected op://<vault>/<item>/<field>, got ${JSON.stringify(value)})`,
      );
      return "";
    }
    return value;
  }

  if (!SHORT_REFERENCE.test(value)) {
    problems.push(
      `secretReferences.${field} is neither a 1Password secret reference ` +
        `(op://<vault>/<item>/<field>) nor the short form <item>/<field> ` +
        `(got ${JSON.stringify(value)})`,
    );
    return "";
  }

  if (vault === undefined) {
    problems.push(
      `secretReferences.${field} uses the short form ${JSON.stringify(value)}, but no vault ` +
        `is available: the ${VAULT_ENV} environment variable is not set, and the ` +
        `configuration has no "vault" field`,
    );
    return "";
  }

  return `op://${vault}/${value}`;
}

export function configPath(): string {
  const base = process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
  return join(base, "pr-image", "config.json");
}

/**
 * Turn whatever is in the config file into a Config, or explain everything
 * that is wrong with it at once — a setup someone does by hand once per
 * machine should not have to be fixed one error at a time.
 *
 * The environment is read here rather than closer to 1Password because a
 * short secret reference with no vault to complete it is a broken
 * configuration, and belongs in the same list as every other one.
 */
export function parseConfig(raw: unknown, env: NodeJS.ProcessEnv = process.env): Config {
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

  const vault = resolveVault(source, env, problems);

  const references = source["secretReferences"];
  const secretReferences: SecretReferences = { accessKeyId: "", secretAccessKey: "" };
  if (typeof references !== "object" || references === null) {
    problems.push("secretReferences is missing");
  } else {
    for (const field of ["accessKeyId", "secretAccessKey"] as const) {
      const value = (references as Record<string, unknown>)[field];
      secretReferences[field] = fullReference(field, value, vault, problems);
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
 * carries maxFileSizeMb, or nothing and takes the default. Secret references
 * go out in their full op:// form, vault included, because by this point the
 * vault has been resolved and a file that names it needs nothing from the
 * environment.
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
