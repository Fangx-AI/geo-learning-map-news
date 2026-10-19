# 2026-10-17 第三轮：Pew 公开入口恢复与一手数据候选

本文前半部分记录只读研究与配置提案；主任务已随后完成正式集成，结果见文末。草案为 `.data/sources-round3-proposals.json`：一个 Pew 入口替换、一个 SISTRIX 英文订阅新增、一个暂缓的 Graphite 候选。先保留来源价值与数据边界，不为完成数量接入泛 AI 列表。

## Pew：官方搜索 HTML 可替代已拒绝的 JSON 入口

旧 `json-pew-ai-summaries` 的 WordPress JSON 地址在主任务采集中返回 403；本轮**没有重试该入口**。正常匿名 GET [Pew 官方搜索页](https://www.pewresearch.org/?s=AI+summaries) 返回 200，现有 `fetchWebList` 可直接读取卡片中的标题、原始短摘要及日期，无需登录、Cookie、API key、验证码操作或文章详情请求。

建议保留既有 source ID，`kind` 改为 `web_list`，整体替换 config，避免旧 JSON 字段残留。正式选择器如下：

```json
{
  "url": "https://www.pewresearch.org/?s=AI+summaries",
  "parseMode": "html",
  "itemSelector": "article.in-query-loop",
  "linkSelector": ".header a",
  "titleSelector": ".header",
  "publishedAtSelector": "time.date",
  "publishedAtUtcOffset": "+00:00",
  "excerptSelector": ".description",
  "allowUrlPrefixes": [
    "https://www.pewresearch.org/short-reads/",
    "https://www.pewresearch.org/data-labs/",
    "https://www.pewresearch.org/internet/",
    "https://www.pewresearch.org/journalism/"
  ]
}
```

列表原始首屏有 10 张结果卡片；允许路径排除 newsletter 后，正式读取器得到 **6 条、6 条有日期**；现有 GEO 规则保留 **2 条、2 个唯一原文 URL、2 条有短摘要**。最终正式读取于北京时间 **08:41**，两篇为：

- [Google 用户遇到 AI 摘要时的点击行为研究](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)，2025-07-22。900 名美国成人的浏览面板与后续搜索结果重采集；观察性结果不能视为随机实验或全球结论。
- [美国人对搜索结果 AI 摘要的感受](https://www.pewresearch.org/short-reads/2025/10/01/americans-have-mixed-feelings-about-ai-summaries-in-search-results/)，2025-10-01。主观问卷与点击行为测量不同，不能把两种指标混为一谈。

两条均为原先已经收录的原文 URL，属于恢复覆盖，不应当作新增研究条数。真实列表还出现了 2026-10-16 的一般 AI 性别差异文章，说明入口会更新；但该文章未命中 GEO，保持排除。搜索页首屏按相关性排序，本次没有读取全部分页，也不保证每篇新研究都进入前 10 条；这是有限、可持续重读的官方入口，不是 Pew 全站订阅。另测官方 AI 主题 HTML 同样正常 200，但范围更宽，本轮不替代精准查询。

### 接入前必须保留已有发布时间精度

缓存 HTML 的 `time.date` 虽有 `datetime`，值本身为 `2025-07-22T00:00:00+00:00` 与 `2025-10-01T00:00:00+00:00`，可见文字也只有日。因此换属性解析不能恢复小时分秒。主任务只读核对旧数据分别为 `2025-07-22T13:54:17Z`、`2025-10-01T13:55:07Z`；直接覆盖会丢失已经掌握的精度。

现有 `completePublicDates` 只给空日期条目补齐，且需要显式权威详情规则；它目前不会查询已有列表日期的精度。也不建议简单去掉列表日期、禁止详情请求：那会让未来新条目无日期。

**该替换应在主任务完成日期精度保护后再应用**：显式声明列表只有日精度，仅同源、同条目身份、同来源日时保留已有精确时间；新条目继续使用真实列表日。此为零额外文章请求的最小集成方向，不声称现有代码已支持。本轮不改日期处理或存储逻辑。

## 新增提案：SISTRIX 英文数据订阅

[官方 RSS](https://www.sistrix.com/feed/) 通过现有 `fetchRss` 读取 **10 条，10 条有日期与摘要；GEO 保留 7 条、7 个唯一 URL，7 条日期及摘要完整，5 条提供可用图片元数据**。两次正常读取的候选身份、日期、数量一致。仅有元数据不等同于图片下载验证。

建议 ID 为 `rss-sistrix-research`，目录 ID `sistrix-en`，明确 `evidence=vendor`。既有目录只有德语、西语入口，英语订阅是不同语言入口，但三者属于同一商业机构，不能累计成三份独立研究证据。保持原文短摘要及链接，不开启全文。现有订阅包含产品与观点，不把 7 条相关内容说成 7 篇原创研究。

本窗口内值得保留的直接测量是 [ChatGPT Core Updates](https://www.sistrix.com/blog/chatgpt-core-update/)（2026-06-01）。作者披露 38 次每日样本、每次 10 万条德语回复，并区分界面变化与引用变化。其模型版本判断包含向模型询问自身版本，不能据此确认平台实际版本；作者也明确只能观察相关变化，无法从外部排除检索或提示层同时变化。它是厂商原始观测，不是 OpenAI 官方更新公告或因果证明。

另外人工核对过的 [AI Citation Drift](https://www.sistrix.com/blog/ai-citation-drift-how-stable-are-sources-in-ai-search-results/) 披露 82,619 个提示、六国、三平台、17 周和域名层级指标边界，具备后续跟踪价值；但这篇**不在本次最新 10 条 RSS 窗口内**，不能声称已经自动采到了它。

正反例边界：SISTRIX 的产品季度更新、Prompt Research 介绍、工具联动教程与月度综述不能冒充独立研究；CMA 规则文章属于厂商解读，法规事实应追溯监管机构。传统 Google 排名 Top 100 文章未命中 GEO。当前分类只给出 `Allgemein` 等宽标签，没有研究专属分类可用；未用虚构分类过滤来宣称“纯研究订阅”。

## 暂缓：Graphite Research

[Graphite 的原始研究专栏](https://graphite.io/five-percent/research) 正常公开可读，商业增长代理商背景明确。[强制搜索对提示跟踪的影响](https://graphite.io/five-percent/research/do-not-force-search-prompt-tracking) 是带条件对比的原始实验；[AI Search Collapse](https://graphite.io/five-percent/research/ai-search-collapse) 属仿真研究，作者没有证明现实搜索已经发生相同崩塌。

正式读取器按专栏路径得到 **22 条、22 条有日期、5 条 GEO 保留、0 条摘要**。HTML、JSON-LD 与公开内嵌卡片数据都没有逐篇短摘要，也未声明 RSS；没有拿全站介绍或作者说明冒充摘要。两张链接到专栏之外 `/research/` 的卡片被路径范围有意排除。部分方法文章只靠题名漏召回，暂不自动接入，保留原始证据供将来找到合适入口。

## 证据与检查

Pew 与 SISTRIX 合计 9 条规则保留候选、9 个唯一原文 URL、无缺日期或缺摘要；其中 Pew 两条是恢复既有覆盖，不是新入库。本轮没有全库重复扫描，其他来源是否已报道同一研究仍由主任务入库去重判断。

- `.data/sources-round3-proposals.json`：`replacements` / `additions` / `deferred`，包含完整 source 配置及目录变更草案。
- `.data/pew-search-round3.html`、`.data/pew-replay-round3.json`：官方搜索首屏及选择器回放。
- `.data/pew-results-round3.json`：正式 `fetchWebList` 读取证据。
- `.data/sistrix-results-round3.json`、`.data/sistrix-raw-round3.json`：正式 RSS 与原始短摘要、日期及分类证据。
- `.data/graphite-round3-candidate.json`、`.data/graphite-research-round3-candidate.html`：暂缓来源的真实读取记录。

两个拟用配置均通过 `assertSupportedConfig` 和 `publicSourceIssue`，既有 Pew ID 存在，拟新增 SISTRIX ID / feed URL 未重复配置。沿用正常出网代理，无登录凭据、模型调用、入库或服务操作。所有 `.data/` 证据均留在本机，不提交凭据或运行数据；没有运行全套测试。

## 主任务正式接入与浏览器复核

上述研究提案随后已由主任务集成。北京时间 **08:46** 的 `.data/source-ingest-round3.json` 记录：Pew 正式读取 6 条、保留 2 条且状态正常；SISTRIX 读取 10 条、保留 7 条且状态正常。Pew 原有两条历史字段逐一保持不变，先前的时间精度阻碍已经解决；未用午夜或本轮采集时间替换其旧发布时间。SISTRIX 的源摘要 v3 清理了 7 条德语转载尾注。

**08:51–08:53** 独立浏览器只读复核：SISTRIX 7 条均可中文/原文切换，两种摘要无德语尾注，7/7 张封面实际加载；Pew 两条仍显示 2025 年日期，DOM 的精确发布时间分别保持 `2025-07-22T13:54:17.000Z` 和 `2025-10-01T13:55:07.000Z`。目录新增英文 SISTRIX，更新 Pew HTML 说明；现场状态为 **73/73 来源正常**。桌面和 390px 手机模拟视口无横向溢出，控制台无错误。此处只确认显示与接入，不声称译文已全部人工校订。

[浏览器报告与三张真实截图](../output/playwright/geo-audit/readonly-20261017-round3/report.md)。
