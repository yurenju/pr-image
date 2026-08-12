# pr-image

Upload an image to Cloudflare R2 and print a URL you can paste into a pull request. The image deletes itself 30 days later, because nobody goes looking for it once the PR is closed.

```console
$ pr-image upload login-screen.png
https://img.example.com/xK3f9c2a1b8e4d7Q0pRsTu.png

$ pr-image upload --markdown before.png after.png
![before](https://img.example.com/aB1cD2eF3gH4iJ5kL6mN7o.png)
![after](https://img.example.com/pQ8rS9tU0vW1xY2zA3bC4d.png)
```

Nothing runs in the background and nothing is scheduled. Expiry is a lifecycle rule on the bucket, so Cloudflare does the deleting. At the volumes one developer produces this sits comfortably inside R2's free tier — the free allowance is 10 GB of storage, 1 million writes and 10 million reads per month, and egress is free.

## Requirements

- **Node.js 24 or newer.**
- **A Cloudflare account with R2**, and a domain on Cloudflare to serve the bucket from.
- **A 1Password service account.** Note that service accounts are not available on every 1Password plan — check that you can create one before going further, because the R2 credentials are read through it and there is no fallback.

## One-time setup

Done once by hand, not by this tool.

### Cloudflare

1. Create an R2 bucket. Leave **Location** on Automatic, and keep the default storage class of **Standard** — the free tier does not cover Infrequent Access, despite its "accessed less than once a month" description fitting these images well.
2. In the bucket's **Settings → Object lifecycle rules**, add a rule whose only action is **Delete uploaded objects after 30 days**. Leave the prefix empty so it covers the whole bucket — keys here are random and share no prefix to match on. Do not tick the transition to Infrequent Access: that storage class is outside the free tier and each transition costs a write operation.

   Nothing in this tool deletes anything; if you skip this step, storage grows until it costs money and you will not be warned. See [ADR-0001](docs/adr/0001-expiry-is-a-bucket-lifecycle-rule.md).
3. Connect a **custom domain** to the bucket, so images are served from a host you control.
4. Create an **R2 API token** from **R2 object storage → Account Details → API Tokens → Manage**. This is not the same thing as a Cloudflare API token made under My Profile — only the R2 flow issues the access key id and secret access key pair that S3 request signing needs.

   Give it **Object Read & Write** and scope it to the `pr-image` bucket alone. Of the four permission levels, only the two `Object` ones can be scoped to specific buckets; both `Admin` levels are account-wide. The secret access key is shown once and never again, so have the 1Password item open before you create it.

### 1Password

1. Create a vault of your own for this — a service account cannot be granted access to the built-in Personal, Private or Employee vault, nor to the default Shared vault, so the item cannot live in any of those.
2. In that vault, create an item holding the R2 token, with a field named `access-key-id` and a field named `secret-access-key`.
3. Create a **service account** and grant it read access to that vault. If you create it with 1Password CLI, note that `--expires-in` sets a lifetime on the token — pick deliberately, because an expired token means uploads start failing.
4. Save the service account token to a file of its own and lock it down:

   ```bash
   chmod 600 ~/.config/op/service-account-token
   ```

## Per-machine setup

Repeat this on each machine you want to upload from.

```bash
npm install -g @yurenju/pr-image
pr-image init
```

The install puts a `pr-image` command in npm's global bin directory — run `npm prefix -g` to find where that is, and make sure it is on your `PATH`.

Later, `npm install -g @yurenju/pr-image@latest` upgrades it and `npm uninstall -g @yurenju/pr-image` removes it.

To run it from a clone instead — for working on the tool, not for using it:

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

`init` asks for the account id, bucket, public URL, token file path and 1Password item, then writes `~/.config/pr-image/config.json`:

```json
{
  "accountId": "0123456789abcdef0123456789abcdef",
  "bucket": "pr-images",
  "publicBaseUrl": "https://img.example.com",
  "tokenFile": "/home/you/.config/op/service-account-token",
  "secretReferences": {
    "accessKeyId": "pr-image r2/access-key-id",
    "secretAccessKey": "pr-image r2/secret-access-key"
  }
}
```

The file holds no secrets — only the path to the token and references to 1Password. An optional `maxFileSizeMb` overrides the 10 MB default.

### Which vault the references point at

A secret reference is written either in full, `op://<vault>/<item>/<field>`, or short, `<item>/<field>` as above. Both are accepted. The short form leaves the vault to be supplied from outside the file, and it is looked for in this order:

1. the `PR_IMAGE_VAULT` environment variable;
2. failing that, a top-level `vault` field in the config file, for a machine whose environment nobody sets up;
3. failing that, nothing runs.

There is no default vault, deliberately. A guessed vault can resolve, and then the upload is signed with credentials nobody chose — worse than stopping. When a short reference has no vault to complete it, the error names `PR_IMAGE_VAULT` and the `vault` field, because the thing that needs fixing is this file or the shell, never 1Password.

The short form exists because one config file is often shared across machines, while each machine reads from a vault of its own — so that a lost machine's credentials can be revoked without disturbing the others. The file's coordinate is the setup it describes; the vault's coordinate is machine × setup. That extra dimension is the one thing this file cannot carry.

`init` asks for the item as `op://<vault>/<item>`, so the file it writes names the vault in full. Shorten the references by hand on the day that file starts being shared.

## Usage

```
pr-image upload [--markdown] <file>...   Upload images and print their URLs
pr-image upload -                        Upload an image read from stdin
pr-image init                            Create the per-machine config file
```

Output is the URL and nothing else, so `url=$(pr-image upload shot.png)` works and an agent reading stdout has nothing to parse. `--markdown` prints `![alt](url)` instead, using the source file's name as alt text.

Format is decided by the file's leading bytes, not its extension. PNG, JPEG, GIF, WebP and AVIF are accepted. **SVG is refused on purpose**: it can carry script, and these images are served from a domain of your own, so that script would run on your origin.

## What it does not do

It does not delete images, list them, post them to a pull request, resize or recompress them, or touch your clipboard. Keys are random and encode nothing — no repository name, no date, no original file name — so the bucket is not browsable and a URL reveals nothing. See [ADR-0002](docs/adr/0002-keys-are-random-and-meaningless.md).

A URL is the only thing protecting an image. Anyone holding it can view the image until it expires, so anything genuinely sensitive does not belong here.

## Development

```bash
npm test        # unit tests, no network and no credentials needed
npm run typecheck
```

Design notes live in [CONTEXT.md](CONTEXT.md) and [docs/adr/](docs/adr/). A Traditional Chinese version of this file is at [README.zh-TW.md](README.zh-TW.md).

## Licence

MIT
