# pr-image

把圖片丟上 Vercel Blob，印出一個可以貼進 pull request 的網址。圖片會跟著它被貼進去的那段討論一起留下來——這個工具從不刪任何東西。

```console
$ pr-image upload login-screen.png
https://abc123.public.blob.vercel-storage.com/xK3f9c2a1b8e4d7Q0pRsTu.png

$ pr-image upload --markdown before.png after.png
![before](https://abc123.public.blob.vercel-storage.com/aB1cD2eF3gH4iJ5kL6mN7o.png)
![after](https://abc123.public.blob.vercel-storage.com/pQ8rS9tU0vW1xY2zA3bC4d.png)
```

它唯一需要的是一個放 store token 的環境變數，所以在 [Docker Sandbox](https://docs.docker.com/ai/sandboxes/) 裡不用改任何東西就能跑：真正的 token 由 sandbox 的 proxy 補上，agent 永遠看不到。為什麼選 Vercel Blob，見 [ADR-0003](docs/adr/0003-vercel-blob-and-permanent-images.md)。

## 需要什麼

- **Node.js 24 以上**。
- **一個 Vercel 帳號**。免費的 Hobby 方案就夠，但它**只限非商業用途**——工作上的 pull request 要用的話，得用 Pro 方案。

## 先搞清楚免費方案的上限

Hobby 方案包含 1 GB 的 Blob 儲存與每月 2,000 次上傳。圖片從不刪除，所以儲存量只會長。任何一項額度用完，Vercel 會把整個 store 停用 30 天——而且很可能連讀取一起停，也就是**所有 pull request 裡的圖都會一起載不出來**，不只是新的上傳失敗。工具看不到用量，沒辦法事先警告。

每張圖上限 5 MB，免得單一次上傳吃掉一大塊額度；一般截圖遠小於這個大小。要騰出空間，就到 Vercel 後台那個 store 的頁面刪掉舊的 blob。

## 一次性設定

這一段是人手動做的，工具不碰。

1. 在 Vercel 後台打開 **Storage**，建一個只放這些圖的 **Blob** store。
2. 存取方式選 **Public**。store 建好之後就不能改了，而 private store 的圖在 pull request 裡會載不出來：讀 private blob 每次都要 token，GitHub 的圖片 proxy 沒有。
3. 複製 store 的讀寫 token——Vercel 顯示的名稱是 `BLOB_READ_WRITE_TOKEN`。它只對這一個 store 有效，但能讀、寫、刪 store 裡的所有東西，請當成秘密保管。

## 每台機器的設定

```bash
npm install -g @yurenju/pr-image
```

安裝會在 npm 的全域 bin 目錄放一個 `pr-image` 指令，用 `npm prefix -g` 查那個目錄在哪，並確認它在你的 `PATH` 上。之後 `npm install -g @yurenju/pr-image@latest` 可以升級，`npm uninstall -g @yurenju/pr-image` 可以移除。

接著用 `PR_IMAGE_BLOB_TOKEN` 把 token 交給它。

### 在 Docker Sandbox 裡

在 host 上把 token 存成 `vercel.com` 的自訂 secret——這是工具唯一會連的 host：

```bash
sbx secret set-custom --host vercel.com --env PR_IMAGE_BLOB_TOKEN --value '<token>'
```

這樣 sandbox 裡的 `PR_IMAGE_BLOB_TOKEN` 只是一個 placeholder，上傳請求離開時，host 的 proxy 才把真的 token 換進去。`--value` 會把 token 留在 shell history 裡；`sbx secret set-custom` 也接受 `--ref`（1Password 參照）或 `--command`，改成在請求當下才去取。自訂 secret 在 sbx 裡還標示為實驗性功能——見 Docker 的[憑證說明](https://docs.docker.com/ai/sandboxes/security/credentials/)。

變數刻意不叫 `BLOB_READ_WRITE_TOKEN`。那是 Vercel 自家工具讀的名稱；agent 如果正在開發一個本身就用 Vercel Blob 的 app，兩邊就會共用同一個變數，截圖會被傳進錯的 store，而且不會有任何錯誤。

### 其他地方

照你平常在 shell 裡設定秘密的方式設這個變數就好——例如用 `op run` 搭配 1Password 參照，或在一個只有你讀得到的檔案裡 `export`。

### 從 0.1 升級

0.2 拿掉了 Cloudflare R2、1Password 與設定檔。`~/.config/pr-image/config.json` 不會再被讀取，可以刪掉；已經傳到 R2 的圖會照 bucket 的 lifecycle rule 自己過期，之後就可以把 bucket 和它的 API token 一起刪掉。

### 直接跑 clone 出來的原始碼

給改工具的人，不是給用工具的人：

```bash
git clone https://github.com/yurenju/pr-image.git
cd pr-image
npm install
npm link
```

`npm install` 會把 `src/` 編譯成 `dist/`，指令實際跑的是 `dist/cli.js`。兩個後果值得知道：

- **那個連結指回這份 clone。** 目錄搬走或刪掉，指令就壞了。放在一個不會動的地方。
- **只做 `git pull` 不會升級那個指令。** 拉完之後要再跑一次 `npm install` 重建 `dist/`。

之後要移除就跑 `npm unlink -g @yurenju/pr-image`。

## 用法

```
pr-image upload [--markdown] <file>...   上傳並印出網址
pr-image upload -                        從 stdin 讀一張圖上傳
```

輸出只有網址、沒有別的字，所以 `url=$(pr-image upload shot.png)` 直接能用，agent 讀 stdout 也不用解析。加 `--markdown` 會改印 `![alt](url)`，alt 文字取自 source file 的檔名。

格式是看檔案開頭的位元組決定的，不是看副檔名。接受 PNG、JPEG、GIF、WebP、AVIF。**SVG 刻意不收**：它可以夾帶 script，store 會怎麼送出一個上傳的 SVG 也從沒實測過，而截圖本來就不需要是 SVG。

## 它不做的事

不刪圖、不列出圖、不幫你貼進 pull request、不縮圖也不重新壓縮、不碰剪貼簿。Pathname 是隨機的，不編任何資訊——沒有 repository 名稱、沒有日期、沒有原始檔名——所以 store 沒辦法瀏覽，網址本身也透露不出什麼。見 [ADR-0002](docs/adr/0002-keys-are-random-and-meaningless.md)。

保護一張圖的只有那個網址。只要圖還在，任何拿到網址的人都看得到，所以真正敏感的東西不該放這裡。

## 開發

```bash
npm test        # 單元測試，不需要網路也不需要憑證
npm run typecheck
```

設計說明在 [CONTEXT.md](CONTEXT.md) 與 [docs/adr/](docs/adr/)。英文版的這份文件在 [README.md](README.md)。

## 授權

MIT
