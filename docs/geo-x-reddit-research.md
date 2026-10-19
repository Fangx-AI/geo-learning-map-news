# X / Reddit 公开免密钥采集核验

核验日期：2026-10-16。本机普通 HTTP GET 实测；没有登录、Cookie、账户 API key、付费内容服务或模型调用。这里记录的是可运行的覆盖范围，不是平台全量数据承诺。

## 已启用的路径

`industry/public-social.json` 独立配置两条来源，不冒充主 AI 管线支持的 source 类型：

| sourceId | 读取方式 | 首轮发现 / 成功读取 | GEO 相关入库 | 最终状态 |
| --- | --- | --- | --- | --- |
| `public-x-geo` | 原帖 ID → X 公开嵌入 JSON | 8 / 8 | 6 | ok |
| `public-reddit-geo` | 原帖 URL → Reddit 公开嵌入 HTML | 4 / 4 | 3 | ok |

其中不相关的 2 条 X 和 1 条 Reddit 内容通过 GEO 关键词筛选排除。这里的“相关”只表示主题相关，不表示内容、效果或商业主张已经核实。Reddit 首次尝试的文本帖使用不同标题元素，修正后再次实采成功；核验文件保留初轮结果和最终状态以便追溯。

随后扩充作者博客和订阅入口，X 新读取 32 条、相关 9 条，Reddit 新读取 3 条、相关 2 条。累计已读取 40 条 X、7 条 Reddit，发布 **15 条 X、5 条 Reddit GEO 相关原帖**，其余不进入公开流。这里只记录本次实测，实时数值以站内筛选结果为准。

继续从公开网页索引人工检索已知链接，加入 4 个 X、16 个 Reddit 种子，并由同一平台读取器核验：20 个全部读到，新增 3 条 X 与 16 条 Reddit GEO 内容。当前累计读取 **44 条 X、23 条 Reddit**，公开 **18 条 X、21 条 Reddit**。新 Reddit 内容覆盖 TechSEO、SEO、bigseo、GenerativeSEOstrategy、GEO_optimization、MarketingFR 等社区；保留赞同、质疑与实践观点，不把作者自述当成已经验证的效果。

索引仅用于发现原帖 URL，标题、作者、日期与节选仍读取原始嵌入页；没有把搜索摘要拼成原帖。索引种子由本次人工检索补入 `seedUrls`，不声称搜索引擎查询已经自动定时化。后续自动发现仍由下列公开 RSS / 文章入口完成。可追溯的补充样例包括 [TechSEO 的 AI 搜索讨论](https://www.reddit.com/r/TechSEO/comments/1jb9dt8/)、[bigseo 的学习问题](https://www.reddit.com/r/bigseo/comments/1s9dpxu/)、[Tim Soulo 的 AI 搜索播客帖](https://x.com/timsoulo/status/2049183614378897449)；本机发现清单在 `.data/public-index-seeds.json`。

### X

实现参考 [Vercel react-tweet 的官方源码](https://github.com/vercel/react-tweet/blob/main/packages/react-tweet/src/api/fetch-tweet.ts)。源码使用 `cdn.syndication.twimg.com/tweet-result`，请求参数中的校验值完全由公开帖子 ID 计算，不是账户 token。程序仅在此固定公开嵌入端点构造该参数；对外链接始终是原始 `x.com/<author>/status/<id>`。通用公开 URL 安全检查仍拒绝凭据参数。

保存原帖作者、`created_at` 发布日期，以及 360 字符内的节选（需要时另附省略号）；没有标题的帖子标记“帖文节选”。公开响应文本先在内存中参与相关性判断，再限制存储长度，避免关键词位于后段时漏收。长帖也可能在嵌入响应中已经截断，绝不把短文本标成全文。格式错误、ID 不符、无有效发布日期、Tombstone 响应都不作为新内容发布。

已核验样例：

| 原帖 | 主题概述 | 原帖发布时间（UTC） | 发现方式 |
| --- | --- | --- | --- |
| [Aleyda Solis / 2102833479960457306](https://x.com/aleyda/status/2102833479960457306) | AI 搜索的站内内容与站外引用 | 2026-09-23 18:52:25 | [Michel Fortin 公开文章](https://michelfortin.com/ai-visibility-audit/) |
| [Lily Ray / 2072956245179257077](https://x.com/lilyraynyc/status/2072956245179257077) | GEO 工作中的技术职责讨论 | 2026-07-03 08:10:57 | [Pici 公开报告](https://pici.id/reports/siapa-yang-harusnya-handle-geo/) |
| [Aleyda Solis / 1955897205082001864](https://x.com/aleyda/status/1955897205082001864) | AI 爬虫访问检查工具 | 2025-08-14 07:40:07 | 已知公开链接种子 |

### Reddit

[Reddit 官方介绍了供站外分享的公开嵌入工具](https://redditinc.com/news/2023socialsharingupdates)。实测 `embed.reddit.com/r/<community>/comments/<id>/` 无需登录即可返回目标帖的可见 HTML。

读取器只解析目标 `t3_<id>-embed-wrapper` 内的标题和短节选。发布日期须同时满足：目标帖的 header 时间、对应 `post.id` 的 `created_timestamp` 一致，并且嵌入链接对应请求原帖。页面会话时间、抓取时间和评论时间不能填充为帖子发布时间。卡片来源包含 `Reddit · r/社区 · u/作者`，点击保留原帖链接。原文语言未能确定时标记 `und`，不根据页面界面语言猜测帖文语言。

| 原帖 | 主题概述 | 原帖发布时间（UTC） |
| --- | --- | --- |
| [r/SEO / u/WebLinkr](https://www.reddit.com/r/SEO/comments/1ss0drr/why_chatgpt_cites_one_page_over_another_study_of/) | 分享 ChatGPT 页面引用研究 | 2026-04-21 20:51:35.436 |
| [r/seogrowth / u/mouchael](https://www.reddit.com/r/seogrowth/comments/1ueosr5/how_different_is_seo_vs_geo_generative_engine/) | SEO 与 GEO 的区别问答 | 2026-06-24 20:21:27.527 |
| [r/LLMTraffic / u/Complete-Respect6950](https://www.reddit.com/r/LLMTraffic/comments/1t44tn7/which_geo_marketing_agencies_are_actually_worth/) | GEO 服务商讨论 | 2026-05-05 04:15:35.826 |

## 持续发现与刷新

每次现有公开采集 watch 执行时都会读取发现入口，提取其中真实的 X / Reddit 原帖链接，再交由平台自己的公开嵌入读取器核验。当前入口是：

- [Michel Fortin Atom](https://michelfortin.com/feed/atom/)：文章内公开引用的 X 链接。
- [Growth Memo RSS](https://www.growth-memo.com/feed)：文章内公开引用的 X / Reddit 链接。
- [Pici 报告目录](https://pici.id/reports/)：将配置选择器命中的同域 `/reports/` 文章全部加入持久待办，每轮最多处理 4 篇。第三方报告用于发现链接，不代表认可其观点或数据。
- [Brodie Clark RSS](https://brodieclark.com/feed/)、[Lily Ray Substack RSS](https://lilyraynyc.substack.com/feed)、[Lily Ray 博客 RSS](https://lilyray.nyc/feed/)、[SEO for Lunch RSS](https://www.seoforlunch.com/feed)、[Abondance RSS](https://www.abondance.com/feed)：正文内公开引用的原帖；Lily Ray Substack 与 Abondance 同时用于 Reddit 发现。
- [Search Engine Roundtable](https://www.seroundtable.com/)、[Suzuki](https://www.suzukikenichi.com/blog/)、[Rich Sanger](https://richsanger.com/)、[Marie Haynes](https://www.mariehaynes.com/blog/)：各入口按明确选择器保存同站文章待办，每轮处理 3–4 篇，寻找其中的 X 链接。
- [Ahrefs RSS](https://ahrefs.com/blog/feed/)：RSS 条目先发现 `/blog/` 范围内文章，再读取详情。本次最新 6 篇详情中 2 篇含 X 原帖，而仅从 RSS 正文提取为 0，确认摘要型 RSS 需要详情发现。
- [Ahrefs AI 搜索分类](https://ahrefs.com/blog/category/ai-search/)：新增 X / Reddit 共用动态入口，当前目录 20 篇文章全部返回 200，发现去重 X / Reddit 原帖各 9 个，18 个原帖嵌入响应均可读且含可验证日期；逐帖再做相关性判断。此入口持续读取当前分类列表，不是固定的人工搜索种子。

当前 X 配置 14 路发现入口，Reddit 配置 5 路，其中有共用入口。每轮 X 最多读取 48 篇详情、Reddit 最多 17 篇；实际只请求到期条目。此前 27 个候选发现入口的补充审计中，10 个实际返回社交链接；共找到 40 个去重 X 和 3 个 Reddit 链接，14 个抽样原帖全部可读，但只有 4 个直接命中当时的文本规则。文章相关不意味着其中每条引用帖都相关，不把无关帖子凑成收录数量。

文章待办保存在 `geo_public_social_articles`。RSS 即使只有摘要，也会保存同站路径内的条目链接；HTML 列表不再截取前 3–4 条后丢弃其余链接。单轮限额只限制实际详情请求量，剩余待办保留；文章随后从 RSS 或列表页消失，也不会丢掉待办。成功检查默认缓存 168 小时再复查，失败后 1 小时重试；入口暂时失败仍继续处理已保存的文章。详情成功回执与发现的原帖在同一个事务中保存。每次读详情前复核配置范围，拒绝登录页、凭据 URL、越站重定向；详情只在内存用于找链接，不保存全文。

`cursor.socialDiscovery` 保存本轮检查时间，以及入口检查成功/失败、文章总队列/本轮检查/到期待读/未恢复失败、原帖总发现/到期待读/未恢复失败计数。公开接口只输出计数，不输出内部 URL 或游标数据。`articlesPending`、`postsPending` 指已到期可以继续处理的项，等待退避的失败另列在 `articlesFailed`、`postsFailed`。

2026-10-16 新队列上线后，通过正常 CLI 顺序实采两轮，新增公开 X 7 条、Reddit 8 条。核验时累计公开 X **25** 条、Reddit **29** 条；已发现原帖分别 **57**、**31** 条。X 文章队列 **144** 篇，其中到期待读 **65** 篇、未恢复读取失败 **1** 篇；Reddit 队列 **61** 篇，到期待读 **33** 篇、失败 **0**。这一个文章失败保留 partial 状态，按 1 小时退避重试；两平台原帖待办和未恢复失败均为 0。第一轮未新增相关内容，第二轮从剩余队列取得新内容，验证限额不是只重复目录前几篇。数字是当时快照，后续 watch 会继续变化。

发现的原帖持久化到 `geo_public_social_links`。单来源每轮最多读取 40 条，未读优先，剩余排队保留；成功后默认 168 小时再检查，失败后 1 小时重试。某个文章页失败时保留其他页找到的链接，并报告 partial。尚未恢复的失败在重试等待期仍显示 error / partial，不因为没有新请求就假报成功。发现入口检查成功且没有新帖时，ok 表示本轮检查成功，不能解释为有新内容。

普通公开来源与这两条独立社交来源一起 reconciliation，避免每轮把社交来源停用。移除或禁用配置后才停用其来源。启用项总数不等于全平台覆盖；目前不抓平台时间线、平台搜索结果或评论全集，也不能保证发现没有被公开文章引用的新帖子。

新增覆盖可以向 `seedUrls` 加真实原帖，或增加普通公开 RSS / 同站 HTML 列表发现入口。详情发现必须指定同站路径和单轮最多 10 页限制；HTML 还须指定选择器。`articleRefreshHours` 可在 6–720 小时内配置，默认 168 小时。请求继续使用共享公网 DNS、重定向与响应大小保护。

## 已核验但未启用的方案

| 方案 | 本次结果 / 官方信息 | 处理 |
| --- | --- | --- |
| Reddit 原生 RSS | 本机 r/SEO、r/bigseo、r/TechSEO 返回 403；[官方公告](https://www.reddit.com/r/modnews/comments/1wubgvt/continuing_our_infrastructure_updates_whats/)说明 2026-11-13 停止 RSS 支持 | 不依赖该路径，不反复尝试登录或验证码绕行 |
| OpenRSS Reddit | [官方文档](https://openrss.org/feeds)列出 Reddit 公开源；实测 `openrss.org/reddit.com/r/SEO` 与 `/r/GEO` 返回 503 | 未列为已接通来源 |
| Nitter | [官方仓库](https://github.com/zedeus/nitter)在核验时显示已于 2026-10-09 归档 | 没有依据旧教程声称可稳定使用 |
| RSSHub Twitter 时间线 | [官方实现](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/twitter/api/web-api/utils.ts)存在账户 auth token / Cookie 路径及特定无认证分支 | 本项目没有配置账户 token，也没有把通用时间线功能当作已验证免密钥方案 |
| X 搜索 / 个人主页 | 搜索要求登录；个人主页不足以取得可持续的新帖列表 | 不用其充当已启用发现入口 |
| Aleyda 网站 RSS | 本次普通 HTTP 返回 403 | 未加入自动发现配置；其可验证原帖仍可从其他公开文章发现 |
| 已不可用原帖 | `jbobbink/status/2049770474293301266` 返回 Tombstone | 未用搜索缓存拼成新原帖 |

## 验证与运行

迁移：`modules/geo-directory/migrations/0093_geo_public_social_links.sql` 与 `0094_geo_public_social_articles.sql`。采集集成在现有 `collect-public.ts`；使用现有 `PUBLIC_FEED_COLLECT_ENABLED` 开关，无需打开模型调用或主 AI 采集管线。

维护测试：

- `public-social.standalone.test.ts`：5 项通过，覆盖 URL 约束、X 日期/节选、Reddit 目标帖时间交叉校验、完整列表排队、摘要型 RSS 详情发现和越站/登录拒绝。
- `public-social.test.ts`：独立测试数据库 6 项通过，覆盖文章溢出跨轮、目录变化/故障后继续处理旧待办、缓存与周期复查、失败退避/恢复、原帖持久队列和来源 reconciliation。
- 日期补全集成后，全部 GEO 模块测试、根 RSS 回归及 pool relevance 共 61 项通过。覆盖“主题相关性筛选 → 详情日期补全 → 发布时间范围”次序；补日期失败/延期时取消 RSS 条件缓存并跨轮轮转，避免 304 或持续失败的首条阻断后续记录。
- X 与 Reddit 均有合成边界用例：相关词位于第 500 字后仍可识别，存储节选不超过 360 字符加省略号。此项是边界测试，不代表已确认某个真实帖子曾因截断漏收。
- `tsc -p modules` 通过。
- `collector-runtime.test.ts`：独立测试库、`DATABASE_POOL_MAX=1` 下 3 项断言通过；定点断开该测试库的 watch 锁连接后会通知持锁者，替代进程可以重新取锁。测试后的数据库删除等待 `CheckpointStart`，仅取消该测试的清理连接并停止其 runner，未修改开发库；因此不把这次 runner 的退出状态描述为全绿。

首轮实采核验元数据位于 `.data/x-reddit-proposals.json`；补充发现入口审计位于 `.data/social-discovery-audit.json`。本轮摘要型 RSS、Ahrefs 动态分类文章和原帖审计分别在 `.data/social-rss-detail-audit.json`、`.data/social-ahrefs-category-audit.json`、`.data/social-ahrefs-post-audit.json`，两轮实采状态在 `.data/social-durable-queue-verification.json`。这些文件不包含账户凭据。动态源未来可能更改结构或可用性，状态面板应以最近一次检查结果为准。
