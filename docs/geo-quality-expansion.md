# GEO 高价值来源扩充与图片核验

核验日期：2026-10-16。先检查现有 60 路普通来源，避免重复接入；本轮只增加已通过现有读取器的 3 路。优先能检查方法、样本或原始观察的内容，不把品牌、机构身份、文章数量当成质量保证。保留全球覆盖方向，不为了补齐平台或语言数量接入低质量列表。

测试通过正常公开 GET 和本机已有出网代理完成，无登录、Cookie、API key、模型调用或入库。图片只检查 HTML 元数据及匿名 HEAD，没有下载媒体。原始研究数据由来源提供，本项目未独立复现实验。

## 已配置

| source ID / 入口 | 读取 / 明确日期 / 当前规则保留 | 背景与边界 |
| --- | ---: | --- |
| `rss-dejan` · [DEJAN RSS](https://dejan.ai/feed/) | 20 / 20 / 5 | `vendor`；原创检索测量、提示与模型条件拆分，机构销售 SEO/AI 服务。订阅混合观察、方法、营销及一般 AI 技术，不全部视为研究。 |
| `rss-zyppy-signal` · [Zyppy Signal RSS](https://signal.zyppy.com/feed) | 17 / 17 / 9 | `editorial`；原始专家调查、研究综述与实践方法，作者提供商业咨询。专家观点评分不是平台真实权重；综述不是独立复现实验。 |
| `json-pew-ai-summaries` · [Pew 公开 JSON 查询](https://www.pewresearch.org/wp-json/wp/v2/short-read?search=AI%20summaries&per_page=30&_fields=id,link,title,excerpt,date_gmt) | 5 / 5 / 2 | `research`；官方 Short Reads 的定向搜索，提供原始摘要与 GMT 时间，每轮上限 30。不是全站 RSS；初测漏掉的 Google 点击研究已通过窄规则修正。 |

合计 42 条读取候选、42 条来源明确日期，Pew 漏召回修正后相关性规则保留 16 条（初测为 15 条）。它们不是 16 条经过逐篇质量核验的研究，也不代表已正式入库。配置中的 360 分钟是原引擎建议间隔；当前公开守护按统一轮次调度，并不逐源执行该间隔。

### 方法与数据证据

- **DEJAN：**[OpenAI fanout 观察](https://dejan.ai/blog/site-fanouts/)公开 196,692 条 OpenAI 查询的分月、模型版本和提示模式统计，并解释与另一研究结果不同的可能原因。作者明确区分 Responses API 与 ChatGPT 用户界面，承认没有固定同一提示做跨界面对照。适合保留为有方法边界的原始观察；不能宣称推翻另一界面的测量，也不把其开放文章等同于开放全部原始数据。
- **Zyppy：**[Google AI Ranking Factors](https://signal.zyppy.com/p/google-ai-ranking-factors)公开 131 位专家的调查量表，测量专家对因素的看法；不是 Google 公布的权重，也不是控制变量实验。[54 项资料综述](https://signal.zyppy.com/p/ai-citation-ranking-factors)说明作者按重复性、证据和官方支持人工评分，明确相关性不是因果。此类资料有梳理价值，正文中的强断言仍需追到原始研究。
- **Pew：**[Google AI 摘要点击研究](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)使用 900 名美国成人的浏览面板，包含 68,879 次独立 Google 搜索。用户行为记录来自 2025 年 3 月，搜索结果在 4 月重新采集；地区、面板选择及重采时间差都限制外推，8% 与 15% 的差异不是随机实验因果。问卷类文章与浏览行为研究也应分别标注。

### Pew 的真实漏召回

标题：`Google users are less likely to click on links when an AI summary appears in the results`。

原始 URL：[Pew 点击研究](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)。公开 JSON 确实返回这条，`date_gmt` 保留为 GMT，不用采集时间代替发布时间。`fetchJsonList` 可读其摘要，但初测时标题和短摘要使用 `Google`、`AI summary`、`results`、`click`，没有旧规则要求的 `search` 等信号，因而被过滤。

主任务随后增加有上下文约束的 AI summary/summaries 识别，同时要求 Google 与结果/点击信号。新增独立回归测试覆盖这个真实正例及 5 条泛 AI、会议摘要和一般搜索结果负例，2/2 通过；重新用正式配置读取 Pew，5 条中保留 2 条，原文标题和日期均未改写。来源研究任务没有修改 backend 实现。

Pew 接入绕开了两个无效方案：主题路径和 `feed/?cat=299` 返回全站近期 100 条，不能称为定向订阅；AI 主题 HTML 返回 13 条有日期文章，但当前仅取标题的 `fetchWebList` 保留 0 条。站内搜索 HTML 可读 10 条，去掉 newsletter 后有 6 条，但仍只有 1 条匹配。正式采用公开 WordPress `short-read` JSON，避免 newsletter 混入，并保留来源摘要。

## 未增加自动来源的候选

- **Seer AI Study：**[研究列表](https://www.seerinteractive.com/insights/tag/ai-study)普通 GET 返回 403。停止该路线，不绕访问检查，不把搜索引擎摘要冒充采集成功。
- **Similarweb AI Search：**[专题列表](https://aisearch.similarweb.com/blog/)普通 GET 200，现有 `fetchWebList` 可读 13 条，其中 12 条有列表日期、7 条命中。命中项混有工具榜单、术语表和厂商推广，而部分原始面板文章标题未命中。先不整体接入。抽样[推荐后的访问行为文章](https://aisearch.similarweb.com/blog/after-ai-recommends-your-brand/)讨论美国桌面用户、指定时间窗和品牌对的后续访问，不能把面板关联直接改写为因果；需找到更集中的研究订阅或完善摘要处理后再考虑。
- **Originality.ai：**[AI Studies](https://originality.ai/categories/ai-studies)列表可读 100 条，3 条命中，当前列表配置未提取可靠日期。大量内容讨论自身检测器；[AIO 引用与排名研究](https://originality.ai/blog/google-ranking-ai-citations-study)明确先排除了不在前 100 搜索结果的引用，所以其“52%”不能当作所有 AIO 引用的比例。暂不为增加源数接入这个混合列表。
- **SISTRIX：**[根 RSS](https://www.sistrix.com/feed/)可读 10 条、10 个日期、7 条相关；`/blog/feed/` 返回 0 条，不能当作成功源。机构有[引用稳定性研究](https://www.sistrix.com/blog/ai-citation-drift-how-stable-are-sources-in-ai-search-results/)，公开 82,619 提示、六国、三平台、17 周及域名层级指标边界；但当前 RSS 含产品更新与综述。保留既有目录入口，未再新增自动来源，避免把品牌直接等同于研究质量。
- **Zyppy 主站 `/feed/`：**正常重定向到营销首页，不是 RSS；只采用已验证的 Signal 订阅。

## 原文图片可访问性

以下文章 HTML 均匿名 GET 200，并提供 `og:image`。对应图片地址的匿名 HEAD 均返回 200 和图片 MIME；没有下载图片字节，因此不宣称验证了每张图片的视觉内容或每次 GET 的稳定性。原文公开可访问，也不自动授予转载或缓存授权。

| 抽样文章 | 公开图片元数据 | HEAD |
| --- | --- | --- |
| DEJAN fanout 观察 | [og:image](https://dejan.ai/og/post/site-fanouts.jpg) | 200 · image/jpeg |
| Zyppy 专家调查 | [og:image](https://substackcdn.com/image/fetch/$s_!DXZ9!,w_1200,h_675,c_fill,f_jpg,q_auto:good,fl_progressive:steep,g_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F62e50df3-d449-46eb-8c04-0d5f9fdc0c0f_1200x630.png) | 200 · image/jpeg |
| Pew 点击研究 | [og:image](https://www.pewresearch.org/wp-content/uploads/sites/20/2025/07/SR_25.07.22_ai_summaries_featured.jpg?w=1200&h=628&crop=1) | 200 · image/jpeg |
| Similarweb 后续访问研究 | [og:image](https://static-us-east-1.similarcdn.com/corporate/uploads/sites/3/2026/10/attachment-What-happens-after-an-ai-recommendation.png) | 200 · image/png |

图片显示应与文章摘要和原链接保留来源关系。来源未提供封面或加载失败时允许无图，不生成替代的“研究图表”，也不把 og:image 当成文章中的实证图表。

## 配置范围

本轮后普通来源为 63 路：50 RSS/Atom、10 HTML 列表、3 JSON。加独立公开 X/Reddit 两路，目录共 65 条 configured，目录总数 145。全部新增源仍关闭站点全文和全文再分发；configured 只表示配置存在，运行与成功状态以采集接口为准。本轮未启动全源采集、服务、模型或数据库操作。
