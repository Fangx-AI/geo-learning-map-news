# 高价值 GEO 信源补充核验

核验日期：2026-10-16。按“官方变化、原始研究、可检查的方法、公开数据或有过程证据的作者案例”挑选来源。本轮没有修改评分、分类权重或相关性规则，也没有把来源身份当作逐篇事实核验。

## 原有覆盖与选择理由

本轮之前，53 路普通来源加 2 路独立公开社交采集，共 55 路目录标为 configured：4 路 official、1 路 research、23 路 editorial、10 路 vendor、17 路 community。这是目录的证据类型计数，不是质量分数。已有 Google Search Central、Bing Webmaster、OpenAI、Cloudflare，以及 Ahrefs、Semrush、Growth Memo 等；新闻聚合、社区和营销内容较多，原始研究与实验方法相对少。

因此新增 7 路，补官方产品变化、定向论文、引用准确性研究和实验方法。没有为凑语言或平台数量继续增加普通营销博客。各来源都经过项目现有 `fetchRss` 实际读取，使用 `allowUpdatedAsPublished:false`、`titleFromExcerpt:true`、`includePublisher:true`，再用现有 `toPublicCandidates` 筛选。读取无登录、无 Cookie、无 API key；沿用本机已有正常出网代理，不调用模型、不入库。

## 已配置的 7 路

| source ID / 入口 | 原始候选 / 有日期 / 相关规则保留 | 价值与主要噪声 |
| --- | ---: | --- |
| `rss-google-search-product` · [Google Search 产品 RSS](https://blog.google/products/search/rss/) | 20 / 20 / 7 | 官方产品发布，补充 AI Mode、AI Overviews 的引用链接和来源展示。含购物、节日等产品消息；官方效果主张不是独立评估。 |
| `rss-bing-search` · [Bing Search RSS](https://blogs.bing.com/search/feed/) | 10 / 10 / 6 | 官方搜索索引、grounding 与引用可见度变化，补站长博客。也有图像生成、普通搜索功能和活动。 |
| `rss-arxiv-geo` · [arXiv 精确 GEO 查询 Atom](https://export.arxiv.org/api/query?search_query=all%3A%22generative%20engine%20optimization%22&start=0&max_results=30&sortBy=submittedDate&sortOrder=descending) | 30 / 30 / 30 | 官方 API，按短语检索最近提交的 30 篇，直接链接论文及版本。包含预印本、离线基准、攻击与防御研究，不把摘要当普遍结论。 |
| `rss-tow-center` · [Tow Center / CJR RSS](https://www.cjr.org/tow_center/feed) | 10 / 10 / 1 | 原创数字新闻研究，关注引文准确性、出版商与抓取边界；一般新闻政治研究较多，当前相关密度低，但保留其长期原始研究价值。 |
| `rss-sparktoro-research` · [SparkToro Research RSS](https://sparktoro.com/blog/category/research/feed/) | 10 / 10 / 5 | 研究分类比总博客更集中；搜索点击、推荐稳定性和受众行为。商业面板、合作厂商和作者自己的产品构成利益关联。 |
| `rss-gsqi` · [Glenn Gabe / GSQi RSS](https://www.gsqi.com/marketing-blog/feed/) | 10 / 10 / 7 | 原始站点案例、跨搜索引擎核对和工具操作过程；咨询作者的观察性证据，客户和第三方工具原始数据不一定公开。 |
| `rss-searchpilot` · [SearchPilot RSS](https://www.searchpilot.com/resources/blog/rss.xml) | 10 / 10 / 5 | GEO/SEO 实验设计、控制组和测量方法；销售实验平台，也发布访谈、预测与产品观点。 |

总计 100 条候选、100 条来源提供的明确日期、61 条被现行相关性规则保留。不是 61 篇已通过人工事实核验的结论，也不是 61 条已入库记录；跨来源转载、版本和话题可能重叠。SearchPilot 在最终配置名称中明确 GEO/SEO 语境，现行专题来源规则因此保留《Is GEO Working?》这一条，最终为 5 条而不是初测的 4 条。

## 抽样证据与解释边界

- **Google：**[More ways to connect with the web from Search](https://blog.google/products-and-platforms/products/search/updates-ai-mode-overviews-explore-web/)来自官方产品团队，feed 日期为 2026-10-15 16:00 UTC。它描述 AI Mode/AI Overviews 的链接、来源上下文变化，适合作为功能变化的一手入口；不据此推断网站点击必然增长。
- **Bing：**[Evolving role of the index](https://blogs.bing.com/search/2026/5/Evolving-role-of-the-index-From-ranking-pages-to-supporting-answers/)解释索引从排名页面到支撑生成答案的作用。与 [AI Visibility Insights](https://blogs.bing.com/search/2026/6/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare/)一起用于追踪官方指标与范围，后续仍需核对对应产品文档及可用地区。
- **arXiv：**[Understanding ChatGPT Citations](https://arxiv.org/abs/2610.15382)直接提供作者、提交日期、摘要及论文版本。此入口基于[官方 API 语法](https://info.arxiv.org/help/api/user-manual.html)，每轮最多 30 篇、按提交时间降序。当前公开守护按统一轮次读取，没有使用原引擎的逐源间隔调度。只读到了可检查的论文入口，未逐篇复现；关注生产检索与最终引用的区分，不能把名称含 GEO 当作方法可靠。
- **Tow Center：**[AI Search Has a Citation Problem](https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php)列明 8 种生成式搜索工具、20 家出版商、每家 10 篇文章、1600 次查询，以及正确/缺失/部分错误等人工标注标准。输入任务是从给定摘录找文章，不能把其错误率外推到所有自然用户查询。此文是历史方法样本，不伪装为当前首屏 RSS 的新文章。
- **SparkToro：**[推荐稳定性研究](https://sparktoro.com/blog/new-research-ais-are-highly-inconsistent-when-recommending-brands-or-products-marketers-should-take-care-when-tracking-ai-visibility/)说明志愿者、重复提示和答案归一化过程，并区分列表顺序与出现比例；文章明确提到与 Gumshoe 员工合作。它适合讨论采样与测量稳定性，不能据一次固定样本证明所有可见度工具有效或无效。
- **GSQi：**[Surging in ChatGPT, Dead in Google](https://www.gsqi.com/marketing-blog/surging-in-chatgpt-dead-in-google/)给出跨 Google、Bing 和 ChatGPT 的检查过程、可见度图表及后续更新。样本受作者选择和商业工具覆盖影响，文中有关底层检索来源的推断应与平台已披露事实分开。
- **SearchPilot：**[SEO A/B 测试方法](https://www.searchpilot.com/resources/blog/the-math-behind-searchpilot-how-seo-ab-testing-actually-works)解释页面层级控制/变体组、反事实估计和可信区间，优于只报增长百分比的案例。厂商实现和客户数据未必完整开放，方法说明不等于本项目独立复现，也不能把传统 SEO 测试结果直接套用所有生成式引擎。

## 本轮没有自动接入的候选

- **保哥笔记：**[GEO/AEO 列表](https://zhangwenbao.com/geo-aeo/)可读 20 条、20 条明确日期、10 条相关；[句子与品牌落款实测](https://zhangwenbao.com/sentence-portability-brand-anchor-audit.html)有样本获取、规则判据、对照语料和错误修正过程。但本轮没有找到完整原始数据与可运行实现来独立重做。保留为目录 `manual` 候选，不新增自动 source；商业服务与自报数据需继续核验。
- **SEO 技术流：**[列表](https://www.zhidaow.com/blog/)可读 18/18/12。抽样[“Google GEO 排名因素”](https://www.zhidaow.com/blog/google-geo-ranking-factors-2026/)明确链接 Zyppy 原文，实质是专家调查的中文解读，不能当作 Google 公布的真实权重。当前优先补原始来源，暂不接该二次解读源。
- **张小吉博客、CSDN 亨贵：**分别可读 49/49/9 和 20/20/13；本轮没有继续核实足够的原创方法与数据，暂不自动接入。相关性命中不等于质量合格。
- **Pew Research：**[Google AI 摘要点击研究](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)有明确浏览面板与采集方法，值得作为研究参考。但两个看似主题 RSS 的地址都返回全站近期 100 条、0 条相关；不能把 HTTP 200 当作该专题订阅成功，因此未配置。未据此认定 Pew 网站不可读。
- **Seer Interactive AI Study：**专题 RSS 普通 GET 返回 403，停止该路径，不通过访问墙、不把网页检索摘要当作读取成功。
- **SparkToro 总 RSS：**10 条中仅 1 条命中，并有产品公告；换为已验证的 Research 分类，未把两个 feed 重复加入。

## 配置与验证

普通来源现为 60 路：48 RSS/Atom、10 HTML 列表、2 JSON。加独立 X/Reddit 2 路，目录共 62 条 `configured`；目录总数 142。`configured` 表示存在采集配置，不证明后台已运行。每条仍只展示摘要和链接，全文开关均关闭。GSQi 和 SearchPilot 更新原有目录记录，避免重复建档。

`node --test modules/geo-directory/tests/directory.standalone.test.ts` 5/5 通过；7 路实际配置均通过 `assertSupportedConfig` 和公开源检查。只读审计保存在本机 `.data/quality-final-audit.json`，不提交缓存正文。没有启动全源采集、改动数据库服务或新增 backend 适配器；正式入库与运行状态由根任务完成迁移后验收。

随后正式采集已在 2026-10-16 20:04 北京时间完成：7 路均为 `ok`，相关条数为 7、6、30、1、5、7、5，共 61 条。全站累计 URL 去重后 1,309 条，62 路配置中 61 路正常、1 路 X 引用文章待重试。采集数不替代质量评估；61 条标题/摘要及边界原文抽查发现 3 条 Google 消费者教程、1 条偏传统 SEO 的 GSQi 案例，详见 [编辑标准中的真实样本](geo-editorial.md)。未将它们宣称为已核验的高价值研究。
