# GEO 历史译文审计

审计所有启用来源中仍与当前标题、摘要、语言匹配的完整译文，不调用翻译服务，不请求外部文章，不写数据库。原文版本已变化、停用来源、失败或不完整的翻译不属于此次有效译文集合。

```powershell
node --env-file=.env modules/geo-directory/scripts/audit-translations.ts --out .data/translation-audit.json
```

命令只提供 `--out`，没有 `--write`。报告含原文、URL、来源、摘要版本、缓存 hash、根据当前原文重算的 hash、当时机翻、已审核覆盖和各项发现。原文与机翻都保留，供逐条复核。报告是有时间戳的快照，不要把重跑结果当作之前的原始样本；需要保留历史时使用不同输出文件名。`.data/` 不提交 Git。

## 读者能看到什么

`machineFindings` 检查底层译文缓存，`visibleFindings` 检查当前有效审核覆盖（若存在），否则检查机翻。已纠错的条目可能仍有底层机翻问题，但不会被重复列为读者正在看到的错误。已审核覆盖按原始标题、摘要和语言精确匹配，原文改变后自动失效。

`repairableUnreviewed` 只计没有生效审核覆盖、也不是旧 `geo-edited-*` 已核对参考译文的术语候选。它不是错误率。报告中每条保留完整原文和译文、问题字段、命中片段、解释、置信类别与建议动作。

## 自动术语规则与人工核对分开

`industry/translation.ts` 的 `bing-geo-v3` 新增三条窄规则：

- 原文出现 `spam update`，上下文为 Google 搜索，且没有 email/inbox/SMTP/Gmail 语境时，仅将“垃圾邮件更新”改为“垃圾内容更新”。[Google 的搜索垃圾内容更新说明](https://developers.google.com/search/blog/2023/10/october-2023-spam-update)描述网页垃圾内容及搜索结果。
- 原文明确 `agentic system`，且有 LLM/GEO/生成式 AI/自主执行上下文时，将“代理系统”改为“智能体系统”；保留已有“智能代理系统”，排除 proxy、委托代理理论、心理学语境。
- 同样的 AI 语境下，原文 `agentic` 对应“代理特性”时改为“智能体特性”。[Agent2UCB 原论文](https://arxiv.org/abs/2608.29063)描述自主反馈驱动的 GEO 系统。

同一版本还修正了旧 Perplexity 品牌规则的排除条件：`metrics`、`perplexity filtering`、`perplexity ratio`、困惑度分数或度量等统计语境中，不再把正确的“困惑度”改成产品名。真实的 GEO-Bench 和 GEO Defender 摘要作为回归样本。若同段同时讨论 Perplexity 产品和模型困惑度，保守保留现有文字，不能靠全局替换区分两者；已写入的错误由逐条审核修订处理。

网址、代码、账号、品牌英文及数字继续受保护，只有原文实际出现对应词组时才应用。规则不会把全部 `agent`、`spam` 或普通中文“代理”全局替换。版本变化不意味着所有记录都重译：本地术语修复只更新实际改变的译文。

以下仅报告，绝不自动修改或触发重译：

| 提示 | 需人工判断的原因 |
| --- | --- |
| population / discrimination | 评估论文里可能指样本集合/区分能力；群体公平论文里“人群/歧视”也可能完全正确 |
| search goods | 经济学可能是搜寻品；普通商品搜索表述不能套用术语 |
| GEO / 地理 | 多语种短标题可能缺少 AI 上下文；缺少依据时只报告，不能按信源类别强行改词 |
| perplexity / Perplexity | 模型困惑度与搜索产品可能同段出现；统计论文也可能正确提到 Perplexity Search 产品 |
| cited by / cited in / Sites Cited | 中文可以改为主动句，不能只看有无“被”就判引用方向颠倒 |
| 否定线索 | 缺少“不/未/无”等关键词不等于否定丢失；同义改写及范围需逐句核对 |
| 更多/更少、增减及百分点 | 数字保留不代表比较关系正确；38% 与 38 个百分点不可互换 |
| 数字 | 接受千位格式、K/M/万/亿及 million 转换、常见中文数量与序数、模型版本、日文“割”和中文“成”、LaTeX 百分号；其余数字读法与日期仍可能合法 |
| 导航尾注 | 应核对来源摘要和清洗规则；不要在译文层盲删正文或补写截断部分 |

新增年份、数值百分比不一致、原文无摘要却出现中文摘要另行标为高置信核对项，但审计本身仍不执行修复。它是候选检测器，不是完备的语义判定器，未命中不能证明翻译完全准确。

## 审核后修复

确定术语修复沿用默认只读的维护命令：

```powershell
node --env-file=.env modules/geo-directory/scripts/repair-translations.ts
# 审核预览后，由维护者在翻译租约可用时显式执行
node --env-file=.env modules/geo-directory/scripts/repair-translations.ts --write
```

修复只处理启用来源。生效的审核覆盖和没有显式参考稿要求的 `geo-edited-*` 缓存保持不变；“已审核”描述发布流程，不意味着审核者必定是人类。实际写入同时核对原文三字段、现有译文状态/内容/版本和完整精度的更新时间，避免把预览之后的新缓存覆盖；保留原文、链接、日期。参考稿与原文必须同时有摘要或同时无摘要，不能在无摘要时新增内容。语义关系、否定与研究术语的歧义通过现有“纠错→审核”覆盖层逐条处理，不通过规则润色。

## 验证

离线测试使用昨日真实问题结构及反例：Google Search 与 Gmail、agentic 与 proxy/心理学、已正确“智能代理”、研究样本与真实人口、被动引用与主动改写、42% more、38 个百分点、100,000/10 万、66.6 million/6660 万、中文数量和模型版本。数据库测试使用隔离测试库，验证停用/过期/不完整数据不进入审计、已审核覆盖不被修复、原始字段不变及重复执行无修改。

本轮相关独立测试 21 项通过；两份隔离数据库测试通过，包含 PostgreSQL `.123456` 微秒更新时间的 CAS。时间戳先以 text 参数传入再由 PostgreSQL 转成 timestamptz，避免驱动中途转成 JavaScript Date 丢掉微秒。模块 TypeScript 检查通过。完整后端验证由主任务另行执行。

## 2026-10-17 全量快照

最终报告为 `.data/translation-audit-20261017-final-v3.json`，读取时间为北京时间 **2026-10-17 07:16:55**。报告保留此时原始文本和译文，不随后续纠错覆盖。此前试运行报告亦保留，不能把不同时间的快照拼成同一个错误率。

- 当前有效完整译文 **1,168 条**，包括本轮新增 69 条；原文 hash 不匹配 **0 条**。
- 生效审核覆盖 **5 条**。底层缓存有提示 **32 条**；按读者实际可见版本检查有提示 **28 条**。
- 提示类型按条目计：导航尾注 9、数字写法 4、Perplexity 统计语境 4、引用方向 4、GEO 缩写 6、可直接修正术语 1；类型可以重叠。条目按数据库记录计，跨来源重复文章仍各保留一条。
- 只读修复预览有 **1 条术语修正、0 条重新翻译**；没有执行生产写入。该条是 Glenn Gabe 公开帖文标题中 Google `spam updates` 被译成“垃圾邮件更新”。

这 **28 条是复核候选，不是 28 条错译**。例如，四个 Perplexity 提示中，GEO-Bench 的 `perplexity ratio` 和 GEO Defender 的 `perplexity filtering` 确有旧规则造成的品牌误译；另两个样本确实在讨论 Perplexity 搜索产品，译名正确。新 69 条中未发现新的困惑度被误改产品名案例。

本轮已核对并排除日文“5割”到 50%、“1割/7割”到“一成/七成”、66.6M 到 6660 万、法文 7 millions 到 700 万、`percentage-point` 到百分点、LaTeX `\\%` 到 `%` 等误报。仍保留的四条数字提示包括原文截断的数值、媒体名称中的数字和“三者”等表达，均不能直接作为数字错误入库修复。引用提示也包括正确的中文主动改写。

来源尾注应回到采集摘要处理；社交帖文中的“read more”还可能是作者主动正文，不能据提示删除。独立语义审阅另外检查了新论文中 `domain visibility` 被译成“领域可见性”、Clarity 的 `Scrape-to-Referral Insights` 被生硬译成“抓取到推荐”等实际语义问题。其审核参考稿与应用记录见 [逐条语义审阅](geo-semantic-review-20261017.md)，不把这些判断混入自动术语替换。

后续主任务已完成 35 条逐句修订、1 条术语修正及 8 条摘要尾注清理。自动采集后的复核报告位于 `.data/translation-audit-final-runtime-20261017.json`；仍保留的规则提示须结合原文判断，并非未修复错误清单。35 份修订稿均验证保留，既有 5 条审核覆盖未被覆盖。应用结果及完整测试边界见[集成验收](geo-validation-20261017.md)。

## 第二轮：Google 搜索政策与当前译文

`bing-geo-v4` 增加一条窄规则：原文明确出现 `spam policy` / `spam policies`，并包含 Google Search、Google 搜索或 Search Console 上下文，且不涉及 email、inbox、SMTP、Gmail 时，才将“垃圾邮件政策”改为“垃圾内容政策”。用词依据 [Google 网页搜索的垃圾内容政策](https://developers.google.com/search/docs/essentials/spam-policies?hl=zh-cn)。测试覆盖已正确译文、邮件反例、网址与代码保护。不对 domain、grounding 等多义词做全局替换。

2026-10-17 08:10 的只读快照 `.data/translation-audit-after-round2.json` 检查 1,195 条有效译文，原文哈希不匹配 0 条，生效纠错覆盖 11 条。12 条可见译文触发提示，仍须逐条判断，不能视为 12 条错误或全站准确率。针对性语言审阅与后续修订见 [第二轮语义审阅](geo-semantic-review-20261017-round2.md) 及 [集成验收](geo-validation-20261017-round2.md)。
