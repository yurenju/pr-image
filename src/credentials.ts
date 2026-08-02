import { readFile } from "node:fs/promises";

import { createClient } from "@1password/sdk";

import type { Config } from "./config.ts";
import { VERSION } from "./version.ts";

export interface R2Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

async function readServiceAccountToken(path: string): Promise<string> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    throw new CredentialError(
      `Cannot read the 1Password service account token at ${path}.\n` +
        `Check the tokenFile path in your configuration, and that the file is readable.`,
    );
  }

  const token = contents.trim();
  if (token === "") throw new CredentialError(`The token file at ${path} is empty.`);
  return token;
}

/**
 * Resolve the R2 access key pair through a 1Password service account.
 *
 * Both references are resolved in one call so the developer is asked to
 * unlock nothing twice, and so a failure can name the reference that broke.
 */
export async function onePasswordCredentials(config: Config): Promise<R2Credentials> {
  const token = await readServiceAccountToken(config.tokenFile);

  const client = await createClient({
    auth: token,
    integrationName: "pr-image",
    integrationVersion: VERSION,
  });

  const wanted = {
    accessKeyId: config.secretReferences.accessKeyId,
    secretAccessKey: config.secretReferences.secretAccessKey,
  };

  const { individualResponses } = await client.secrets.resolveAll(Object.values(wanted));

  const resolved: Partial<R2Credentials> = {};
  for (const [field, reference] of Object.entries(wanted) as [keyof R2Credentials, string][]) {
    const response = individualResponses[reference];
    if (response?.content === undefined) {
      throw new CredentialError(
        `1Password could not resolve secretReferences.${field} (${reference}).\n` +
          `Confirm the service account has been granted access to that vault.`,
      );
    }
    resolved[field] = response.content.secret;
  }

  return resolved as R2Credentials;
}
