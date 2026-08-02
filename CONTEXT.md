# PR Image Hosting

一個放圖片的地方，而這些圖片只為了被貼進 pull request 的討論裡看幾眼。討論結束，它們的價值就沒了，所以用便宜的方式放著、時間到就刪掉，不長期保存。

## Language

**PR image**：
只給某一個 pull request 的讀者看的圖片。它天生是拋棄式的——PR 一關，不會再有人回頭找它。
_不要用_：attachment、asset、screenshot（PR image 通常是截圖，但不必然是）

**Source file**：
上傳之前躺在開發者機器上的那個圖檔。跟 object 分開命名，是因為兩者壽命不同——刪掉其中一個，跟另一個沒有關係。
_不要用_：input、original、本機圖檔

**Object**：
上傳之後住在 bucket 裡的那一份。會過期的是它。
_不要用_：file、blob、upload（當名詞用的時候）

**Key**：
object 在 bucket 裡的識別字。刻意隨機、刻意沒有意義——key 裡編了什麼，拿到網址的人就讀得到什麼。
_不要用_：path、檔名、object name

**Public URL**：
貼進 pull request 的那個網址。一次上傳做完，開發者實際會碰到的只有它。
_不要用_：link、image URL、CDN URL

**Expiry**：
object 超過這個歲數就會被自動刪掉。以整天為單位，而且是個大概——到了歲數之後通常一天之內消失，不是準點。它是 bucket 的性質，不是單一 object 的性質：沒有任何一次上傳可以豁免它或延長它。
_不要用_：TTL、保存期限、lifetime
