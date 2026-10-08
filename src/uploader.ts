const API_URL = "https://vercel.com/api/blob/";
/** The version @vercel/blob 2.8 speaks; the request below was written against it. */
const API_VERSION = "12";
/** A pathname is random and never overwritten, so its content never changes. */
const ONE_YEAR_SECONDS = String(365 * 24 * 60 * 60);

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export interface UploadRequest {
  /** Read-write token of the store; inside a Docker Sandbox, a placeholder. */
  token: string;
  pathname: string;
  body: Uint8Array;
  contentType: string;
}

/**
 * Put one blob into the store and return the URL it is served from.
 *
 * This is a bare request rather than the @vercel/blob SDK because the SDK
 * splits the token apart locally to find the store id. Inside a Docker
 * Sandbox the token is a placeholder that the host's proxy swaps for the real
 * one on the way out, so nothing may be derived from it here — it travels in
 * the Authorization header, untouched, and the store answers with the URL.
 */
export async function upload(
  { token, pathname, body, contentType }: UploadRequest,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}?${new URLSearchParams({ pathname })}`, {
      method: "PUT",
      body,
      headers: {
        authorization: `Bearer ${token}`,
        "x-api-version": API_VERSION,
        "x-vercel-blob-access": "public",
        "x-content-type": contentType,
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "0",
        "x-cache-control-max-age": ONE_YEAR_SECONDS,
      },
    });
  } catch (cause) {
    throw new UploadError(`Could not reach Vercel Blob at ${API_URL}: ${(cause as Error).message}`);
  }

  if (!response.ok) {
    const text = (await response.text().catch(() => "")).trim();
    const error = parseError(text);
    if (error === undefined) {
      throw new UploadError(
        `The upload was refused with ${response.status} ${response.statusText}.` +
          (text === "" ? "" : `\n${text}`),
      );
    }
    throw new UploadError(`Vercel Blob refused the upload: ${error.message}${hint(error.code)}`);
  }

  const { url } = (await response.json()) as { url: string };
  return url;
}

/**
 * Blobs are never deleted, so the store only grows, and the Hobby plan's
 * answer to a full allowance is to block the store for 30 days — old images
 * in every pull request included. The tool cannot see usage coming, so the
 * least it can do is say so when the refusal arrives.
 */
const LIMITS =
  "\nOn the Hobby plan this can mean the store has used up its free allowance. " +
  "Vercel then blocks the store for 30 days; deleting old blobs from the dashboard " +
  "frees space for the next period.";

function hint(code: string): string {
  switch (code) {
    case "store_suspended":
      return LIMITS;
    case "forbidden":
      return `\nCheck that PR_IMAGE_BLOB_TOKEN is the read-write token of the store.${LIMITS}`;
    default:
      return "";
  }
}

interface BlobError {
  code: string;
  message: string;
}

/**
 * Vercel answers with `{ error: { code, message } }`, but a refusal can also
 * come from something in between — the sandbox's proxy, a gateway — in
 * whatever shape that thing likes.
 */
function parseError(text: string): BlobError | undefined {
  try {
    const { error } = JSON.parse(text) as { error?: Partial<BlobError> };
    if (typeof error?.code === "string" && typeof error.message === "string") {
      return { code: error.code, message: error.message };
    }
  } catch {
    // Not JSON; the caller reports the raw text.
  }
  return undefined;
}
