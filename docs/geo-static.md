# 静态只读版（GitHub Pages）

没有服务器时，可以把本机运行的网站导出成静态网页，放到 GitHub Pages 上给读者看。本机照常采集、写简报；导出的是某一刻的快照，需要定时重新导出。

```bash
node modules/geo-directory/scripts/export-static.ts --base http://localhost:3000 --out .data/static \
  --prefix /geo-learning-map-news/ --site https://fangx-ai.github.io/geo-learning-map-news/ --push
```

- 页面从 `/sitemap.xml`、主要栏目和页面里的链接一路找到，默认最多 5000 页（`--max`），超出时算导出失败。
- 导出请求带 `x-geo-static: 1`。站点按只读快照渲染：搜索、下拉筛选、收藏、关注、已读、深浅色和中英文切换不再画成可点控件，并写明快照做不到什么。内容类型、时间和排序改成普通链接，每种条件单独一页。Agent 页不报告接口健康，也不写出本机地址。没有整期日报时 `/daily/editions` 转到按日期看，侧栏和「我的」不放空的整期入口。
- 页面脚本、表单、按钮、输入框和下拉框仍会去掉，作为第二道保险。链接是普通跳转。需要后端的功能在快照里没有：搜索、组合筛选、收藏、反馈、后台和公开 API。
- 图片代理（`/api/img-proxy`）返回的图片存成快照里的 `img/<哈希>.<扩展名>`，扩展名按代理实际返回的类型。代理取不到的图片改成链接原图，不算导出失败，只在结果里计数（`imageFailures`）。
- 带查询参数的页面（翻页、按信源筛选）存成所在页面下的 `_q/<哈希>/`；只影响返回链接的 `from` 参数会被去掉。
- `--push` 把快照作为一个提交强制推到本仓库 `origin` 的 `gh-pages` 分支（每次覆盖，不保留历史）。仓库 Settings → Pages 选 `gh-pages` 分支的根目录。
- 导出有任何页面失败时不推送，退出码为 1。
- RSS、`llms.txt`、`sitemap.xml` 里的站内地址换成 `--site`，但它们也只在导出时更新。
