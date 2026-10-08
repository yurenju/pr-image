# pr-image

Upload an image to Vercel Blob and print a URL you can paste into a pull request. The image stays for as long as the discussion it was posted in — nothing here ever deletes it.

```console
$ pr-image upload login-screen.png
https://abc123.public.blob.vercel-storage.com/xK3f9c2a1b8e4d7Q0pRsTu.png

$ pr-image upload --markdown before.png after.png
![before](https://abc123.public.blob.vercel-storage.com/aB1cD2eF3gH4iJ5kL6mN7o.png)
![after](https://abc123.public.blob.vercel-storage.com/pQ8rS9tU0vW1xY2zA3bC4d.png)
```

The only thing it needs is one environment variable holding the store's token, so it runs unchanged inside a [Docker Sandbox](https://docs.docker.com/ai/sandboxes/), where the sandbox's proxy supplies the real token and the agent never sees it. See [ADR-0003](docs/adr/0003-vercel-blob-and-permanent-images.md) for why the store is Vercel Blob.

## Requirements

- **Node.js 24 or newer.**
- **A Vercel account.** The free Hobby plan is enough, but it is for **non-commercial use only** — screenshots for pull requests at work need a Pro plan.

## Know the free plan's limits first

The Hobby plan includes 1 GB of Blob storage and 2,000 uploads a month. Because images are never deleted, storage only grows. When an allowance runs out, Vercel blocks the whole store for 30 days — and that very likely includes reads, so **every image in every pull request stops loading**, not just new uploads. The tool cannot see usage, so it cannot warn you beforehand.

Each image is capped at 5 MB to keep any one upload from taking a large bite; ordinary screenshots are far smaller. To make room, delete old blobs from the store's page in the Vercel dashboard.

## One-time setup

Done once by hand, not by this tool.

1. In the Vercel dashboard, open **Storage** and create a **Blob** store for these images alone.
2. Choose **Public** access. It cannot be changed after the store is created, and a private store's images will not load in a pull request: every read of a private blob needs a token, which GitHub's image proxy does not have.
3. Copy the store's read-write token — Vercel shows it as `BLOB_READ_WRITE_TOKEN`. It is scoped to this one store but can read, write and delete everything in it, so treat it as a secret.

## Per-machine setup

```bash
npm install -g @yurenju/pr-image
```

The install puts a `pr-image` command in npm's global bin directory — run `npm prefix -g` to find where that is, and make sure it is on your `PATH`. Later, `npm install -g @yurenju/pr-image@latest` upgrades it and `npm uninstall -g @yurenju/pr-image` removes it.

Then give it the token through `PR_IMAGE_BLOB_TOKEN`.

### Inside a Docker Sandbox

Store the token on the host as a custom secret for `vercel.com`, the only host the tool talks to:

```bash
sbx secret set-custom --host vercel.com --env PR_IMAGE_BLOB_TOKEN --value '<token>'
```

Inside the sandbox, `PR_IMAGE_BLOB_TOKEN` then holds a placeholder, and the host's proxy swaps in the real token as the upload leaves. `--value` leaves the token in your shell history; `sbx secret set-custom` also takes `--ref` (a 1Password reference) or `--command` to fetch it at request time instead. Custom secrets are still marked experimental in sbx — see Docker's [credentials guide](https://docs.docker.com/ai/sandboxes/security/credentials/).

The variable is not named `BLOB_READ_WRITE_TOKEN` on purpose. That is the name Vercel's own tooling reads, so an agent working on an app that uses Vercel Blob would share one variable between that app's store and this one, and screenshots would land in the wrong store without an error.

### Anywhere else

Set the variable however you set secrets in your shell — for example `op run` with a 1Password reference, or an `export` in a file only you can read.

### Upgrading from 0.1

0.2 drops Cloudflare R2, 1Password and the config file. `~/.config/pr-image/config.json` is no longer read and can be deleted; images already uploaded to R2 expire on their own under the bucket's lifecycle rule, after which the bucket and its API token can be removed.

### Running from a clone

For working on the tool, not for using it:

```bash
git clone https://github.com/yurenju/pr-image.git
cd pr-image
npm install
npm link
```

`npm install` compiles `src/` into `dist/`, and `dist/cli.js` is what the command runs. Two consequences worth knowing:

- **The link points back at this clone.** Move or delete the directory and the command breaks. Keep it somewhere permanent.
- **`git pull` alone does not upgrade the command.** Run `npm install` again afterwards to rebuild `dist/`.

To remove it later, run `npm unlink -g @yurenju/pr-image`.

## Usage

```
pr-image upload [--markdown] <file>...   Upload images and print their URLs
pr-image upload -                        Upload an image read from stdin
```

Output is the URL and nothing else, so `url=$(pr-image upload shot.png)` works and an agent reading stdout has nothing to parse. `--markdown` prints `![alt](url)` instead, using the source file's name as alt text.

Format is decided by the file's leading bytes, not its extension. PNG, JPEG, GIF, WebP and AVIF are accepted. **SVG is refused on purpose**: it can carry script, how the store serves an uploaded SVG has never been tried, and a screenshot never needs to be one.

## What it does not do

It does not delete images, list them, post them to a pull request, resize or recompress them, or touch your clipboard. Pathnames are random and encode nothing — no repository name, no date, no original file name — so the store is not browsable and a URL reveals nothing. See [ADR-0002](docs/adr/0002-keys-are-random-and-meaningless.md).

A URL is the only thing protecting an image. Anyone holding it can view the image for as long as it exists, so anything genuinely sensitive does not belong here.

## Development

```bash
npm test        # unit tests, no network and no credentials needed
npm run typecheck
```

Design notes live in [CONTEXT.md](CONTEXT.md) and [docs/adr/](docs/adr/). A Traditional Chinese version of this file is at [README.zh-TW.md](README.zh-TW.md).

## Licence

MIT
