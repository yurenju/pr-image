# PR Image Hosting

一個放圖片的地方，而這些圖片只為了被貼進 pull request 的討論裡。圖片跟著討論一起留下來，工具只負責放上去，從不刪除。

## Language

**PR image**：
只給某一個 pull request 的讀者看的圖片。它跟著那段討論一起留下來——日後有人翻回這個 PR，圖還在。
_不要用_：attachment、asset、screenshot（PR image 通常是截圖，但不必然是）

**Source file**：
上傳之前躺在開發者機器上的那個圖檔。跟 blob 分開命名，是因為兩者壽命不同——刪掉其中一個，跟另一個沒有關係。
_不要用_：input、original、本機圖檔

**Blob**：
上傳之後住在 store 裡的那一份。
_不要用_：object、file、upload（當名詞用的時候）

**Store**：
放所有 blob 的那個地方。整個工具只對著一個 store。
_不要用_：bucket、storage、container

**Pathname**：
blob 在 store 裡的識別字。刻意隨機、刻意沒有意義——pathname 裡編了什麼，拿到網址的人就讀得到什麼。
_不要用_：key、path、檔名

**Public URL**：
貼進 pull request 的那個網址。一次上傳做完，開發者實際會碰到的只有它。
_不要用_：link、image URL、CDN URL
