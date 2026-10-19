# 2026-10-17 一手来源扩充核验

本轮在现有 63 路普通公开来源上新增 5 路，优先补充官方搜索文档、测量口径、作者原始观察及引用评估论文。目录现为 149 个入口，其中 70 个 `configured`：68 路普通来源与独立 X / Reddit 两路。数量只表示配置范围，不能当成已成功运行、全球完整覆盖或逐篇质量认证。

最终实读时间为北京时间 2026-10-17 07:08。使用正式配置、现有 `fetchRss`、列表准入、GEO 相关性和发布日期范围过滤进行只读试采；采用现有正常出网代理，不附带登录 Cookie 或 API key，不调用模型、不写数据库、不启动守护。仅接入订阅中的标题、原始短摘要、日期、原文链接及图片元数据，不下载论文 PDF，不开展原文全文采集或全文再分发。

## 实读结果

“图片”列是通过现有图片规则的订阅元数据条数，仍可能包含来源已失效的地址，不能等同于图片下载成功。全部新来源保持 `site_fulltext=false` 和 `syndicate_fulltext=false`。

| source ID / 公开入口 | 读取候选 | 来源日期 | GEO 规则保留 | 保留条目日期 | 图片元数据 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `rss-google-search-doc-updates` · [Google 官方文档 RSS](https://developers.google.com/search/updates/search_docs_updates.rss) | 42 | 42 | 5 | 5 | 0 |
| `rss-microsoft-clarity` · [Microsoft Clarity RSS](https://clarity.microsoft.com/blog/feed/) | 10 | 10 | 6 | 6 | 3 |
| `rss-brave-search` · [Brave Search 分类 RSS](https://brave.com/category/brave-search-news/index.xml) | 10 | 10 | 9 | 9 | 6 |
| `rss-suganthan-research` · [Suganthan RSS](https://suganthan.com/rss.xml) | 52 | 52 | 21 | 21 | 21 |
| `rss-arxiv-ai-citations` · [arXiv 官方 Atom API](https://export.arxiv.org/api/query?search_query=(all%3A%22AI%20search%22%20OR%20all%3A%22generative%20search%22)%20AND%20(all%3Acitation%20OR%20all%3Acitations)%20ANDNOT%20all%3A%22generative%20engine%20optimization%22&start=0&max_results=30&sortBy=submittedDate&sortOrder=descending) | 30 | 30 | 28 | 28 | 0 |

合计读取 **144 条**，全部带来源发布日期；规则保留 **69 条**，其中 **30 条**带图片元数据。以上为当前响应快照，不是历史回填完成量。RSS 由发布方决定保留范围；arXiv 只请求查询排序后的最近 30 条。公开守护按统一轮次读取，配置中的 360 分钟为原引擎间隔，不代表公开守护逐源严格采用该间隔。

## 选择依据与原始样例

### Google 搜索文档更新

[官方更新目录](https://developers.google.com/search/updates)提供机器可读订阅，能直接核对生成内容、AI 搜索和爬虫规则修订。它与既有 Search Central 博客及 Google Search 产品博客分属不同入口。本轮复用目录中的 `google-search-updates`，由手动入口改为已配置订阅，未另建重复目录卡片。

这个订阅的不同更新会共用同月页面链接。仅按 URL 身份去重会丢失同月的多个公告，`preserveUrlFragment=true` 也无法区分同一个月内的公告。因此该源在与 `config` 并列的顶层显式使用模块字段 `publicEntryIdentity="feed-id"`：以订阅 URL 与官方 GUID 生成条目标识，仍保留实际原文链接，不伪造公告路径。其他普通 RSS 保持原有 URL 身份。缺少有效 GUID / Atom ID 的条目不自行编造身份。该字段不进入共享 RSS 配置，正常初始化与共享读取器的配置校验继续有效。

同一次 42 条响应对比：旧 URL 身份只保留 3 条，新身份保留 5 条，得到 5 个不同条目 ID、3 个真实页面 URL。恢复的是五月同月的优化指南及垃圾内容政策公告，并非重复抓取增加的条数。十月生成内容指南和六月 llms.txt 公告的原始标题、日期、链接均保留。

日期是公告的 RSS 发布时间，不代表文档第一次发布或某项功能正式上线时间。文档公告中与 GEO 无直接关系的常规搜索修订仍经过相关性筛选。

### Microsoft Clarity

[爬取与引荐分析公告](https://clarity.microsoft.com/blog/scrape-to-referral-insights/)于 2026-08-13 发布，解释 AI 爬取、实际引荐和域名覆盖的一致性；这类原始指标口径比二手“提升引用”的解读更有价值。[引用查询主题分析](https://clarity.microsoft.com/blog/analyze-ai-citation-queries-by-topic/)于 2026-07-22 发布，可追踪产品本身如何定义和组织查询。

目录标为 `official`。这是平台自己的产品与测量说明，包含推广，不是本站独立效果验证。RSS 中一般 SaaS 变现与 AI 辅助发布流程的条目被排除；某些没有明确 AI 上下文的爬虫分类公告可能漏收，不能把每个被过滤条目都当成噪声。原有 Clarity 文档目录入口继续保留，新增的是博客订阅入口。

### Brave Search

选择官方 Search 分类的 `index.xml`，而非全站浏览器、广告或加密货币动态。猜测的 `/category/brave-search-news/feed/` 返回 404，未用于配置。

[LLM Context API 公告](https://brave.com/blog/most-powerful-search-api-for-ai/)的订阅日期为 2026-02-12；原文后来加入六月评测及九月修订，不能把后续修改时间冒充首次发布。原文报告 1,500 条查询、模型裁判及两种比较顺序，也说明没有公开查询集。可用于追踪官方接口变化与厂商自报实验，不能因此宣称外部独立复现或普遍优于其他引擎。[AI grounding 发布](https://brave.com/blog/ai-grounding/)也是明确的原始产品入口。

目录标为 `official` 并说明商业背景。当前匹配项也包含 API 增长、采购渠道和使用案例，相关性通过不等于高阅读优先级；纯地图端点公告在没有 AI 上下文时被排除。本轮不修改阅读排序或主模型评分门槛。

### Suganthan 作者研究

[后续复测与自我修正](https://suganthan.com/blog/how-chatgpt-picks-sources-part-2/)公开不同地区、账号及时间产生的差异，也修正了作者先前的过度推断。订阅给出首次发布日期 2026-07-14，原文显示后来在 2026-09-30 更新；读取器保留前者。[Gemini 引用检查](https://suganthan.com/blog/gemini-citations/)于 2026-10-12 发布，包含作者工具与具体分析步骤。

目录标为 `editorial` / 实践作者，明确作者经营 Snippet Digital 和 Keyword Insights。观察账号有限，逆向观察不能替代平台契约，文章中卖工具或服务的部分也不能充当效果证据。本轮仅读取作者公开文章订阅，不运行文章中涉及账号或浏览器会话的操作。普通图片 SEO、非 AI 的 Search Console 查询工具被排除；AI 与搜索交叉的工具教程仍可能保留。

### arXiv 引用与评估论文

使用[官方 API](https://info.arxiv.org/help/api/user-manual.html)检索 `(AI search OR generative search) AND citation(s)`，排除明确的 `generative engine optimization` 短语，并按首次提交日期降序取 30 条。与已有完整 GEO 短语查询的同次最近 30 篇，按去掉版本后缀的 arXiv ID 比较，本次 28 条匹配论文重叠为 **0**。这仅证明两个查询当前窗口有增量，不保证与 cs.IR 订阅或已有全库历史完全不重叠。

- [新闻消费随机现场实验](https://arxiv.org/abs/2609.38946v1)：2026-09-30 首次提交，作者报告 37,561 名《华盛顿邮报》读者的实验。样本、媒体场景和实验界面限定了外推范围；没有据此改写为所有 AI 搜索的流量规律。
- [百度、Google 与健康信息引用比较](https://arxiv.org/abs/2609.06798v1)：2026-09-06 首次提交，提供跨平台与地区的引用评估，补充纯英语 SEO 视角。
- [中文生成式搜索引用实测](https://arxiv.org/abs/2607.15771v1)：2026-07-17 首次提交，直接对应中文平台的来源发现和引用问题。
- [生成式搜索可验证性评估](https://arxiv.org/abs/2304.09848v2)：保留 2023-04-19 首次提交日期及 v2 链接，历史论文不会因再次采集被变成“最新研究”。

目录标为 `research`。arXiv 是论文托管与检索平台，作者、数据及方法须逐篇核对；预印本不自动等于同行评审或已复现实验。旧的天文检索平台、地图搜索论文被 GEO 规则排除。初测有两条真实漏收：[来源关系审计](https://arxiv.org/abs/2609.29145v2)与[生成式搜索曝光研究](https://arxiv.org/abs/2601.01750v1)明确讨论 generative search，却缺少旧规则识别的 AI/GEO 组合。主任务增加有词边界的直接术语 `generative search` 后，使用正式配置重新读取，保留量从 26 增至 28，两条均恢复；原始标题、摘要、日期没有改写。原始 Candidate 快照已单独保留供本地审计，回归用例中的简化句与真实原文区分记录。

## 图片元数据抽验

从 30 条匹配项的配图元数据中，对 8 个实际地址执行匿名 HEAD，响应体均为 0 字节；7 个返回 200 且 MIME 为图片，1 个返回 404。没有下载或视觉判断图片，不把封面当成研究数据图表。

| 范围 | HEAD 结果 | 边界 |
| --- | --- | --- |
| Clarity 引用主题公告 1 张 | 200，image/png | 其余 Clarity 图片元数据未逐张检查 |
| Suganthan Gemini 文章 1 张 | 200，image/jpeg | 其余作者配图未逐张检查 |
| Brave 当前匹配项全部 6 张 | 5 个 200、1 个 404 | [hackathon 文章](https://brave.com/blog/alphasignal-hackathon/)的 RSS 图片地址失效；其他 5 个为 JPEG/PNG |
| Google 文档 / arXiv | 订阅无可用图片元数据 | 不生成替代图片，也不把平台 Logo 计为文章图 |

Brave 的失效地址为 `https://brave.com/blog/alphasignal-hackathon/alphasignal-hackathon.jpeg`。来源内容可读不代表它的每个附件都有效；页面应使用现有图片失败收起机制，不能把 30 条图片元数据写成 30 张已验证可展示封面。

## 暂未增加的候选

- **QueryBurst：**[研究方法说明](https://queryburst.com/research/)明确区分观察、推断与工作模型，值得继续跟踪；它仍是商业工具提供方。`/feed/` 返回 404，[公开博客列表](https://queryburst.com/blog/)通过现有 HTML 读取器得到 7 条有日期记录，但只有标题、没有摘要，现规则仅保留 3 条。2026-09-08 的 `/prompt-tracking/` 等关键方法文章反而漏收，暂不把不完整读取标为可用研究订阅；需要有证据的摘要解析支持后复核。
- **Raptive：**公开根 RSS 可读 10 条、均有日期，当前只保留 2 条，混有产品与商业案例。较有价值的[来源信任调查](https://raptive.com/blog/trust-in-ai-answers-raptive-research/)由广告与出版商业务方发布，报告 2026 年 9 月 3,083 名美国消费者样本；标题摘要的表述未触发现有 GEO 规则。暂不以混合根订阅补数量，等待更聚焦的研究入口。它测量自报信任和来源偏好，不能视为真实引用排名或点击实验。
- **SISTRIX / Seer：**沿用[前轮记录](geo-quality-expansion.md)；未对已遇到访问检查的入口反复尝试，也没有把搜索结果摘要当成原站采集成功。

## 配置与检查

主任务集成时进一步核对了阅读排序：在 1,390 条历史摘要快照与上述两篇真实论文上回放，补入有词边界的 `generative search` 直接术语后，历史 1,390 条分档不变；来源关系审计论文由补充线索升为优先阅读，曝光研究由补充线索升为相关资料。排序策略版本更新为 2，旧分页游标不能混用新规则；没有调整评分数字或放松推广、转载的降权条件。

正式采集发现 Google 五条公告均提供同一张 Search Central 全站宣传图 `home-social-share-lockup.jpg`。已针对这个确切站点地址排除并清除本轮误收的五张占位封面，保留真正文章配图的处理方式。没有把无图公告包装成五张有效文章图。

新增配置位于 `industry/sources.json`，目录更新位于 `industry/source-directory.json`。普通来源现为 55 路 RSS/Atom、10 路网页列表、3 路公开 JSON。配置中的 `configured` 表示可以进入下轮统一采集，不表示此次研究任务已经正式入库。

已完成 `npm run typecheck`，全部通过；目录、OPML、显式订阅条目标识、相关性及公开读取边界的独立检查 `node --test modules/geo-directory/tests/directory.standalone.test.ts modules/geo-directory/tests/public-feed-identity.standalone.test.ts modules/geo-directory/tests/public-feed.standalone.test.ts`，12/12 通过。网络实读不是测试套件中的外部请求；上述测试只核对本地配置与固定样例。本轮未运行全套数据库测试，由主任务统一集成验收。

## 主任务实际接入

上述五路来源已正式采集，首批 **69 条入库、69 条中文翻译完成**。新增来源已进入持续采集守护。最后完整一轮 70/70 来源成功；去重、排序、图片和运行状态见[集成验收](geo-validation-20261017.md)。Brave 一条 RSS 图片地址实际返回 404，已改用同篇官方页面的有效封面并排除该失效 RSS 地址；不把订阅中的图片元数据数量当作有效图片数量。
