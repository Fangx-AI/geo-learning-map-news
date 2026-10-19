# 公开摘要形成与历史恢复

公开资讯保存源站提供的摘要或帖文节选，不依据标题生成内容。2026-10-16 的版本 `1` 建立摘要预算；2026-10-17 的版本 `2` 补充已核对的来源尾注模板，预算保持不变：主要为拉丁文字的摘要最多 900 个 Unicode 字符，主要为中日韩文字的摘要最多 450 个字符。优先在使用了至少 55% 预算的句末结束；若没有合适句末，则在词边界截断。凡本站省略内容，末尾明确保留省略号。原站只提供半句话时，不补写、不宣称是完整摘要。

这是短摘要预算，不是抓取或展示全文。`summary_raw` 保存清洗、展示截断之前的来源摘录，最多 8,000 个 Unicode 字符；RSS 提取的是描述字段的文本，并非原始 XML。该内部字段不由公开接口返回。`summary_origin` 标明 RSS、列表、社交原帖、既有正文节选或原站 metadata，`summary_source_url` 指向实际读取入口，`summary_version` 记录形成规则。RSS 原有 2,000 字符 excerpt 行为保持不变，公开采集通过显式 `includeSummaryMetadata` 读取较完整的描述；该选项变化会使旧 ETag 游标重新读取一次。

清洗只匹配实测来源模板：Search Engine Journal、GSQi、Abondance、Screaming Frog、Brodie Clark Consulting、Rich Sanger、Marie Haynes、iPullRank、WordLift Blog、Oncrawl、Microsoft Clarity Blog 的文章重复标题与首发站尾注；Ahrefs 结尾带箭头的 `Read more ›`（完整句或省略号后均适用）、GSQi 在省略号后附带的 Read more；HN RSS 的文章/讨论链接及投票数字标签；arXiv 订阅公告前缀（包括实测 `replace-cross`）。出版方名称按字面匹配，Clarity 名称中的 `|` 不作为正则分支。其他站点或正文里的同样词语保持原样；Ahrefs 没有箭头的普通 `Read more` 也不删除。HTML 实体在展示前解码，科学比较 `x < y > z` 不应被当作 HTML 再次吞掉。

## 历史回填

默认只读，生成可审阅 JSON 计划。最多处理 500 条、同时读取两个来源；单次最多 20 条社交原帖、10 个同站 metadata 页面。来源失败继续处理其他来源，不调用第三方全文转存、登录或模型。

```powershell
node --env-file=.env modules/geo-directory/scripts/backfill-summaries.ts --limit 180 --post-limit 10 --metadata-limit 5 --out .data/summary-backfill-plan.json
node --env-file=.env modules/geo-directory/scripts/backfill-summaries.ts --source rss-hacker-news-geo --limit 100 --metadata-limit 0 --post-limit 0 --out .data/summary-hn-plan.json
```

读取最新公开 RSS/Atom/JSON/列表后，只匹配相同来源、canonical ID 和原标题。原帖使用已有安全读取器。若条目已移出订阅列表，最多尝试同站网页的 description/og:description/twitter:description；响应地址和页面 canonical 必须仍对应原条目，且新摘要必须确实延伸既有摘录。短小、独立改写或不相干的 metadata 一律不代替旧摘要。不提取网页正文。HN 使用原帖 `story_text`，没有帖文文字的链接分享保持空摘要，不把链接投票统计编成文章内容。

审核计划后应用（需要 0109、0113、0114、0115 迁移已安装；下列两份历史计划已于 2026-10-16 应用，无需再次执行）：

```powershell
node --env-file=.env modules/geo-directory/scripts/backfill-summaries.ts --apply .data/summary-backfill-plan.json
node --env-file=.env modules/geo-directory/scripts/backfill-summaries.ts --apply .data/summary-hn-plan.json
```

应用时不再访问网络。它持有与采集相同的 `cycle` 锁，来源必须仍启用；写入前同时核对 id、来源、canonical ID、URL、原始标题、原始摘要、语言及摘要规则版本。任意变化都会跳过该条。重复执行同一计划不会重复更新。仅更新摘要和四个溯源字段，保留原标题、原文链接、发表和收录时间。锁连接失效后停止后续写入。已有中文翻译与人工校对按原始字段精确匹配，所以摘要变化后旧译文不再用于新摘要，由持续翻译队列重新处理。

尚未找到可靠原文的历史摘要保持不变；以后可以再次只读生成计划。正常自动采集也会持续使用新版规则。原站只发布 teaser 的情况，延长本站预算无法恢复它未公开在摘要中的信息。

## 真实来源核对，2026-10-16

固定读取 9 路公开订阅，145 条候选、78 条 GEO 匹配。用同一批响应分别执行旧规则和新规则，避免将网络内容变化误当作清洗效果：60 条摘要改变，32 条扩展，28 条减少重复尾注或解码实体；18 条保持不变。所有匹配条目的标题、原文 URL、来源身份、发表时间均保持不变。

| 来源 | 核对条数 | 扩展 | 清理/实体解码 |
| --- | ---: | ---: | ---: |
| Search Engine Journal | 10 | 0 | 10 |
| Bing Webmaster Blog | 9 | 1 | 2 |
| Search Engine Roundtable | 3 | 0 | 0 |
| Ahrefs | 7 | 0 | 7 |
| Abondance | 2 | 0 | 2 |
| arXiv GEO | 30 | 30 | 0 |
| GSQi | 7 | 0 | 7 |
| SearchPilot | 5 | 1 | 0 |
| Barry Schwartz Bluesky | 5 | 0 | 0 |

逐条重点核对：

- Bing Topics Portfolio：361 字符扩展到 572，恢复了 grounding queries 和 Opportunity Queries 的区分，以及 AI 分类/生态指标只是近似值的限制。
- arXiv VoteGEO-Bench：361 扩展到 752，保留选举范围和分析方法，并仍以省略号标记未展示全文。Gap Detection：361 到 867，保留样本与 12.8%/10.8% 结果。
- SearchPilot SEO A/B Testing：361 到 506，恢复“错误变动也可能造成同等损失”的上下文。
- SEJ ChatGPT 流量追踪：262 到 157，仅移除重复标题和首发站尾注，来源对追踪标签的判断保留。
- Ahrefs fan-out：283 到 259，解码实体并移除 Read more；原站在 `Only 14.4% of the 66.6 …` 截断，仍保持不完整，不猜测后续数字关系。
- Abondance、GSQi：只去掉已验证尾注，来源自己的省略号和不完整末句保留。

首次实库 dry-run：180 条目标中形成 146 条回填计划，139 条摘要内容变化（106 条变长、31 条变短、2 条等长实体修复），7 条仅补溯源。包括 38 条 arXiv、10 条 Reddit 原帖、27 条 Mastodon 来源；一条 Glenn Gabe Bluesky 帖子通过同页 metadata 恢复被截断的链接尾部，旧前缀逐字吻合。最长公开摘要 900 字符、最长保存原始摘录 7,472 字符。首轮审核发现其他出版方尾注后，依据同批原始摘录精确补充清洗规则，22 条计划重新计算，没有重新请求源站；最终主计划中已验证的首发尾注和公告前缀残留为 0。另一次 HN 原帖 JSON 查询检查 59 条，43 条能重新对应，20 条文本变化。两个计划条目不重叠。未匹配条目没有写入或补造。

实际应用结果（2026-10-16）：主计划成功更新 146/146 条，其中 139 条摘要文本变化；HN 计划成功更新 43/43 条，其中 20 条文本变化。合计更新 **189 条，159 条摘要文本变化**，没有因原文版本变化而跳过的条目。两份历史计划已完成，无需再次应用。

随后对剩余 6 条旧长摘要做有界追查，补回此前受 10 条原帖读取上限影响的 3 条 Reddit 内容，摘要从 361 字符分别扩展至 814、789、892 字符。计划 `.data/summary-remaining-reddit-plan.json` 已应用 3/3，写入后精确核对摘要，标题、来源、链接、语言和发布日期均未变化。**本轮累计更新 192 条，162 条摘要文本变化**。剩余 3 条 HN 旧外链在当前列表中没有相同身份的匹配，不把讨论版或相似标题的摘要套入旧记录；保留原状。追查记录见 `.data/remaining-long-summary-audit.json`。

新版采集守护已恢复运行，并完成一轮 65/65 来源采集。当时有 155 条摘要重译排队；这是部署后的队列快照，不表示这些译文已全部完成。后续采集持续使用新版摘要规则。来源自身截断、没有摘要或无法重新读取的内容仍保留原状，不因为回填或翻译而补造信息。

最终队列核对（北京时间 23:19）：公开流去重后的外文内容 **1,088/1,088 已有有效中文译文**，待译和失败重试均为 0，本轮摘要重译已完成。上述 155 条仅保留为部署期间快照。另抽查 12 条新摘要译文，对 3 条明确语义问题和 1 条术语歧义通过绑定原文版本的审核式纠错作了修订；语言核对不等于来源事实认证。

本地审计产物：`output/summary-source-baseline.json`、`output/summary-source-comparison.json`、`.data/summary-backfill-plan.json`、`.data/summary-hn-plan.json`。这些是本次环境的审计文件，不是运行依赖。前文保留写库前的真实来源对照与计划统计，上述实际应用结果记录最终写入情况。

测试覆盖源限定尾注、数学符号、实体解码、句末与 CJK 限长、RSS/Atom metadata 的显式启用与 ETag、同文 metadata 扩展、CAS 原文三字段/URL/canonical ID、停用来源、原时间不变及重复计划幂等性；只使用本地固定响应和隔离测试数据库。

## 尾注版本 2 核对，2026-10-17

翻译审计发现 9 条含“read more / appeared first on”线索的摘要。本轮仅读取库内现存摘录，不重新访问源站，形成 `.data/summary-footer-v2-comparison.json` 的前后快照和 `.data/summary-footer-v2-plan.json` 的精确版本计划：

| 来源 | 检查 | 文本变化 | 实际变化 |
| --- | ---: | ---: | --- |
| Microsoft Clarity Blog | 3 | 3 | 删除完整 `The post … appeared first on Understand your customers \| Microsoft Clarity Blog .` 尾注 |
| Oncrawl | 3 | 3 | 删除完整首发站尾注，原来三个不完整末句及其省略号均保留 |
| Ahrefs | 1 | 1 | 删除完整句后 `Read more ›`；不要求前面有省略号 |
| Search Engine Journal | 1 | 1 | 用已有来源规则清理一条版本 0 历史摘要 |
| Mastodon 原帖 | 1 | 0 | 作者正文中的 read more 与链接、标签全部保留 |

合计 9 条核对、8 条文本变化、1 条保持原样，外部网络请求与生产写入均为 0。八条新摘要逐条验证为“现存摘要仅减去已确认尾注”，没有借此扩展摘要或改写句子；原始摘录保存在计划的 `summaryRaw` 中。计划含 id、来源、canonical ID、URL、标题、摘要、语言和原摘要版本，现有 `applySummaryBackfill` 会持采集租约并再次核对这些字段。此处记录的是写入前计划，实际应用结果由主任务另记；不要将它与前一日已完成的 192 条回填合并为已写入数量。

对应摘要独立测试 6 项通过，包含 Clarity 管道符字面匹配、错误出版方反例、Ahrefs 正文/无箭头反例、Mastodon 原帖不变及原省略号保留。旧版本 1 计划保留作历史审计，新回填须使用版本 2 重新生成或核对的计划，不能直接重放旧版本计划。

主任务随后正式应用上述版本 2 计划 **8/8 条，版本冲突 0**，重译 **8/8 条，失败 0**；再逐条审阅并校订 3 条译文。原始摘录仍保留，标题、原文链接与日期不变。后续隔离数据库回填测试通过，新版采集守护已完成 70/70 来源的一轮采集。最终状态见[集成验收](geo-validation-20261017.md)。

## 存量摘录随规则更新，2026-10-17 第二轮

对 1,170 条保留原始摘录的内容按当前规则重算，发现另外 3 条 Oncrawl 历史摘要仍为版本 1，带有完整首发站尾注。这些旧条目可能已移出当前 RSS，不能依赖下一次订阅响应修复。

采集现在持有同一轮次租约，在请求来源前分批更新已有旧版摘录：来源须仍启用，摘要版本必须大于 0 且低于当前版本，并具有原始摘录、已知形成方式及形成入口。它只重算已保存摘录，不访问原站、不生成新文字；缺乏溯源的旧内容仍留给显式回填。每批锁定最多 250 条，只更新摘要和规则版本，原始摘录、标题、链接、发布日期与收录时间保持不变。单源运行也只维护该源。摘要文本变化后，现有原文版本匹配会使旧译文失效，后台翻译队列补上新译文；文本相同的版本升级不触发重译。

本机首次执行升级 **236 条，仅 3 条摘要文本变化**；所有原始摘录、标题、URL 与日期逐条比对无变化。记录为 `.data/summary-integrity-round2.json`、`.data/summary-refresh-before-round2.json` 和 `.data/summary-refresh-applied-round2.json`。隔离数据库测试覆盖重复执行、单源维护、停用来源、缺失溯源、版本 0、未来版本与元数据不变。
## 第三轮补充：SISTRIX 的来源尾注

`PUBLIC_SUMMARY_VERSION=3` 针对实际新收录的 7 条英文 RSS 摘要，清除末尾固定模板 `Der Beitrag … erschien zuerst auf SISTRIX .`。只有文章和 feed 都属于 `sistrix.com`、模板位于末尾且发布方完全一致时才匹配；其他站点、正文引用和其他发布方不删。

7 条旧摘要已从保存的 `summary_raw` 本地重建，保留省略号／截断状态；原标题、原始摘录、链接、日期、图片等其他字段逐一验证未变。新哈希译文由正常后台队列重译，不在中文稿里偷偷删源内容或补写全文。维护器会让其他旧版本记录逐步升级；没有文字变化时不导致重译。

