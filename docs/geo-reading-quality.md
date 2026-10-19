# GEO 公开资料的阅读顺序

公开采集继续宽召回；“推荐”用标题、短摘要、原文链接类型提供可解释的阅读顺序。它不调用模型，不删除低优先条目，不输出质量分，也不表示已核验原创性、方法有效性或结论。原模型的五维权重及精选门槛未改。

阅读卡片仅呈现标题、摘要、图片、必要来源与日期、收藏，不展示采集过程、排序依据、限制提示或关键词。规则及解释字段保留在 API 与本文档；网页简洁模式只展开摘要。

## 规则与边界

规则集中在 `industry/public-reading.ts`，由公开读取层 `geo-quality.ts` 同时用于 PostgreSQL 排序与 JavaScript 理由，避免数据库顺序与页面标签分歧。

| 层级 | 线索 |
| --- | --- |
| 优先阅读线索 | 直接相关的方法、样本、数据集或实测线索；直接相关的平台检索、抓取或展示变化。厂商自行测试和社区失败实验可进入这一层。 |
| 相关资料 | 直接相关但摘要证据有限的解释、观点、问答；明确转述他人研究或推荐另一篇文章的内容。 |
| 补充线索 | 聚合索引、明确转载、汇总播报、服务推介、缺少自行测试表述的工具榜单，以及当前短摘要中直接关联较弱的泛 AI 内容。 |

同层按原发布日期倒序；日期未知时使用首次收录时间，并说明日期未知。这里只检查固定多语关键词，并不把营销词、引用率或研究词单独当成真实性证明：批评、失败结果和反自我推广讨论受到保护；厂商身份本身不降权；“我们测试”等表述也只是线索，不能证明测试真实。

只存短摘录的限制是实际存在的：原文的方法可能在摘要之后，营销话术也可能未出现在摘要中。没有可见方法线索的研究不会仅凭机构名自动提到优先。Pew 一类 `AI summaries + Google + search results/click on links` 内容按窄上下文识别为相关，不把 Google Docs 摘要功能一并提升。

`/all` 的默认标题折叠仍按已有“同北京时间日、同语言、相似长标题”规则。先筛选，再在组内按当前顺序选代表；展开保留所有原文。它不判断是否报道同一事件，不能保证清除跨日期、跨语言或不同标题的重复报道。首页精选在原有时间窗口内按同样的层级整理，同一个标题组只取最佳代表；同层先照顾不同域名，再补齐最多 20 条，不让低层级仅凭域名不同挤掉高层级资料。

## API 与游标

`GET /api/geo/public-items?sort=recommended|latest`：API 默认 `latest`，网页新访问默认 `recommended`。响应回显 `sort`；每条及组内成员包含：

```json
{
  "readingPriority": {
    "tier": "priority",
    "label": "优先阅读线索",
    "reasons": ["含与 GEO 直接相关的方法、样本或实测线索"],
    "limitations": ["仅依据标题、短摘要和链接类型；未核实原创性、方法有效性或结论，关键词规则可能误判或遗漏。"],
    "policyVersion": 1
  }
}
```

新游标 v2 包含排序模式、规则版本、内部顺序层级（仅推荐）、精确时间、ID，以及关键词/语言/来源/渠道/类型/时间范围/分组条件的摘要。内部层级只是三档顺序，不是质量分。改变排序或筛选后须回第一页，否则返回 400；页大小可变。旧 `{at,id}` 游标继续按 `latest` 解读，不能接到推荐顺序上。未显式传 sort 的新游标沿用它原来的模式。

内容变化或新增仍会改变动态流，游标不是冻结快照。固定数据的同时间跨层级翻页、组内代表、筛选隔离及旧游标兼容有数据库回归测试。画像字段不参与规则：图片只输出现有签名代理 `imageUrl` 及 `imageOrigin`，不另加原始图片地址或后台抓取状态字段。

## 真实样本复核：2026-10-16 20:42 北京时间

对本机已收录公开资料作只读抽查：1,336 个唯一原文链接、1,271 个标题组，53 条优先、462 条相关、821 条补充。采集继续运行，数量会变化；这些是规则分层数量，不是人工质量评级。以下比较相同查询、标题折叠开启的最新与推荐前 20 条，文字为便于复核的简称。

| 位次 | 最新顺序 | 推荐顺序 |
| --- | --- | --- |
| 1 | SEO 视频新闻回顾 | 法语 Google AI 回答链接展示变化 |
| 2 | 韩国营销研讨会 | VoteGEO-Bench 研究 |
| 3 | GEO 营销生态图谱征集 | ChatGPT 流量追踪问题 |
| 4 | 日本 AI 搜索服务参展 | Glenn Gabe 观察 Google 链接更新 |
| 5 | 杭州 AI 搜索公司推荐 | Search Engine Roundtable 链接更新报道 |
| 6 | 服务商参与 GEO 团体标准 | Google 官方链接展示更新 |
| 7 | 服务商品牌观点 | Barry Schwartz 链接更新评论 |
| 8 | 西语 B2B 搜索策略 | Google Universal Cart 上线报道 |
| 9 | 上海 GEO 公司推荐 | Glenn Gabe 观察 ChatGPT UTM 变化 |
| 10 | 法语 Google 链接变化 | VoteGEO-Bench 的 v1 地址 |
| 11 | 葡语新闻编辑策略聚合 | 德语 Google Search/Gemini 更新 |
| 12 | 西语新闻编辑策略聚合 | 960 个 AI 回答的搜索与引用实测 |
| 13 | AI 可见度扫描器发布稿 | Ahrefs 查询扩展研究 |
| 14 | GEO 平台选型榜单 | HN 的 AI 搜索脆弱性测量讨论 |
| 15 | 学术期刊 GEO 文章索引 | Lily Ray 的自推榜单引用观察 |
| 16 | 品牌营销观点聚合 | GEO 提示词语料与可见度测量论文 |
| 17 | 韩国营销工具信任文章索引 | 搜索证据投毒评测论文 |
| 18 | 服务商参与 GEO 标准新闻 | Google 官方 AI 搜索旅行功能 |
| 19 | 检索后证据使用研究 | HN 的企业 AI 搜索准备度审计 |
| 20 | 通用论文检索研究 | SE Ranking 法国 AI Overviews 研究 |

最新前 20 的分层为 1 条优先、2 条相关、17 条补充；推荐前 20 均有规则优先线索。补充不等于内容错误，常见原因是链接仍为聚合索引或服务推介。没有人工把这 20 条全部判为可信。推荐中仍存在多条同一平台变化的不同标题，也存在论文无版本地址与 v1 地址发布日期不同的重复；本轮不扩大已有标题组的含义。

逐项抽查后补了可回归的边界：

- [Ahrefs 查询扩展研究](https://ahrefs.com/blog/query-fan-out-chatgpt/)：原文列出采样范围、查询规模和研究限制，短摘要含作者自行分析表述。保留优先；它来自工具厂商，不因身份直接压低。排序没有核验其数据和推论。
- [Google 官方更新](https://blog.google/products-and-platforms/products/search/updates-ai-mode-overviews-explore-web/)：平台域名及摘要明确描述搜索展示变化，保留优先。域名判断要求精确或子域匹配，仿冒后缀不通过。
- [日本 SEO Weekly Update](https://www.suzukikenichi.com/blog/seo-weekly-update-october-2026-week2/)：打开原文后可见它是每周新闻推荐，不能仅因标题带比较实验而视为原创研究；改为补充。独立日语实验的配对用例仍可优先。
- [Lily Ray 的社区观察](https://bsky.app/profile/lilyray.nyc/post/3mwr6mymcuc2m)：摘要包含约 100 个查询的观察和自推榜单批评，保留优先线索，不因“推广”词误判为广告。
- [CSDN 引用机制解读](https://blog.csdn.net/Venture_ai/article/details/164744032)：摘要明确说结合他人的研究结论，保留相关资料，优先引导追溯原研究；不把转述当作作者自己的实验。
- 真实 Mastodon 中“measurement gap”的泛建议不再因单个 measurement 词优先；转述 Ahrefs 数据的帖子保持相关。服务商榜单即使包含研究、数据和方法词，仍按推介线索降后；有自行测试表述的工具比较保留独立判断。

## 针对性验证

本轮 45 个针对性用例通过：规则与首页 36 个、质量数据库 4 个、分组 3 个、概览读取 1 个、在线加列后完整翻页回归 1 个。全仓 typecheck 通过；最后规则小修后另复验 backend 与 modules typecheck。根任务另负责全仓测试及运行中 API 验收，这里的结果不替代它们。

```powershell
node scripts/test-local.ts --standalone modules/geo-directory/tests/public-quality.standalone.test.ts modules/geo-directory/tests/overview.standalone.test.ts
node scripts/test-local.ts modules/geo-directory/tests/public-quality.test.ts modules/geo-directory/tests/public-grouping.test.ts modules/geo-directory/tests/public-schema-pagination.test.ts modules/geo-directory/tests/overview.test.ts
```

这些测试在随机隔离数据库执行；没有为排序改动应用线上迁移、重启服务或启用模型调用。
