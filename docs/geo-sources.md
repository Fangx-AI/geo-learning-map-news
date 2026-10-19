# GEO 学习地图信源目录与采集核验

核验日期：2026-10-16（Asia/Shanghai）。这是一份可继续扩充的全球 GEO 信息发现地图，不声称覆盖全部国家、平台、账号或帖子。地域表示主要语境，语言表示主要原文语言。

## 配置各做什么

- `industry/source-directory.json`：142 个可浏览的来源、账号、社区或检索入口，覆盖 en、zh、ko、fr、de、ja、es、pt 八种语言。目录数量不等于自动采集来源数。
- `industry/sources.json`：60 个经项目实际读取的无登录、无 API key 公开源，包括 48 个 RSS/Atom、10 个 HTML 列表和 2 个 HN 官方 Algolia JSON 搜索。公众号索引、知乎索引与转载来源详见 [国内核验](geo-domestic-research.md)；本轮新增 7 路全球研究和作者来源见 [质量核验](geo-quality-sources.md)；当前运行结果见 [验收记录](geo-validation.md)。
- `industry/public-social.json`：两项独立的公开原帖发现与嵌入读取配置，目录对应 `public-x-geo`、`public-reddit-geo`。先从公开作者博客或索引发现链接，再读平台公开嵌入入口；覆盖已发现帖子，不等于完整时间线、搜索或评论。由专门的公开社交读取器处理，不冒充 RSS。
- `collectionStatus=configured` 仅表示存在关联采集配置，不代表后台采集已开启或网络持续可用；`requires_api` 表示 API/服务待接入，`requires_login` 表示人工登录或授权后访问，`manual` 表示人工核验入口。当前 configured 为 62；其余条目仍属于候选、人工或待凭据入口。
- 带“检索”的记录是关键词发现入口，不是固定出版商订阅；X 个人/机构主页、YouTube 频道是账号入口；论文、技术指南是参考入口。检索结果会随时间、地区和登录状态改变。
- 所有采集源的 `site_fulltext` 与 `syndicate_fulltext` 均为 `false`，仅展示摘要与原文链接。没有创建公众号虚构 ID，未使用假 API key，也未开启主采集器/模型安全阀。
- 首次启动 seed 只增加数据库不存在的来源 ID，不会覆盖同 ID 来源的已有配置；已有站点需核对数据库配置，不能仅据 JSON 推断线上状态。

## 首批 36 个源的实际检查基线

首批使用项目自己的 `fetchRss` 与 `fetchWebList` 正常 GET、解析候选；没有调用模型或写入文章数据库。36/36 个源均非空，共 2454 条原始候选，2452 条能解析日期，915 条命中标题关键词粗筛。随后增加 8 个社交/社区源，再增加 4 个中文来源，详见后文；初批与后续筛选口径不同，不合并相关条数。

这些数字是抓取时的未去重原始列表，包含归档、转载、聚合重复与厂商宣传，**不是 915 篇已确认相关或已发布的 GEO 文章**。粗筛只检查标题，规则如下；标题未命中也可能与 GEO 相关，关键词命中也可能误收。正式筛选还应使用候选的 `excerpt` 和 `bodyText`，并检查上下文与证据。

```text
GEO / AEO / generative engine / answer engine /
AI + search|visibility|overview|mode / LLM + search|visibility|traffic /
ChatGPT / Perplexity / Copilot / 引用 / 生成式 / AI検索 / AI搜索 / AI 搜索 /
KI-Suche / IA + recherche|busca / AI + 검색 / retrieval / citation
```

| 来源 | 类型 | 原始候选 | 有日期 | 标题粗筛命中 |
| --- | --- | ---: | ---: | ---: |
| [Google Search Central](https://feeds.feedburner.com/blogspot/amDG) | `rss` | 10 | 10 | 0 |
| [Bing Webmaster Blog](https://blogs.bing.com/webmaster/feed/) | `rss` | 10 | 10 | 4 |
| [OpenAI News](https://openai.com/news/rss.xml) | `rss` | 1296 | 1296 | 183 |
| [arXiv · Information Retrieval](https://rss.arxiv.org/rss/cs.IR) | `rss` | 26 | 26 | 12 |
| [Search Engine Journal](https://www.searchenginejournal.com/feed/) | `rss` | 20 | 20 | 5 |
| [Search Engine Roundtable](https://www.seroundtable.com/index.xml) | `rss` | 15 | 15 | 4 |
| [Abondance](https://www.abondance.com/feed) | `rss` | 10 | 10 | 2 |
| [SEO Südwest](https://www.seo-suedwest.de/?format=feed&type=rss) | `rss` | 20 | 20 | 5 |
| [海外SEO情報ブログ · 鈴木謙一](https://www.suzukikenichi.com/blog/feed/) | `rss` | 6 | 6 | 3 |
| [Cloudflare Blog](https://blog.cloudflare.com/rss/) | `rss` | 20 | 20 | 0 |
| [Ahrefs Blog](https://ahrefs.com/blog/feed/) | `rss` | 10 | 10 | 7 |
| [Growth Memo · Kevin Indig](https://www.growth-memo.com/feed) | `rss` | 20 | 20 | 2 |
| [Hacker News · GEO 检索](https://hnrss.org/newest?q=generative+engine+optimization) | `rss` | 17 | 17 | 17 |
| [Screaming Frog](https://www.screamingfrog.co.uk/blog/feed/) | `rss` | 10 | 10 | 0 |
| [SE Ranking](https://seranking.com/blog/feed/) | `rss` | 15 | 15 | 7 |
| [WordLift](https://wordlift.io/blog/en/feed/) | `rss` | 10 | 10 | 4 |
| [Oncrawl](https://www.oncrawl.com/feed/) | `rss` | 12 | 12 | 3 |
| [Marie Haynes](https://www.mariehaynes.com/feed/) | `rss` | 10 | 10 | 1 |
| [Brodie Clark](https://brodieclark.com/feed/) | `rss` | 10 | 10 | 3 |
| [iPullRank](https://ipullrank.com/feed/) | `rss` | 5 | 5 | 2 |
| [Rich Sanger](https://richsanger.com/feed/) | `rss` | 10 | 10 | 3 |
| [Semrush](https://www.semrush.com/blog/feed/) | `rss` | 20 | 20 | 9 |
| [Hacker News · AI Search](https://hnrss.org/newest?q=%22AI+search%22) | `rss` | 20 | 20 | 13 |
| [Google News · GEO English](https://news.google.com/rss/search?q=%22generative+engine+optimization%22+OR+%22answer+engine+optimization%22&hl=en-US&gl=US&ceid=US:en) | `rss` | 100 | 100 | 95 |
| [Google News · GEO 中文](https://news.google.com/rss/search?q=GEO+%E7%94%9F%E6%88%90%E5%BC%8F%E5%BC%95%E6%93%8E%E4%BC%98%E5%8C%96&hl=zh-CN&gl=CN&ceid=CN:zh-Hans) | `rss` | 100 | 100 | 93 |
| [Google News · GEO 日本語](https://news.google.com/rss/search?q=GEO+AI%E6%A4%9C%E7%B4%A2&hl=ja&gl=JP&ceid=JP:ja) | `rss` | 100 | 100 | 98 |
| [Google News · GEO Français](https://news.google.com/rss/search?q=GEO+%22moteurs+g%C3%A9n%C3%A9ratifs%22&hl=fr&gl=FR&ceid=FR:fr) | `rss` | 47 | 47 | 39 |
| [Google News · GEO Português](https://news.google.com/rss/search?q=GEO+%22busca%22+IA&hl=pt-BR&gl=BR&ceid=BR:pt-419) | `rss` | 53 | 53 | 44 |
| [SEO 每天一帖 · Zac](https://www.seozac.com/feed/) | `rss` | 10 | 10 | 1 |
| [SEO for Lunch](https://www.seoforlunch.com/feed) | `rss` | 20 | 20 | 0 |
| [Google News · GEO Deutsch](https://news.google.com/rss/search?q=GEO+KI-Suche&hl=de&gl=DE&ceid=DE:de) | `rss` | 55 | 55 | 44 |
| [Google News · GEO Español](https://news.google.com/rss/search?q=GEO+%22b%C3%BAsqueda%22+IA&hl=es&gl=ES&ceid=ES:es) | `rss` | 55 | 55 | 46 |
| [Google News · GEO 한국어](https://news.google.com/rss/search?q=GEO+AI+%EA%B2%80%EC%83%89&hl=ko&gl=KR&ceid=KR:ko) | `rss` | 100 | 100 | 95 |
| [Perplexity Blog](https://www.perplexity.ai/en-GB/hub/blog) | `web_list` | 13 | 13 | 3 |
| [Profound Blog](https://www.tryprofound.com/blog) | `web_list` | 186 | 186 | 64 |
| [Human Level](https://www.humanlevel.com/blog) | `web_list` | 13 | 11 | 4 |

主 AI 采集管线的首次回灌配置为每源最多 8 条、最近 3 个月。独立公开资讯管线不应用该首次回灌限制，保留来源实际日期并按公开规则筛选；直接试读 feed 的上述条数仍不等于去重后的实际导入量。OpenAI RSS 包含大量历史内容，arXiv/厂商/搜索新闻的范围也宽于 GEO，必须做相关性过滤。

当前主机已配置正常出网代理。项目 `guardedFetch` 读取 `EGRESS_PROXY_URL`，不会自动继承 `HTTPS_PROXY`；初次 Google FeedBurner Node 直连超时，在验证进程继承现有 `HTTPS_PROXY` 到 `EGRESS_PROXY_URL` 后成功解析 10 条，Google News 八语种也全部成功。未更换身份、未绕过访问校验。部署环境须使用自身正常网络设置并试抓；本次成功不代表持续生产可用。

## 本轮 8 个公开社交与中文来源

2026-10-16 用现有正常出网代理、无 Cookie/登录/API key 请求。使用已补充社交兼容的 `fetchRss(source, { allowUpdatedAsPublished: false, titleFromExcerpt: true })` 和公开流的 `toPublicCandidates` 做只读验证：8/8 个源非空，158 条候选全部具有实际发布日期，91 条被当前相关性规则保留。此处规则读取标题、摘要/正文及专题来源语境，仍是自动初筛，未进行人工事实核查或跨来源去重；这些数字不与上一节“标题关键词”口径相加。

| 来源 | 原始候选 | 有发布日期 | 公开规则保留 |
| --- | ---: | ---: | ---: |
| [Bluesky · Barry Schwartz](https://bsky.app/profile/rustybrick.com/rss) | 30 | 30 | 6 |
| [Bluesky · Lily Ray](https://bsky.app/profile/lilyray.nyc/rss) | 26 | 26 | 11 |
| [Bluesky · Glenn Gabe](https://bsky.app/profile/glenngabe.bsky.social/rss) | 30 | 30 | 15 |
| [Mastodon · GEO 公开标签](https://mastodon.social/tags/generativeengineoptimization.rss) | 20 | 20 | 18 |
| [Mastodon · AI Search 公开标签](https://mastodon.social/tags/aisearch.rss) | 20 | 20 | 20 |
| [V2EX · GEO 生成引擎优化](https://www.v2ex.com/feed/geo.xml) | 2 | 2 | 2 |
| [人人都是产品经理 · GEO](https://www.woshipm.com/tag/geo/feed) | 15 | 15 | 15 |
| [段文杰 · 杰哥 SEO 博客](https://duanwenjie.com/feed/) | 15 | 15 | 4 |

- **Bluesky 是原生账号 RSS。** 已核对 Barry Schwartz、Lily Ray、Glenn Gabe 的公开档案与 feed 身份。例子涉及 AI Mode/AI Overviews 的链接呈现、品牌查询引用、ChatGPT 流量归因。帖子没有独立标题，读取器从正文生成明确带有“帖文节选｜”的摘要标题，保留原帖链接与发布时间；图片、引述帖和完整线程不保证包含在 RSS 中。共享 RSS 读取器默认行为不变，只有公开资讯管线启用此选项。
- **Mastodon 使用具体主题标签 RSS。** `generativeengineoptimization` 与 `aisearch` 有实际近期内容，可含其他实例和联邦博客链接；它们只覆盖该实例当时可见的公开内容。一般 `geo` 标签混入地理信息，`seo` 标签营销噪声较高，未增加这两个泛标签。已接入标签也仍有促销和转载，不能把订阅中的全部帖子看作独立证据。
- **V2EX 是真实节点订阅。** [GEO 节点](https://www.v2ex.com/go/geo)公开提供 RSS；本次两篇帖子均发表于 2026 年 3 月，属于历史讨论，不冒充今日新闻。另检查 `/tag/Geo` 搜索列表，列表时间是最后回复时间，与帖子详情的 `article:published_time` 不同，因此没有把该列表时间当成发帖时间加入 HTML 配置。
- **人人都是产品经理是公开作者社区文章。** [GEO 栏目](https://www.woshipm.com/tag/geo)及原生标签 RSS 可直接读取，例如[“豆包打通抖音，不是GEO的狂欢”](https://www.woshipm.com/ai/6446563.html)。文章和作者可能也有公众号，但本次采集来自该社区本站，不能标为微信平台直采。作者的观点、统计与商业案例需单独核验，仅展示摘要和原文链接。
- **段文杰博客补充中文从业者观点。** feed 有 GEO/SEO 区别与 llms.txt 等内容，例如[讨论 GEO 定义的文章](https://duanwenjie.com/generative-engine-optimization/)。个人实践建议须对照引擎官方文档，不因其描述 llms.txt 就宣称该文件被搜索引擎采用。

本轮未接入：Bing 公开网页搜索 RSS 的四个站点限定查询中，Reddit 查询实际返回 BeReal 等无关结果、CSDN 查询返回泛 ChatGPT 页面，知乎与微信公众号查询为空，且没有发布日期；因此不能据其 RSS 格式正常就视为有价值索引。运营派公开 feed 能取得条目，但没有发布日期，且 `s=GEO` 并未真正限定结果，暂不配置。此前返回 403 的 Reddit/知乎等平台未反复请求，也未绕过登录或验证码。

## HTML 列表与日期

三个 `web_list` 均从实际 HTML 选择卡片、标题、链接和日期，不依赖模拟点击或登录。

| 来源 | 列表选择器 | 标题 | 链接 | 日期 |
| --- | --- | --- | --- | --- |
| Perplexity | `a[href*="/hub/blog/"]:has(time)` | `.min-w-0 > span.text-pretty` | `a` | `time` |
| Profound | `article:has(time)` | `h2` | `a[href^="/blog/"]` | `time` |
| Human Level | `article.cards-blog-loop-element` | `h3` | `a.cards-blog-link` | `.cards-blog-date` |

Perplexity 13/13、Profound 186/186 有可解析日期。Human Level 13 条中 11 条有可解析日期，另 2 条本地化月份格式尚不被现有日期解析器支持；保持未知，不用抓取日期冒充发布日期。后续管线应跳过未知日期或正常获取详情核实。HTML 结构变化需复核选择器。

## 聚合与公开社交的边界

Google News 八种语言的搜索 RSS 是聚合发现通道，保留聚合标签、标题里的发布者后缀及摘要链接，必要时追溯原站。当前 RSS 解析器未单独保留 `<source>` 字段，候选链接为 Google News 跳转地址；不能把 Google 写成原作者，也不能把多次转载视为独立证据。原发布者与规范 URL 的完善应在采集管线中处理。

HNRSS 是第三方 Hacker News 订阅，用户提交的网站并非 HN 官方研究，两个查询源仅记作热度线索。精确 GEO 查询当前最新条目为 2026-06-23；主采集管线按 3 个月回灌可能导入 0 条，公开资讯管线则保留其真实历史日期。AI search 查询补充较宽的公开讨论召回。

Search Engine Land、Reddit 常规 RSS、Webmasters Stack Exchange feed、Moz feed、Otterly feed 等本次普通 HTTP 返回 403，未配置自动采集，也未重复撞访问限制。Reddit SEO、bigseo、TechSEO、GEO_optimization、aeo、LLMTraffic 的公开网页存在可确认，但可浏览入口不等于 feed 稳定可采。Bing News 的 `format=rss` 本次返回 HTML，SISTRIX feed 返回空列表，Conversion Brasil 与 HolisticSEO feed 未通过当前 XML 解析，均未加入自动配置。Human Level 的 feed 不可用，已改为可正常解析的公开 HTML。

X/LinkedIn 的检索需要登录，B 站/微博本次出现验证页；知乎、贴吧等部分入口返回 403；Bluesky、Mastodon、掘金、CSDN、抖音等有客户端页面。它们在目录中保留真实入口及访问条件，未宣称已抓取完整帖子。可在后续采用官方 API、用户提供链接或正常公开的第三方转述发现内容，但转载必须核验身份、日期与出处。

## 选择与证据规则

1. 官方规则优先于行业转述，但平台产品说明不能自动推广到其他平台。搜索机器人、训练机器人、用户请求抓取分开记录。
2. 论文优先保留原文、代码、数据、版本和实验条件；arXiv 预印本不是经过验证的普遍结论，离线引用提升不等于线上获客。
3. 工具厂商与服务商的自报数据保留题集、引擎、地区、时间窗、分母和利益关系；品牌提及、引用、流量、咨询、成交分别记录。
4. 从业者和社区用于发现问题与反例。截图、投票、流量承诺、匿名“成功案例”不能单独当成证据；不因为官网打不开就把二手转述标成官方事实。
5. 同一作者的博客、X、视频与机构官网属于同一来源关系，转载不能累加成独立验证。各平台检索入口是发现通道，不按条目数推算独立来源数。
6. 多语言正文统一用中文摘要并链接原文；保留市场与平台条件。日本、韩国、欧洲、拉美的研究不能默认适用于中文消费端。
7. GEO/AEO 缩写有歧义。筛选使用完整术语及 AI 搜索、来源引用、可见度等上下文，排除地理信息、泛模型发布、无证据的营销承诺。
8. 不把登录页、验证码页、只有客户端外壳的 HTTP 200 记为“抓取成功”。社交平台可走正常公开页面、授权 API、导出或人工提供链接，待凭据/权限就绪才接入自动任务。


## 入口核验台账

以下“核对”表示检查入口、页面标题、公开结果或读取限制，不表示逐篇内容审阅。社交检索入口只验证可访问状态，尚未验证帖子列表完整性。全部状态是本次观测，可能随后变化。

| ID / 来源 | 证据类型 | 接入状态 | 本次观测 |
| --- | --- | --- | --- |
| [Google Search Central](https://developers.google.com/search/blog) · `google-search-central` | official | configured | 项目采集器 10 条，10 条日期可解析；未逐篇审阅 |
| [Google 搜索文档更新](https://developers.google.com/search/updates) · `google-search-updates` | official | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Bing Webmaster Blog](https://blogs.bing.com/webmaster/) · `bing-webmaster` | official | configured | 项目采集器 10 条，10 条日期可解析；未逐篇审阅 |
| [OpenAI News](https://openai.com/news/) · `openai-news` | official | configured | 项目采集器 1296 条，1296 条日期可解析；未逐篇审阅 |
| [OpenAI Crawlers](https://developers.openai.com/api/docs/bots) · `openai-crawlers` | official | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Perplexity Blog](https://www.perplexity.ai/en-GB/hub/blog) · `perplexity-blog` | official | configured | 项目采集器 13 条，13 条日期可解析；未逐篇审阅 |
| [Perplexity Crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers) · `perplexity-crawlers` | official | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [IndexNow](https://www.indexnow.org/documentation) · `indexnow` | official | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Microsoft Clarity AI Visibility](https://learn.microsoft.com/en-us/clarity/ai-visibility/citations-dashboard) · `microsoft-clarity` | official | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [百度搜索资源平台](https://ziyuan.baidu.com/college/index) · `baidu-search` | official | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [百度搜索 API](https://ai.baidu.com/ai-doc/AppBuilder/pmaxd1hvy) · `baidu-search-api` | official | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [火山引擎联网搜索 MCP](https://github.com/volcengine/mcp-server/blob/main/server/mcp_server_askecho_search_infinity/README.md) · `volcengine-search` | official | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [腾讯元宝](https://yuanbao.tencent.com/) · `tencent-yuanbao` | official | manual | HTTP 200 / 客户端页面；未确认结果列表 |
| [Naver Search Advisor](https://searchadvisor.naver.com/guide) · `naver-search-advisor` | official | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [arXiv · Information Retrieval](https://arxiv.org/list/cs.IR/recent) · `arxiv-ir` | research | configured | 项目采集器 26 条，26 条日期可解析；未逐篇审阅 |
| [GEO 原论文与代码](https://github.com/GEO-optim/GEO) · `geo-paper-code` | research | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [SAGEO Arena](https://github.com/happysnail06/SAGEO_Arena) · `sageo-arena` | research | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [ALCE 引用评估](https://github.com/princeton-nlp/ALCE) · `alce` | research | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [ACL Anthology](https://aclanthology.org/) · `acl-anthology` | research | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [ACM SIGIR](https://sigir.org/) · `sigir` | research | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Search Engine Land](https://searchengineland.com/) · `search-engine-land` | editorial | manual | 普通 HTTP 403；公开网页读取确认入口 |
| [Search Engine Journal](https://www.searchenginejournal.com/) · `search-engine-journal` | editorial | configured | 项目采集器 20 条，20 条日期可解析；未逐篇审阅 |
| [Search Engine Roundtable](https://www.seroundtable.com/) · `search-engine-roundtable` | editorial | configured | 项目采集器 15 条，15 条日期可解析；未逐篇审阅 |
| [Abondance](https://www.abondance.com/) · `abondance` | editorial | configured | 项目采集器 10 条，10 条日期可解析；未逐篇审阅 |
| [SEO Südwest](https://www.seo-suedwest.de/) · `seo-suedwest` | editorial | configured | 项目采集器 20 条，20 条日期可解析；未逐篇审阅 |
| [海外SEO情報ブログ · 鈴木謙一](https://www.suzukikenichi.com/blog/) · `suzuki` | editorial | configured | 项目采集器 6 条，6 条日期可解析；未逐篇审阅 |
| [Web担当者Forum](https://webtan.impress.co.jp/) · `webtan` | editorial | manual | 普通 HTTP 403；公开网页读取确认入口 |
| [Cloudflare Blog](https://blog.cloudflare.com/) · `cloudflare` | vendor | configured | 项目采集器 20 条，20 条日期可解析；未逐篇审阅 |
| [Ahrefs Blog](https://ahrefs.com/blog/) · `ahrefs` | vendor | configured | 项目采集器 10 条，10 条日期可解析；未逐篇审阅 |
| [Semrush Blog](https://www.semrush.com/blog/) · `semrush` | vendor | configured | 项目采集器 20 条，20 条日期可解析；未逐篇审阅 |
| [Moz Blog](https://moz.com/blog) · `moz` | vendor | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [SISTRIX 德语博客](https://www.sistrix.de/news/) · `sistrix-de` | vendor | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Screaming Frog Blog](https://www.screamingfrog.co.uk/blog/) · `screaming-frog` | vendor | configured | 项目采集器 10 条，10 条日期可解析；未逐篇审阅 |
| [SearchPilot Resources](https://www.searchpilot.com/resources) · `searchpilot` | vendor | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Profound Blog](https://www.tryprofound.com/blog) · `profound` | vendor | configured | 项目采集器 186 条，186 条日期可解析；未逐篇审阅 |
| [OtterlyAI Blog](https://otterly.ai/blog/) · `otterly` | vendor | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Similarweb Blog](https://www.similarweb.com/blog/) · `similarweb` | vendor | manual | HTTP 202 访问检查；未确认列表正文 |
| [Aleyda Solis](https://www.aleydasolis.com/en/blog/) · `aleyda-solis` | editorial | manual | 普通 HTTP 403；公开网页读取确认入口 |
| [Growth Memo · Kevin Indig](https://www.growth-memo.com/) · `growth-memo` | editorial | configured | 项目采集器 20 条，20 条日期可解析；未逐篇审阅 |
| [Marie Haynes](https://www.mariehaynes.com/blog/) · `marie-haynes` | editorial | configured | 项目采集器 10 条，10 条日期可解析；未逐篇审阅 |
| [Glenn Gabe · GSQi](https://www.gsqi.com/marketing-blog/) · `glenn-gabe` | editorial | manual | 普通 HTTP 403；公开网页读取确认入口 |
| [Brodie Clark](https://brodieclark.com/) · `brodie-clark` | editorial | configured | 项目采集器 10 条，10 条日期可解析；未逐篇审阅 |
| [iPullRank](https://ipullrank.com/blog) · `ipullrank` | vendor | configured | 项目采集器 5 条，5 条日期可解析；未逐篇审阅 |
| [Human Level](https://www.humanlevel.com/blog) · `human-level` | vendor | configured | 项目采集器 13 条，11 条日期可解析；未逐篇审阅 |
| [SISTRIX 西语博客](https://www.sistrix.es/blog/) · `sistrix-es` | vendor | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Agência Mestre](https://www.agenciamestre.com/blog/) · `agencia-mestre` | vendor | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Conversion Brasil](https://www.conversion.com.br/blog/) · `conversion-br` | vendor | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Google Search Central Community](https://support.google.com/webmasters/community?hl=en) · `google-search-community` | community | manual | HTTP 200 / 入口核对；未逐篇审阅 |
| [Reddit · TechSEO](https://www.reddit.com/r/TechSEO/) · `reddit-techseo` | community | requires_api | 公开网页确认入口；普通 HTTP/RSS 403，未自动抓取 |
| [Reddit · BigSEO](https://www.reddit.com/r/bigseo/) · `reddit-bigseo` | community | requires_api | 公开网页确认入口；普通 HTTP/RSS 403，未自动抓取 |
| [X · GEO 公开检索](https://x.com/search?q=%22generative%20engine%20optimization%22&src=typed_query&f=live) · `x-geo-search` | community | requires_api | HTTP 200 后进入登录页；未取得结果列表 |
| [X · AEO 公开检索](https://x.com/search?q=%22answer%20engine%20optimization%22&src=typed_query&f=live) · `x-aeo-search` | community | requires_api | HTTP 200 后进入登录页；未取得结果列表 |
| [X · AI Search 公开检索](https://x.com/search?q=%22AI%20search%22%20(citations%20OR%20SEO%20OR%20visibility)&src=typed_query&f=live) · `x-ai-search` | community | requires_api | HTTP 200 后进入登录页；未取得结果列表 |
| [X · Google SearchLiaison](https://x.com/searchliaison) · `x-searchliaison` | official | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · John Mueller](https://x.com/JohnMu) · `x-johnmu` | community | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Aleyda Solis](https://x.com/aleyda) · `x-aleyda` | community | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Lily Ray](https://x.com/lilyraynyc) · `x-lily-ray` | community | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · iPullRank](https://x.com/iPullRank) · `x-mike-king` | vendor | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Kevin Indig](https://x.com/Kevin_Indig) · `x-kevin-indig` | community | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Barry Schwartz](https://x.com/rustybrick) · `x-barry-schwartz` | community | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [Reddit · SEO](https://www.reddit.com/r/SEO/) · `reddit-seo` | community | requires_api | 公开网页确认入口；普通 HTTP/RSS 403，未自动抓取 |
| [Reddit · GEO 站内检索](https://www.reddit.com/search/?q=%22generative%20engine%20optimization%22&sort=new) · `reddit-geo-search` | community | requires_api | 公开网页确认入口；普通 HTTP/RSS 403，未自动抓取 |
| [YouTube · Google Search Central](https://www.youtube.com/@GoogleSearchCentral) · `youtube-search-central` | official | manual | HTTP 200 / 频道标题核对；未逐集读取 |
| [YouTube · Ahrefs](https://www.youtube.com/@AhrefsCom) · `youtube-ahrefs` | vendor | manual | HTTP 200 / 频道标题核对；未逐集读取 |
| [YouTube · GEO 英文检索](https://www.youtube.com/results?search_query=generative+engine+optimization) · `youtube-geo-search` | community | manual | HTTP 200 / 公开检索入口核对；未逐条审阅 |
| [YouTube · GEO 中文检索](https://www.youtube.com/results?search_query=GEO+%E7%94%9F%E6%88%90%E5%BC%8F%E5%BC%95%E6%93%8E%E4%BC%98%E5%8C%96) · `youtube-geo-zh-search` | community | manual | HTTP 200 / 公开检索入口核对；未逐条审阅 |
| [LinkedIn · GEO 内容检索](https://www.linkedin.com/search/results/content/?keywords=generative%20engine%20optimization) · `linkedin-geo-search` | community | requires_login | HTTP 200 后进入登录页；未取得结果列表 |
| [Hacker News · GEO 检索](https://hn.algolia.com/?query=generative%20engine%20optimization&sort=byDate&type=story) · `hacker-news-geo` | community | configured | 项目采集器 17 条，17 条日期可解析；未逐篇审阅 |
| [Bluesky · GEO 检索](https://bsky.app/search?q=%22generative%20engine%20optimization%22) · `bluesky-geo` | community | requires_api | HTTP 200 / 客户端页面；未确认结果列表 |
| [Mastodon · SEO 标签](https://mastodon.social/tags/seo) · `mastodon-seo` | community | manual | HTTP 200 / 客户端页面；未确认结果列表 |
| [GitHub · GEO 项目检索](https://github.com/search?q=%22generative+engine+optimization%22&type=repositories) · `github-geo-search` | community | manual | HTTP 200 / 公开检索入口核对；未逐条审阅 |
| [知乎 · GEO 检索](https://www.zhihu.com/search?type=content&q=GEO%20%E7%94%9F%E6%88%90%E5%BC%8F%E5%BC%95%E6%93%8E%E4%BC%98%E5%8C%96) · `zhihu-geo` | community | requires_login | 普通 HTTP 403；仅保留人工检索入口 |
| [小红书 · GEO 检索](https://www.xiaohongshu.com/search_result?keyword=GEO) · `xiaohongshu-geo` | community | requires_login | HTTP 200 / 公开检索入口核对；未逐条审阅 |
| [微博 · GEO 检索](https://s.weibo.com/weibo?q=GEO%20AI%E6%90%9C%E7%B4%A2) · `weibo-geo` | community | requires_login | HTTP 200 访客验证页；未取得结果列表 |
| [哔哩哔哩 · GEO 检索](https://search.bilibili.com/all?keyword=GEO%20%E7%94%9F%E6%88%90%E5%BC%8F%E5%BC%95%E6%93%8E%E4%BC%98%E5%8C%96) · `bilibili-geo` | community | requires_login | HTTP 200 验证码页；未取得结果列表 |
| [抖音 · GEO 检索](https://www.douyin.com/search/GEO) · `douyin-geo` | community | requires_login | HTTP 200 / 客户端页面；未确认结果列表 |
| [微信公众号 · 搜狗检索](https://weixin.sogou.com/weixin?type=2&query=GEO%20%E7%94%9F%E6%88%90%E5%BC%8F%E5%BC%95%E6%93%8E%E4%BC%98%E5%8C%96) · `wechat-geo-search` | community | requires_api | HTTP 200 / 公开检索入口核对；未逐条审阅 |
| [掘金 · GEO 检索](https://juejin.cn/search?query=GEO) · `juejin-geo` | community | manual | HTTP 200 / 客户端页面；未确认结果列表 |
| [CSDN · GEO 检索](https://so.csdn.net/so/search?q=GEO%20%E7%94%9F%E6%88%90%E5%BC%8F%E5%BC%95%E6%93%8E%E4%BC%98%E5%8C%96) · `csdn-geo` | community | manual | HTTP 200 / 客户端页面；未确认结果列表 |
| [V2EX · 站长](https://www.v2ex.com/go/webmaster) · `v2ex-webmaster` | community | manual | HTTP 200 / 公开检索入口核对；未逐条审阅 |
| [百度贴吧 · SEO](https://tieba.baidu.com/f?kw=seo) · `baidu-tieba-seo` | community | requires_login | 普通 HTTP 403；仅保留人工检索入口 |
| [note · GEO 检索](https://note.com/search?q=GEO%20AI%E6%A4%9C%E7%B4%A2&context=note) · `note-geo` | community | manual | HTTP 200 / 公开检索入口核对；未逐条审阅 |
| [Qiita · GEO 检索](https://qiita.com/search?q=GEO) · `qiita-geo` | community | manual | HTTP 200 / 公开检索入口核对；未逐条审阅 |
| [Naver Blog · GEO 检索](https://search.naver.com/search.naver?where=blog&query=GEO%20AI%20%EA%B2%80%EC%83%89) · `naver-blog-geo` | community | manual | 普通 HTTP 403；仅保留人工检索入口 |
| [Reddit · GEO_optimization](https://www.reddit.com/r/GEO_optimization/) · `reddit-geo-optimization` | community | requires_api | 公开网页确认入口；普通 HTTP/RSS 403，未自动抓取 |
| [Reddit · AEO](https://www.reddit.com/r/aeo/) · `reddit-aeo` | community | requires_api | 公开网页确认入口；普通 HTTP/RSS 403，未自动抓取 |
| [Reddit · LLMTraffic](https://www.reddit.com/r/LLMTraffic/) · `reddit-llmtraffic` | community | requires_api | 公开网页确认入口；普通 HTTP/RSS 403，未自动抓取 |
| [Webmasters Stack Exchange · SEO](https://webmasters.stackexchange.com/questions/tagged/seo) · `webmasters-stackexchange` | community | manual | 公开社区入口核对；普通 RSS 请求 403，未配置自动采集 |
| [Threads · GEO 检索](https://www.threads.com/search?q=generative%20engine%20optimization&serp_type=default) · `threads-geo` | community | requires_login | HTTP 200 / 公开检索入口核对；未逐条审阅 |
| [Quora · GEO 检索](https://www.quora.com/search?q=generative%20engine%20optimization) · `quora-geo` | community | requires_login | 普通 HTTP 403；仅保留人工检索入口 |
| [X · Google Search Central](https://x.com/googlesearchc) · `x-google-search-central` | official | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Fabrice Canel](https://x.com/facan) · `x-fabrice-canel` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Brodie Clark](https://x.com/brodieseo) · `x-brodie-clark` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Marie Haynes](https://x.com/Marie_Haynes) · `x-marie-haynes` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Glenn Gabe](https://x.com/glenngabe) · `x-glenn-gabe` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Rand Fishkin](https://x.com/randfish) · `x-rand-fishkin` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Cyrus Shepard](https://x.com/CyrusShepard) · `x-cyrus-shepard` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Gianluca Fiorelli](https://x.com/gfiorelli1) · `x-gianluca-fiorelli` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Martin Splitt](https://x.com/g33konaut) · `x-martin-splitt` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Daniel Waisberg](https://x.com/danielwaisberg) · `x-daniel-waisberg` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · 鈴木謙一](https://x.com/suzukik) · `x-suzuki` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · SISTRIX](https://x.com/sistrix) · `x-sistrix` | vendor | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [X · Abondance](https://x.com/abondance_com) · `x-abondance` | editorial | requires_api | HTTP 200 / 账号页面标题核对；未取得完整动态 |
| [SE Ranking](https://seranking.com/blog/) · `se-ranking` | vendor | configured | 项目采集器 15 条，15 条日期可解析；未逐篇审阅 |
| [WordLift](https://wordlift.io/blog/en/) · `wordlift` | vendor | configured | 项目采集器 10 条，10 条日期可解析；未逐篇审阅 |
| [Oncrawl](https://www.oncrawl.com/) · `oncrawl` | vendor | configured | 项目采集器 12 条，12 条日期可解析；未逐篇审阅 |
| [Rich Sanger](https://richsanger.com/) · `rich-sanger` | editorial | configured | 项目采集器 10 条，10 条日期可解析；未逐篇审阅 |
| [Hacker News · AI Search](https://hn.algolia.com/?query=AI%20search&sort=byDate&type=story) · `hacker-news-ai-search` | community | configured | 项目采集器 20 条，20 条日期可解析；未逐篇审阅 |
| [Google News · GEO English](https://news.google.com/search?q=%22generative+engine+optimization%22+OR+%22answer+engine+optimization%22&hl=en-US&gl=US&ceid=US:en) · `google-news-en` | editorial | configured | 项目采集器 100 条，100 条日期可解析；新闻聚合入口，链接需追溯原文 |
| [Google News · GEO 中文](https://news.google.com/search?q=GEO+%E7%94%9F%E6%88%90%E5%BC%8F%E5%BC%95%E6%93%8E%E4%BC%98%E5%8C%96&hl=zh-CN&gl=CN&ceid=CN:zh-Hans) · `google-news-zh` | editorial | configured | 项目采集器 100 条，100 条日期可解析；新闻聚合入口，链接需追溯原文 |
| [Google News · GEO 日本語](https://news.google.com/search?q=GEO+AI%E6%A4%9C%E7%B4%A2&hl=ja&gl=JP&ceid=JP:ja) · `google-news-ja` | editorial | configured | 项目采集器 100 条，100 条日期可解析；新闻聚合入口，链接需追溯原文 |
| [Google News · GEO Français](https://news.google.com/search?q=GEO+%22moteurs+g%C3%A9n%C3%A9ratifs%22&hl=fr&gl=FR&ceid=FR:fr) · `google-news-fr` | editorial | configured | 项目采集器 47 条，47 条日期可解析；新闻聚合入口，链接需追溯原文 |
| [Google News · GEO Português](https://news.google.com/search?q=GEO+%22busca%22+IA&hl=pt-BR&gl=BR&ceid=BR:pt-419) · `google-news-pt` | editorial | configured | 项目采集器 53 条，53 条日期可解析；新闻聚合入口，链接需追溯原文 |
| [SEO 每天一帖 · Zac](https://www.seozac.com/) · `seozac` | editorial | configured | 项目采集器 10 条，10 条日期可解析；未逐篇审阅 |
| [SEO for Lunch](https://www.seoforlunch.com/) · `seo-for-lunch` | editorial | configured | 项目采集器 20 条，20 条日期可解析；未逐篇审阅 |
| [Google News · GEO Deutsch](https://news.google.com/search?q=GEO+KI-Suche&hl=de&gl=DE&ceid=DE:de) · `google-news-de` | editorial | configured | 项目采集器 55 条，55 条日期可解析；新闻聚合入口，链接需追溯原文 |
| [Google News · GEO Español](https://news.google.com/search?q=GEO+%22b%C3%BAsqueda%22+IA&hl=es&gl=ES&ceid=ES:es) · `google-news-es` | editorial | configured | 项目采集器 55 条，55 条日期可解析；新闻聚合入口，链接需追溯原文 |
| [Google News · GEO 한국어](https://news.google.com/search?q=GEO+AI+%EA%B2%80%EC%83%89&hl=ko&gl=KR&ceid=KR:ko) · `google-news-ko` | editorial | configured | 项目采集器 100 条，100 条日期可解析；新闻聚合入口，链接需追溯原文 |
| [Bluesky · Barry Schwartz](https://bsky.app/profile/rustybrick.com) · `bluesky-barry-schwartz` | community | configured | 项目公开读取器 30 条，30 条有发布日期，相关性规则保留 6 条；未逐篇事实核查 |
| [Bluesky · Lily Ray](https://bsky.app/profile/lilyray.nyc) · `bluesky-lily-ray` | community | configured | 项目公开读取器 26 条，26 条有发布日期，相关性规则保留 11 条；未逐篇事实核查 |
| [Bluesky · Glenn Gabe](https://bsky.app/profile/glenngabe.bsky.social) · `bluesky-glenn-gabe` | community | configured | 项目公开读取器 30 条，30 条有发布日期，相关性规则保留 15 条；未逐篇事实核查 |
| [Mastodon · GEO 公开标签](https://mastodon.social/tags/generativeengineoptimization) · `mastodon-generativeengineoptimization` | community | configured | 项目公开读取器 20 条，20 条有发布日期，相关性规则保留 18 条；未逐篇事实核查 |
| [Mastodon · AI Search 公开标签](https://mastodon.social/tags/aisearch) · `mastodon-ai-search` | community | configured | 项目公开读取器 20 条，20 条有发布日期，相关性规则保留 20 条；未逐篇事实核查 |
| [V2EX · GEO 生成引擎优化](https://www.v2ex.com/go/geo) · `v2ex-geo` | community | configured | 项目公开读取器 2 条，2 条有发布日期，相关性规则保留 2 条；未逐篇事实核查 |
| [人人都是产品经理 · GEO](https://www.woshipm.com/tag/geo) · `woshipm-geo` | community | configured | 项目公开读取器 15 条，15 条有发布日期，相关性规则保留 15 条；未逐篇事实核查 |
| [段文杰 · 杰哥 SEO 博客](https://duanwenjie.com/) · `duanwenjie` | editorial | configured | 项目公开读取器 15 条，15 条有发布日期，相关性规则保留 4 条；未逐篇事实核查 |

## 中文公开来源扩展与原帖入口

2026-10-16 使用已落盘的四个新配置，正常 GET 后分别调用项目 `fetchRss` 或 `fetchWebList`，再执行公开管线的 `toPublicCandidates`；没有登录、cookie、API key、付费读取器或模型调用。四个来源均非空，**72 条候选、60 条列表有日期、68 条通过相关性规则**。这是候选级测试，不代表去重后文章数量、事实正确或已入库发布。

| 来源 | 原始候选 | 列表有日期 | 相关性规则保留 | 核验要点 |
| --- | ---: | ---: | ---: | --- |
| [CSDN · V哥AI增长](https://rss.csdn.net/Venture_ai/rss/map) | 20 | 20 | 20 | 原生作者 RSS；个人观点、商业方案与效果自报需核验 |
| [站长之家 · GEO](https://www.chinaz.com/tags/GEO.shtml) | 10 | 10 | 10 | 标签页有推广稿；`.time` 的 `title` 给出完整中国本地时间 |
| [鸟哥笔记 · GEO](https://www.niaogebiji.com/tag/GEO) | 30 | 30 | 28 | 作者投稿、案例与转载；日期精度只有日，不虚构具体发布时间 |
| [运营派 · GEO](https://www.yunyingpai.com/tag/geo) | 12 | 0 | 10 | 列表不含可信发布日期；未知日期保留 null |

可复核原文包括 [CSDN 小预算 AI 搜索优化](https://blog.csdn.net/Venture_ai/article/details/166591959)、[站长之家 GEO 实操复盘](https://www.chinaz.com/2026/1015/1782097.shtml)、[鸟哥笔记品牌 GEO 复盘](https://www.niaogebiji.com/article-709072-1.html) 和 [运营派 Profound 分析](https://www.yunyingpai.com/market/1061220.html)。这些链接证明来源含真实 GEO 内容，不证明文章内的效果结论。

运营派详情的 `span.date` 可能显示滚动的当日文本，不能用作原始发布日期。源码结构化 `pubDate` 可提取，配置为 `detail.publishedAtRegex = "\"pubDate\"\\s*:\\s*\"([^\"]+)\""`、`publishedAtAuthoritative: true`、`maxFetches: 8`，时区 `+08:00`。直接调用现有 `fetchDetail` 实测：上面的 Profound 文章得到 `2026-07-14T10:07:30Z`；[从业者讲述 GEO](https://www.yunyingpai.com/news/1059240.html) 得到 `2026-03-17T01:03:51Z`。列表测试不含详情请求；公开运行器是否补日期以实际运行结果为准，补取失败保持未知。

鸟哥笔记、运营派可能转载或刊发公众号作者文章；配置采的是这些公开网站，**不等于微信平台直采**。只保存标题、有限摘要与链接，不开启全文转载。CSDN 作者 RSS 的原生地址可由 [RSSHub 当前 CSDN 路由源码](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/csdn/blog.ts) 交叉核对；本项目直接读取 CSDN 地址，不依赖 RSSHub 公共实例。

公开运行器现已接入详情日期补全：先筛 GEO 相关内容，再按配置提取原始日期；优先复用已核实日期，分轮完成剩余条目。读取失败不会丢弃文章，状态显示部分完成并留待重试。仅补取日期，不保存详情全文。

目录还新增 [X 公开原帖入口](https://x.com/) 与 [Reddit 公开原帖入口](https://www.reddit.com/r/SEO/)，对应两项 `public-social.json` 配置。二者通过公开链接发现与平台嵌入入口读取有限原帖；不是未登录时间线全采，也不提供全部评论。原帖观点、厂商自报和讨论中的效果说法仍需核验。其实际运行数量由公开社交采集结果单独报告，不计入上述 72 条。

### 本轮没有启用的候选

- 钛媒体公开前端可发现搜索 JSON 地址；同一 `GEO` 查询复测有时返回 GEO 文、有时返回普通最新 AI 新闻。常规 Accept 或静态 `app-version: web1.0` 也未保证一致，暂不接入，不能把 HTTP 200 当成正确检索结果。
- [卢松松博客](https://lusongsong.com/) 有 GEO 原文和转载，首页实测可读 16 个带日期文章，但它是混合最新列表；本轮未接入一个只是碰巧含 GEO 的泛资讯源。
- CSDN 长路作者 RSS 可读 20 条，但当轮 GEO 规则零命中；其 [GEO/SEO 技术分析](https://blog.csdn.net/cl939974883/article/details/167174925) 可人工参考，未据单篇文章扩成自动专题源。
- 36氪公开 RSS 可读，但本轮一般新闻与 GEO 召回弱；搜索页只有客户端状态。虎嗅搜索也没有稳定可用的公开 HTML 结果。RSSHub 公共实例对应搜索路由返回 403，未反复请求；需要签名、验证或挑战处理的路线未移植。
- 微博、知乎、B站等已遇到验证或访问限制的入口继续保留目录状态，不因能打开壳页面而标为已采集。公众号依旧只使用真实公开文章/转载网站，不生成虚构公众号 ID 或 RSS。

## 核验与维护

目录唯一 ID、HTTP(S) 地址、`sourceId` 引用、配置键，以及全文关闭状态已通过脚本检查。48 个源已分三轮完成实际采集器非空读取；无标题社交源使用公开管线的 `titleFromExcerpt` 选项。另两项独立社交配置的 `sourceId` 引用已核对 `public-social.json`。前述数量与日期问题保留为可复核基线。页面构建与仓库级检查由主任务统一执行。

新增来源先确认身份与公开地址，再记录抓取条件；只有正常请求获得真实、非空列表且元数据可解析时，才加入自动源。站点需要运行时监控、失败记录、去重和持续人工校准；这份静态目录不构成“全网实时覆盖”的证明。

