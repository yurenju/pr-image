import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { upload } from "../src/uploader.ts";

const TOKEN = "sbx-cs-placeholder123";
const PUBLIC_URL = "https://abc123.public.blob.vercel-storage.com/xK3f9c2a1b8e4d7Q0pRsTu.png";

interface Sent {
  url: string;
  init: RequestInit;
}

/** A fetch that records what it was asked to send and answers with `response`. */
function fakeFetch(response: () => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    sent.push({ url: String(url), init });
    return response();
  };
  return { fetch: fetch as typeof globalThis.fetch, sent };
}

const ok = () =>
  Response.json({
    url: PUBLIC_URL,
    downloadUrl: `${PUBLIC_URL}?download=1`,
    pathname: "xK3f9c2a1b8e4d7Q0pRsTu.png",
    contentType: "image/png",
    contentDisposition: 'inline; filename="xK3f9c2a1b8e4d7Q0pRsTu.png"',
    etag: '"abc"',
  });

const request = {
  token: TOKEN,
  pathname: "xK3f9c2a1b8e4d7Q0pRsTu.png",
  body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  contentType: "image/png",
};

const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

describe("upload", () => {
  it("returns the public URL the store reports", async () => {
    const { fetch } = fakeFetch(ok);

    assert.equal(await upload(request, fetch), PUBLIC_URL);
  });

  it("puts the blob to Vercel's API under the given pathname, as a public blob", async () => {
    const { fetch, sent } = fakeFetch(ok);

    await upload(request, fetch);

    assert.equal(sent.length, 1);
    const { url, init } = sent[0]!;
    assert.equal(url, "https://vercel.com/api/blob/?pathname=xK3f9c2a1b8e4d7Q0pRsTu.png");
    assert.equal(init.method, "PUT");
    assert.equal(init.body, request.body);
    assert.equal(header(init, "authorization"), `Bearer ${TOKEN}`);
    assert.equal(header(init, "x-vercel-blob-access"), "public");
    assert.equal(header(init, "x-content-type"), "image/png");
  });

  it("neither renames the pathname nor replaces a blob already there", async () => {
    const { fetch, sent } = fakeFetch(ok);

    await upload(request, fetch);

    // The pathname is already random; a suffix would only lengthen the URL,
    // and an overwrite would silently swap the image in someone else's PR.
    assert.equal(header(sent[0]!.init, "x-add-random-suffix"), "0");
    assert.equal(header(sent[0]!.init, "x-allow-overwrite"), "0");
  });

  it("lets the blob be cached for a year, since a pathname never changes content", async () => {
    const { fetch, sent } = fakeFetch(ok);

    await upload(request, fetch);

    assert.equal(header(sent[0]!.init, "x-cache-control-max-age"), "31536000");
  });

  it("sends the token nowhere but the Authorization header", async () => {
    // Inside a Docker Sandbox the token is a placeholder the host's proxy
    // swaps on the way out. Anything derived from it locally — the way the
    // @vercel/blob SDK splits out a store id — would carry the placeholder.
    const token = "vercel_blob_rw_storeId123_secretpart";
    const { fetch, sent } = fakeFetch(ok);

    await upload({ ...request, token }, fetch);

    const { url, init } = sent[0]!;
    const elsewhere = [
      url,
      ...[...new Headers(init.headers)].filter(([name]) => name !== "authorization").flat(),
    ];
    for (const fragment of [token, "storeId123", "secretpart"]) {
      assert.ok(!elsewhere.some((value) => value.includes(fragment)), `${fragment} leaked`);
    }
  });

  it("points at the Hobby plan's limits when the store is suspended", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json(
        { error: { code: "store_suspended", message: "This store has been suspended." } },
        { status: 403 },
      ),
    );

    await assert.rejects(upload(request, fetch), (error: Error) => {
      assert.equal(error.name, "UploadError");
      assert.match(error.message, /This store has been suspended\./);
      assert.match(error.message, /Hobby/);
      assert.match(error.message, /30 days/);
      return true;
    });
  });

  it("suspects the token as well as the plan's limits when access is forbidden", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json({ error: { code: "forbidden", message: "Access denied." } }, { status: 403 }),
    );

    await assert.rejects(upload(request, fetch), (error: Error) => {
      assert.match(error.message, /Access denied\./);
      assert.match(error.message, /PR_IMAGE_BLOB_TOKEN/);
      assert.match(error.message, /Hobby/);
      return true;
    });
  });

  it("does not blame the plan's limits for an unrelated refusal", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json(
        { error: { code: "file_too_large", message: "File is too large." } },
        { status: 400 },
      ),
    );

    await assert.rejects(upload(request, fetch), (error: Error) => {
      assert.match(error.message, /File is too large\./);
      assert.doesNotMatch(error.message, /Hobby/);
      return true;
    });
  });

  it("reports the status when the refusal is not Vercel's JSON", async () => {
    // A sandbox proxy blocking the host, or a gateway error page.
    const { fetch } = fakeFetch(
      () => new Response("blocked by network policy", { status: 403, statusText: "Forbidden" }),
    );

    await assert.rejects(upload(request, fetch), (error: Error) => {
      assert.equal(error.name, "UploadError");
      assert.match(error.message, /403 Forbidden/);
      assert.match(error.message, /blocked by network policy/);
      return true;
    });
  });

  it("says where it could not reach when the network fails", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });

    await assert.rejects(upload(request, fetch), (error: Error) => {
      assert.equal(error.name, "UploadError");
      assert.match(error.message, /vercel\.com/);
      assert.match(error.message, /fetch failed/);
      return true;
    });
  });

  it("refuses to print a URL when a success carries none", async () => {
    const { fetch } = fakeFetch(() => Response.json({ pathname: "x.png" }));

    await assert.rejects(upload(request, fetch), (error: Error) => {
      assert.equal(error.name, "UploadError");
      assert.match(error.message, /no public URL/);
      return true;
    });
  });

  it("reports a success whose body is not JSON as an upload error", async () => {
    const { fetch } = fakeFetch(() => new Response("<html>ok</html>", { status: 200 }));

    await assert.rejects(upload(request, fetch), (error: Error) => {
      assert.equal(error.name, "UploadError");
      assert.match(error.message, /no public URL/);
      assert.match(error.message, /<html>ok<\/html>/);
      return true;
    });
  });

  it("pins the API version it was written against", async () => {
    const { fetch, sent } = fakeFetch(ok);

    await upload(request, fetch);

    assert.equal(header(sent[0]!.init, "x-api-version"), "12");
  });
});
