import { readFileSync } from "node:fs";

/**
 * Read from package.json so a release cannot leave the two disagreeing.
 * Both src/version.ts and dist/version.js sit one directory below it.
 */
const manifest = new URL("../package.json", import.meta.url);

export const VERSION = (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
