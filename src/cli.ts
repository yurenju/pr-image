#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";

import { loadConfig } from "./config.ts";
import { onePasswordCredentials } from "./credentials.ts";
import { detectImageType } from "./image.ts";
import { init } from "./init.ts";
import { newKey } from "./key.ts";
import { formatImage, type HostedImage } from "./output.ts";
import { upload } from "./uploader.ts";
import { VERSION } from "./version.ts";

const USAGE = `pr-image ${VERSION} — host an image for a pull request

Usage:
  pr-image upload [--markdown] <file>...   Upload images and print their URLs
  pr-image upload -                        Upload an image read from stdin
  pr-image init                            Create the per-machine config file

Options:
  -m, --markdown   Print ![alt](url) instead of a bare URL
  -h, --help       Show this message
  -v, --version    Show the version

Images are deleted automatically once they reach the bucket's expiry age.
`;

const STDIN = "-";

async function readSource(path: string): Promise<Uint8Array> {
  if (path !== STDIN) return readFile(path);

  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks);
}

async function uploadAll(paths: string[], markdown: boolean): Promise<void> {
  const config = await loadConfig();

  const sources = await Promise.all(
    paths.map(async (path) => {
      const body = await readSource(path);

      if (body.byteLength > config.maxFileSizeBytes) {
        const limitMb = (config.maxFileSizeBytes / 1024 / 1024).toFixed(0);
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

  // Resolving credentials costs a round trip to 1Password, so it happens once
  // for the whole run — and only after every source has been found readable.
  const credentials = await onePasswordCredentials(config);

  for (const { path, body, type } of sources) {
    const publicUrl = await upload({
      config,
      credentials,
      key: newKey(type.extension),
      body,
      contentType: type.contentType,
    });

    const image: HostedImage =
      path === STDIN ? { publicUrl } : { publicUrl, sourceName: basename(path) };

    // Print the moment an upload lands. Holding the lines to the end would
    // mean a later failure loses the URLs of objects already in the bucket —
    // and nothing here can delete them, so they would sit there unreachable
    // until they expire.
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
    case "init":
      await init();
      return 0;

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
