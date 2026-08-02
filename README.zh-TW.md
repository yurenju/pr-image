# pr-image

把圖片丟上 Cloudflare R2，印出一個可以貼進 pull request 的網址。圖片 30 天後自己消失——PR 一關，就不會再有人回頭找它了。

```console
$ pr-image upload login-screen.png
https://img.example.com/xK3f9c2a1b8e4d7Q0pRsTu.png

$ pr-image upload --markdown before.png after.png
![before](https://img.example.com/aB1cD2eF3gH4iJ5kL6mN7o.png)
![after](https://img.example.com/pQ8rS9tU0vW1xY2zA3bC4d.png)
```

沒有任何東西在背景跑，也沒有排程。過期是 bucket 上的一條 lifecycle rule，刪除由 Cloudflare 執行。以一個人實際會產生的量來說，這完全落在 R2 的免費額度裡——免費額度是 10 GB 儲存、每月一百萬次寫入與一千萬次讀取，流出不收費。

## 需要什麼

- **Node.js 24 以上**。TypeScript 直接執行，沒有 build 步驟。
- **一個有開 R2 的 Cloudflare 帳號**，以及一個掛在 Cloudflare 上的 domain 用來提供圖片。
- **一個 1Password service account**。注意：不是每種 1Password 方案都能開 service account，請先確認開得出來再往下做——R2 的憑證只能透過它讀取，沒有備援路徑。

## 一次性設定

這一段是人手動做的，工具不碰。

### Cloudflare

1. 建一個 R2 bucket。**Location** 用 Automatic，storage class 保持預設的 **Standard**——免費額度不含 Infrequent Access，雖然它「一個月存取不到一次」的說明聽起來很像在講這些圖。
2. 在 bucket 的 **Settings → Object lifecycle rules** 加一條規則，動作只勾 **Delete uploaded objects after 30 days**。prefix 留空，規則才會套用到整個 bucket——這裡的 key 是隨機的，沒有共同前綴可以比對。**不要**勾轉到 Infrequent Access：那個 storage class 不在免費額度內，而且每轉一次還算一次寫入操作。

   這個工具不會刪任何東西；這一步漏掉的話，儲存量會一直長到開始收費，而且不會有人提醒你。見 [ADR-0001](docs/adr/0001-expiry-is-a-bucket-lifecycle-rule.md)。
3. 幫 bucket 綁一個 **custom domain**，讓圖片從你自己控制的網域送出。
4. 從 **R2 object storage → Account Details → API Tokens → Manage** 開一把 **R2 API token**。這跟 My Profile 底下那個通用的 Cloudflare API token 不是同一個東西——只有 R2 這條路徑會給你 S3 簽名需要的 access key id 與 secret access key。

   權限選 **Object Read & Write**，範圍只勾 `pr-image` 這一個 bucket。四個權限等級裡只有兩個 `Object` 開頭的能綁定特定 bucket，兩個 `Admin` 都是整個帳號。secret access key 只會顯示一次、關掉就沒了，所以先把 1Password 的 item 開著再按建立。

### 1Password

1. 先自己建一個 vault 放這些東西。service account **不能**被授權存取內建的 Personal、Private、Employee vault，也不能存取預設的 Shared vault，所以 item 不能放在那幾個裡面。
2. 在那個 vault 裡建一個 item 放這把 R2 token，欄位分別叫 `access-key-id` 與 `secret-access-key`。
3. 建一個 **service account**，授權它讀取那個 vault。如果你用 1Password CLI 建，注意 `--expires-in` 會給 token 一個效期——這個要想清楚再決定，token 過期就是上傳開始失敗。
4. 把 service account token 單獨存成一個檔案，並且鎖起來：

   ```bash
   chmod 600 ~/.config/op/service-account-token
   ```

## 每台機器的設定

每台要拿來上傳的機器都要做一次。

```bash
git clone https://github.com/yurenju/pr-image.git
cd pr-image
npm install
npm link
pr-image init
```

`init` 會問 account id、bucket、公開網址、token 檔路徑與 1Password item，然後寫出 `~/.config/pr-image/config.json`：

```json
{
  "accountId": "0123456789abcdef0123456789abcdef",
  "bucket": "pr-images",
  "publicBaseUrl": "https://img.example.com",
  "tokenFile": "/home/you/.config/op/service-account-token",
  "secretReferences": {
    "accessKeyId": "op://Automation/pr-image r2/access-key-id",
    "secretAccessKey": "op://Automation/pr-image r2/secret-access-key"
  }
}
```

這個檔案裡沒有秘密，只有 token 檔的路徑和指向 1Password 的參考。想改預設的 10 MB 上限就加一個 `maxFileSizeMb`。

## 用法

```
pr-image upload [--markdown] <file>...   上傳並印出網址
pr-image upload -                        從 stdin 讀一張圖上傳
pr-image init                            產生這台機器的設定檔
```

輸出只有網址、沒有別的字，所以 `url=$(pr-image upload shot.png)` 直接能用，agent 讀 stdout 也不用解析。加 `--markdown` 會改印 `![alt](url)`，alt 文字取自 source file 的檔名。

格式是看檔案開頭的位元組決定的，不是看副檔名。接受 PNG、JPEG、GIF、WebP、AVIF。**SVG 刻意不收**：它可以夾帶 JavaScript，而圖片是從你自己的網域送出去的，那段 script 會在你的 origin 上執行。

## 它不做的事

不刪圖、不列出圖、不幫你貼進 pull request、不縮圖也不重新壓縮、不碰剪貼簿。Key 是隨機的，不編任何資訊——沒有 repository 名稱、沒有日期、沒有原始檔名——所以 bucket 沒辦法瀏覽，網址本身也透露不出什麼。見 [ADR-0002](docs/adr/0002-keys-are-random-and-meaningless.md)。

保護一張圖的只有那個網址。任何拿到網址的人，在它過期之前都看得到，所以真正敏感的東西不該放這裡。

## 開發

```bash
npm test        # 單元測試，不需要網路也不需要憑證
npm run typecheck
```

設計說明在 [CONTEXT.md](CONTEXT.md) 與 [docs/adr/](docs/adr/)。英文版的這份文件在 [README.md](README.md)。

## 授權

MIT
