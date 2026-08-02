import { basename, extname } from "node:path";

export interface HostedImage {
  publicUrl: string;
  /** Absent when the image arrived on stdin and so has no name. */
  sourceName?: string;
}

export interface OutputOptions {
  markdown: boolean;
}

const escapeAltText = (text: string) => text.replace(/[[\]\\]/g, "\\$&");

const altTextFor = (sourceName: string | undefined) =>
  sourceName === undefined ? "" : escapeAltText(basename(sourceName, extname(sourceName)));

/**
 * Render the one line a developer pastes for a single image.
 *
 * The default is the public URL and nothing else, so that `url=$(pr-image
 * upload shot.png)` works and an agent reading stdout has nothing to parse.
 * One image at a time, because the caller prints each line the moment its
 * upload lands rather than holding them all to the end.
 */
export function formatImage({ publicUrl, sourceName }: HostedImage, options: OutputOptions): string {
  return options.markdown ? `![${altTextFor(sourceName)}](${publicUrl})` : publicUrl;
}
