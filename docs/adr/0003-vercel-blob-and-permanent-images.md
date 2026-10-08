# 改用 Vercel Blob，圖片永久保存

工具要能在 Docker Sandbox（`sbx`）裡跑，而 sandbox 注入 secret 的方式是由 host 端的 proxy 把請求裡的 placeholder 換成真值。R2 的 S3 API 用 SigV4 簽名，secret 只在本機拿來算 HMAC、從不出現在請求裡，proxy 無從替換；R2 的 REST API 雖然吃 bearer token，卻要帳號層級的 Admin 權限。Vercel Blob 用一把只對應一個 store 的 bearer token、只打 `vercel.com` 一個 host，正好是 proxy 能注入的形狀，所以改用它。Vercel Blob 沒有過期機制，於是 PR image 從「拋棄式、30 天過期」改成永久保存，取代 [ADR-0001](0001-expiry-is-a-bucket-lifecycle-rule.md)。

## 考慮過的選項

- **R2 REST API + bearer token**：改動最小，但 token 要 Admin Read & Write，可以建、刪帳號裡所有 bucket。
- **R2 前面擺一個 Worker**：權限能維持在單一 bucket，代價是多一個要部署、要養的東西。
- **Backblaze B2**：有 lifecycle rule、key 能限定 bucket，但開 public bucket 要先有付款紀錄，而且授權後拿到的臨時 token 會進到 sandbox 裡。
- **Vercel Blob（採用）**：免費、token 限定一個 store、sandbox 能直接注入。放棄的是過期和自訂網域。

## 後果

- **不能用官方 SDK。** `@vercel/blob` 會在本機把 token 拆開取出 store id；sandbox 裡的 token 是 placeholder，拆出來是空的。上傳因此是一個自己寫的 `fetch`，任何東西都不能從 token 推導。
- **token 是整個 store 的讀寫權限。** Vercel 沒有只能寫、又不會過期的 token。能接受，是因為在 sandbox 裡 agent 只看得到 placeholder。
- **免費額度會被慢慢吃滿。** Hobby 方案每月 1 GB 儲存、2,000 次上傳，圖又不再刪除，儲存量只會長。超過之後要等 30 天才能再用 Blob，很可能連已經貼出去的圖也讀不到——是所有 PR 裡的圖一起壞，不是只有新的上傳失敗。工具看不到用量，無法預警；預設大小上限降到 5 MB 只是放慢這件事，不是解決它。要騰出空間，得自己到後台刪舊圖，工具本身依舊沒有刪除邏輯。
- **Hobby 方案只限非商業用途。** 拿來貼工作上的 PR 就得換 Pro 方案。
- **網址在 Vercel 的網域上**（`<storeId>.public.blob.vercel-storage.com`），不能換成自己的網域。
