# 2026-10-17 来源扩充：第二轮

本轮接入两路厂商自有数据与 AI 搜索实验入口：Authoritas、Similarweb AI Search。两者均保留 `vendor` 商业背景，不标为独立学术研究，也不将整个站点的观点、产品宣传视为经验证结论。优先补充可追溯的测量原文，没有为增加数量接入整站泛 AI 动态。

普通公开来源由 68 增至 70 路（55 RSS/Atom、12 网页列表、3 公开 JSON）；加上独立 X / Reddit 两路，目录有 72 个 `configured`。目录总数由 149 增至 150：复用原有 `similarweb` 条目，只新增 `authoritas`。这些是配置数，不是运行成功率或全球覆盖率。

## 正式读取器实测

北京时间 **2026-10-17 07:57**，使用正式 `fetchWebList → admitListing → toPublicCandidates → filterPublicationWindow` 只读试采。沿用正常出网代理，不附带登录 Cookie / API key，不调用模型、不连接查询数据库、不启动采集守护。仅自动读取公开列表中的元数据与短摘要；研究筛选时另人工查看少量公开原文的方法说明，没有配置文章全文采集、论文下载或全文再分发。

| source ID / 入口 | 列表候选 | 有来源日期 | GEO 保留 | 保留且有日期 | 非空摘要 | 读取器图片元数据 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `web-authoritas-research` · [Authoritas Blog](https://www.authoritas.com/blog) | 12 | 12 | 11 | 11 | 10 | 0 |
| `web-similarweb-ai-search` · [Similarweb AI Search Blog](https://aisearch.similarweb.com/blog/) | 12 | 12 | 6 | 6 | 0 | 0 |
| 合计 | 24 | 24 | 17 | 17 | 10 | 0 |

这张表最初记录待入库候选；后续正式采集结果见文末。两源各自的候选 ID 与 URL 无重复，合并 17 条的原文 URL 也无重复。多次读取的条目窗口及日期一致，未发现未来日期。

日期来自卡片可见的发布日期，仅有日精度。显式配置 `publishedAtUtcOffset: "+00:00"` 使解析不受本机时区影响，不代表来源披露了精确 UTC 发布时间。没有用抓取时间或更新时间填充发布日期。HTML 列表读取器本次没有输出图片字段，不能由此断言原站无图，也不能将后续 OG 补图视为本次已验证。

两源均为正常公开 HTML，不是 RSS；目录 `access=website`，不会生成虚假的 RSS 订阅地址。全部保持 `site_fulltext=false` 与 `syndicate_fulltext=false`。没有启用跳过相关性过滤的专题豁免。

## Authoritas：可复核的原始实验，也包含产品推广

解析边界为 `article.blog_item-link` 内的标题链接、`.blog_date` 与 `.blog_summary`，只允许其 `/blog/` 原文路径。最新列表文章日期为 2025-12-15，本次读到的是 2024–2025 年历史资料；收录日期不会冒充新研究的发布日期，也不承诺该站当前仍按固定频率发文。

具体价值包括 [SERP Organic and AI Overview Volatility Research](https://www.authoritas.com/blog/serp-organic-and-ai-overview-volatility-research)（列表日期 2025-02-19）：作者披露 11,203 个关键词、美国 Google.com 桌面结果，以及 2024-08-23、2024-10-17、2025-01-17 三次观测，并提供数据入口。AIO 部分实际涉及 2,104 个关键词，不能把整个关键词样本都说成 AIO 样本，也不能将特定时间、设备与关键词的波动概括为普遍排名规律。

另抽查 [虚构专家能否影响 AI 搜索的实验](https://www.authoritas.com/blog/can-you-fake-it-til-you-make-it-in-the-age-of-ai-search)（2025-12-15），它区分开放主题问题与直接给出虚构人名的引导问题；其结果与作者后续营销推论不能混为一谈。[ChatGPT / Grok 提示词比较](https://www.authoritas.com/blog/chatgpt-vs-grok-ai-user-prompt-analysis)（2025-09-29）混用了外部 OpenAI / NBER 的 150 万 ChatGPT 对话研究和作者的 Grok 分析，**不能称为 Authoritas 独立采集的 150 万 ChatGPT 对话**。

同一入口也提供产品发布、工具选择和操作指南。它们可与 GEO 相关，但不因此取得原始研究身份或质量背书。负例“Google Search Volume Buckets”虽然有传统 SEO 的大样本分析，现有规则未判为直接 GEO，保持排除。

### 同一 HTML 的摘要选项前后对照

采用同一份真实列表 HTML，仅增删 `excerptSelector: ".blog_summary"`，通过正式 `fromHtml` 和公开候选转换回放：

| 状态 | 候选 | 列表原有摘要 | GEO 保留 | 保留条目非空摘要 |
| --- | ---: | ---: | ---: | ---: |
| 不配置摘要选择器 | 12 | 0 | 9 | 0 |
| 配置摘要选择器 | 12 | 11 | 11 | 10 |

标题、URL、发布日期全部不变。增加召回的两篇为 ChatGPT / Grok 提示词比较、SERP Comparison 工具介绍：前者摘要补足 AI 可见性语境，后者补足 AI Overview 语境。后者仍是产品介绍，增加相关性召回不等于提高研究质量。

选项由主任务加入通用 HTML 列表读取器，只读取各卡片中指定的短摘要节点，不增加文章详情请求；未配置时保持原行为。Grok 的一篇列表卡片没有摘要，保留空值，没有用标题、作者介绍或临近卡片拼造摘要。

## Similarweb：原始引荐数据，诚实保留无摘要状态

采用官方新子站的 `article[id^=grid-post-]` 网格，读取 `h3 a` 标题及 `PostCardNotes_dateWrapper` 日期。旧主站访问检查和新子站公开可读是不同结果；没有绕过旧主站的检查。当前页面提供 12 张带日期卡片，未自动展开“Show more”，也未把缺少日期的头部轮播当作完整文章列表，因此不表示已经回填该站全部历史资料。

有价值的直接原文为 [AI Referral Traffic by Industry](https://aisearch.similarweb.com/blog/ai-referral-traffic-by-industry/)（2026-09-03）：它基于厂商的 2026 Generative AI Landscape 数据，口径为全球桌面与移动网页、2025-06 至 2026-05 的观测，比较不同行业的 AI 引荐。面板估算与网站实际流量账本不同，引荐访问也不等同于引用、转化或因果效果。

反例 [是否添加 TL;DR 以增加 AI 引用](https://aisearch.similarweb.com/blog/tldr/)（2026-09-10）是作者建议与待验证方案，**不是已完成的对照实验**。工具榜单仍为商业产品比较，不将“研究”“最佳”字样当成质量证明。

该列表 HTML 和公开内嵌卡片元数据都没有文章短摘要；正式配置不填写 `excerptSelector`，6 条保留候选的摘要均为空，不拿作者简介、标题或整页文本充数。代价是召回依赖标题，例如 [ChatGPT Ads CTR by Country](https://aisearch.similarweb.com/blog/chatgpt-ads-ctr-by-country/)（2026-10-08）虽与测量相关，当前规则没有从题名单独召回。已记录这个边界，没有为这一来源整体放宽到泛 AI 内容；Claude / ChatGPT 通用使用比较也未强行收入。

## 本轮检查但未接入的候选

| 入口 | 实读结果或阻碍 | 不接入原因 |
| --- | --- | --- |
| [Google Research RSS](https://research.google/blog/rss/) | 100 条均有日期，规则保留 1 条 Retrieve-for-Train | 有原始检索研究，但当前大窗口以广义 AI 为主，订阅摘要只是学科分类；未以整站补数量。 |
| [Google DeepMind RSS](https://deepmind.google/blog/rss.xml) | 100 条均有日期，2 条规则命中均为机器人文章 | 人工复核不属本轮 GEO 范围，不把机械命中当成来源质量。 |
| [Apple ML RSS](https://machinelearning.apple.com/rss.xml) | 10 条有日期，1 条工具发现架构命中 | 当前样例是 API 工具检索，不是网页搜索曝光或引用测量。 |
| [AI Snake Oil 原订阅](https://www.aisnakeoil.com/feed) | 正常跳转，20 条有日期，0 条当前 GEO 命中 | 暂无本轮稳定直接增量。 |
| [seoClarity RSS](https://www.seoclarity.net/blog/rss.xml) | 10 条有日期，6 条相关，当前多为工具比较 | 以补原始测量为目标，未继续堆叠同类商业指南。 |
| [Adobe Digital Insights](https://business.adobe.com/resources/adobe-digital-insights.html) | 官方数据有价值，但正常读取商业站列表超时；新闻首页可读却主要动态加载 | 未获得现有读取器能稳定解析的文章列表；两个 `query-index.json` 请求返回 HTML 回退页，不能当成公开 JSON 接入成功。 |

Authoritas / Similarweb 猜测的 RSS 路径返回 404 后改用已验证的正常公开列表，没有反复尝试登录、验证码、第三方镜像或受限接口。

## 文件与验证

正式配置在 `industry/sources.json`，目录描述与商业背景在 `industry/source-directory.json`。保留的本地只读证据（不提交 `.data/`）如下：

- `.data/sources-round2-final.json`：两条最终配置快照。
- `.data/sources-round2-final-results.json`：24 条候选的读取统计、17 条保留结果和排除样例。
- `.data/sources-round2-replay.json`：同一 HTML 的摘要前后对照及 17 个唯一原文 URL 检查。
- `.data/authoritas-listing-round2.html`：前两张真实列表卡片，供读取器回归使用；不是文章全文。
- `.data/similarweb-initialPosts-round2.json`：公开卡片元数据，核对无文章摘要字段。

本轮本地独立检查：`node --test modules/geo-directory/tests/directory.standalone.test.ts tests/web-list-excerpt.standalone.test.ts modules/geo-directory/tests/public-feed.standalone.test.ts`，**12/12 通过**。覆盖配置字段、目录身份与订阅类型、公开读取边界、相关性，以及卡片摘要不会借用其他卡片、导航或脚本文本。`npm run typecheck` 和 `git diff --check` 均通过。没有重复运行全套数据库测试或构建线上服务；正式入库与守护统一由主任务执行。

## 正式采集与页面验收

2026-10-17 主任务通过现有公开采集器完成两源入库：Authoritas 11 条、Similarweb 6 条，17 条均完成中文翻译及原站封面补查。来源短摘要有 10 条，另 7 条保持为空。图片来自后续文章封面元数据读取，不是 HTML 列表读取器新增图片输出，也没有转载全文。

运行中的 30 分钟采集循环已包含这两源，目前合计 72 个自动采集入口、150 条信源目录项。北京时间 08:02 的完整轮次成功 70/72：Pew 返回 HTTP 403，arXiv 引用研究入口返回 HTTP 429；保留已收录内容，不把暂时失败写成接入成功。

真实浏览器逐条滚动验证两源 17/17 张封面正常加载，中文／原文切换和原链接正常，桌面与手机没有横向溢出。正式采集记录在 `.data/sources-ingest-round2.json`，翻译记录在 `.data/sources-translated-round2.json`，浏览器报告在 `output/playwright/geo-audit/readonly-20261017-round2/report.md`。完整测试和译文发布结果见 [第二轮集成验收](geo-validation-20261017-round2.md)。
