import { AwsClient } from "aws4fetch";

import type { Config } from "./config.ts";
import type { R2Credentials } from "./credentials.ts";

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export interface UploadRequest {
  config: Config;
  credentials: R2Credentials;
  key: string;
  body: Uint8Array;
  contentType: string;
}

/**
 * Put one object into the bucket and return the URL it is served from.
 *
 * R2 speaks the S3 API with a fixed region of "auto"; the account id is part
 * of the host rather than a header, which is the detail most often got wrong.
 */
export async function upload({
  config,
  credentials,
  key,
  body,
  contentType,
}: UploadRequest): Promise<string> {
  const client = new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: "s3",
    region: "auto",
  });

  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;

  let response: Response;
  try {
    response = await client.fetch(endpoint, {
      method: "PUT",
      body,
      headers: { "content-type": contentType },
    });
  } catch (cause) {
    throw new UploadError(`Could not reach R2 at ${endpoint}: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).trim();
    throw new UploadError(
      `R2 refused the upload with ${response.status} ${response.statusText}.` +
        (response.status === 403
          ? `\nA 403 here usually means the accountId or bucket in your configuration ` +
            `does not match the API token, or the token lacks object write permission.`
          : "") +
        (detail === "" ? "" : `\n${detail}`),
    );
  }

  return `${config.publicBaseUrl}/${key}`;
}
