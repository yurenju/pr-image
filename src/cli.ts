#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";

import { detectImageType } from "./image.ts";
import { formatImage, type HostedImage } from "./output.ts";
import { newPathname } from "./pathname.ts";
import { loadSettings } from "./settings.ts";
import { upload } from "./uploader.ts";
import { VERSION } from "./version.ts";

const USAGE = `pr-image ${VERSION} — host an image for a pull request

Usage:
  pr-image upload [--markdown] <file>...   Upload images and print their URLs
  pr-image upload -                        Upload an image read from stdin

Options:
  -m, --markdown   Print ![alt](url) instead of a bare URL
  -h, --help       Show this message
  -v, --version    Show the version

Environment:
  PR_IMAGE_BLOB_TOKEN   Read-write token of the Vercel Blob store

Images are kept for good; nothing here ever deletes one.
`;

const STDIN = "-";
/**
 * Blobs are never deleted, and the Hobby plan's free storage is 1 GB, so one
 * upload must not be able to take a large bite of it. Screenshots sit far
 * below this.
 */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

async function readSource(path: string): Promise<Uint8Array> {
  if (path !== STDIN) return readFile(path);

  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks);
}

async function uploadAll(paths: string[], markdown: boolean): Promise<void> {
  // Settings first: a missing token should be reported before any file is read.
  const settings = await loadSettings();

  const sources = await Promise.all(
    paths.map(async (path) => {
      const body = await readSource(path);

      if (body.byteLength > MAX_FILE_SIZE_BYTES) {
        const limitMb = (MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0);
        throw new Error(`${sourceLabel(path)} is larger than the ${limitMb} MB limit.`);
      }

      const type = detectImageType(body);
      if (type === undefined) {
        throw new Error(
          `${sourceLabel(path)} is not an image this tool accepts. ` +
            `PNG, JPEG, GIF, WebP and AVIF are supported; SVG deliberately is not.`,
        );
      }

      return { path, body, type };
    }),
  );

  for (const { path, body, type } of sources) {
    const publicUrl = await upload({
      token: settings.token,
      pathname: newPathname(type.extension),
      body,
      contentType: type.contentType,
    });

    const image: HostedImage =
      path === STDIN ? { publicUrl } : { publicUrl, sourceName: basename(path) };

    // Print the moment an upload lands. Holding the lines to the end would
    // mean a later failure loses the URLs of blobs already in the store —
    // and nothing here deletes them, so they would sit there unreachable
    // for good.
    process.stdout.write(`${formatImage(image, { markdown })}\n`);
  }
}

const sourceLabel = (path: string) => (path === STDIN ? "the image on stdin" : path);

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      markdown: { type: "boolean", short: "m", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: true,
  });

  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const [command, ...rest] = positionals;

  if (values.help || command === undefined) {
    process.stdout.write(USAGE);
    return command === undefined && !values.help ? 1 : 0;
  }

  switch (command) {
    case "upload": {
      if (rest.length === 0) {
        throw new Error("upload needs at least one file, or - to read from stdin.");
      }
      if (rest.filter((path) => path === STDIN).length > 1) {
        throw new Error("stdin can only be read once.");
      }
      await uploadAll(rest, values.markdown);
      return 0;
    }

    default:
      throw new Error(`Unknown command ${JSON.stringify(command)}. Try pr-image --help.`);
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
