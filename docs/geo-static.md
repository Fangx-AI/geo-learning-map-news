# 静态只读版（GitHub Pages）

没有服务器时，可以把本机运行的网站导出成静态网页，放到 GitHub Pages 上给读者看。本机照常采集、写简报；导出的是某一刻的快照，需要定时重新导出。

```bash
node modules/geo-directory/scripts/export-static.ts --base http://localhost:3000 --out .data/static \
  --prefix /geo-learning-map-news/ --site https://fangx-ai.github.io/geo-learning-map-news/ --push
```

- 页面从 `/sitemap.xml`、主要栏目和页面里的链接一路找到，默认最多 5000 页（`--max`），超出时算导出失败。
- 页面脚本、按钮和表单都去掉了，链接都是普通跳转。需要后端的功能在快照里没有：搜索、筛选表单、收藏、反馈、深浅色切换、中文/原文切换、后台和公开 API。
- 带查询参数的页面（翻页、按信源筛选）存成所在页面下的 `_q/<哈希>/`；只影响返回链接的 `from` 参数会被去掉。
- `--push` 把快照作为一个提交强制推到本仓库 `origin` 的 `gh-pages` 分支（每次覆盖，不保留历史）。仓库 Settings → Pages 选 `gh-pages` 分支的根目录。
- 导出有任何页面失败时不推送，退出码为 1。
- RSS、`llms.txt`、`sitemap.xml` 里的站内地址换成 `--site`，但它们也只在导出时更新。
