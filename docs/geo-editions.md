# 完整日报同步

`/daily` 提供最新整期入口；`/daily/editions` 按报告日期列出历史期刊；`/daily/editions/YYYY-MM-DD` 可直接阅读完整报告、目录、表格及原始引用。它与经过全文核读的条目解读分开，报告中列出既有已核验解读入口。报告原文中的判断不自动成为本站 reviewed 结论。

请在 .env 中设置 GEO_DAILY_SOURCE_THREAD_ID 为自己有权访问的来源聊天 ID；仓库不包含任何默认个人聊天、日报数据或自动化任务。分享链接是快照，不作为每天更新的保证。不得导入用户提示、任务设置或其他私人对话。

## 自动流程

可以另行配置 Codex 本机自动化，每 30 分钟使用 app 的 read_thread 读取自己有权访问的原始聊天，无需付费模型调用。依赖 Codex 本机自动化可运行和原始聊天可访问，不是服务器独立的全天候采集进程。保持公开采集与短摘要翻译运行，本地小模型概要队列继续暂停。

来源读取接口每条最多 20,000 字符。若使用多消息协议，应实际分成多条 assistant 消息，每条最多 15,000 字符，每段以以下标记开始，按章节分割并保留所有内容与普通 Markdown 来源链接：

```text
<!-- GEO-EDITION date=2026-10-20 issue=4 part=1 total=3 -->
# 全球 GEO 全景情报
## 2026 年 10 月 20 日｜第 004 期
正文……
<!-- GEO-PART-END -->
```

最后一段另以 `<!-- GEO-EDITION-END -->` 结尾。使用下一期真实输出验证多消息协议；不以设置成功代替端到端验证。

将 read_thread 完整 JSON 原样保存至私有 `.data/daily-sync/thread.json`。必要时按 nextCursor 继续读取，将每页原始 JSON 分别传给导入器，不截断、不重写文本。导入：

```powershell
node --env-file=.env scripts/import-geo-editions.ts .data/daily-sync/thread.json YOUR_PUBLIC_SHARE_URL
```

脚本只接受指定来源聊天中 completed 回合的 agentMessage，明确标记 truncated 的消息不参与发布。每份原始 JSON 按内容 hash 归档到 `.data/daily-sync/snapshots/`，之后自动累计各轮、各页取得的真实分段，再按同一期连续段号组装。相同消息重复读取不会重复计数；同一消息身份出现不同正文时拒绝导入，保留原始快照供核对。

缺段、总数不一致、超过字符限额、缺结束标记或未解析内部引用均不得发布。`.data/daily-sync/import-status.json` 记录收到的段号、缺失的段号、发布结果和检查时间。没有完整待导入期时无需连接数据库；未分段消息 ID 仅作为诊断，不会自动变成完整日报。重复完整内容返回 unchanged；已发布内容冲突仍拒绝覆盖。

### 来源只保留最后一段时

截至2026年10月22日，实际读取和聊天页面均只取得部分日报的最后一段，且没有分页游标。扩大字数上限不能找回缺失段落。来源应在一次最终回复内输出完整一期，控制在15,000字符以内，采用 `part=1 total=1` 和两种结束标记；内容应在生成时组织为完整报告，不能由接收端删掉前文或补造段落。修复来源输出需要使用者授权向来源聊天发送设置。

新的完整 `1/1` 消息可以补齐同一天尚未发布的缺段期；存在两个不同的完整修订时拒绝自动选择。已经发布的旧期仍不可覆盖。来源读取权限或运行环境失效时保留已有内容和成功快照，不拿旧快照当成新数据反复导入。自动化须实际验证下一期发布成功，不能把导入器测试通过说成来源已修复。

历史完整导出支持 message 对象数组，必须为 assistant、finished_successfully；内部引用按原始 metadata.content_references 解析，包括同一引用内多个来源。此入口只用于已经确认取得完整消息的私有导出，不能把 read_thread 的截断文本伪装为完整导出。

## 核验与安全

数据库表 `geo_daily_editions` 保存固定整期、原始消息身份、正文 hash 和引用链接。公开出口仅由 `publication/geo-editions.ts` 读取，Markdown 经现有 HTML 清洗器处理；公开响应不含私有源消息身份或 hash。访问页面不触发抓取或模型。

逐条重点仍使用受保护抓取器读取完整公开正文，记录私有段落证据，通过 `saveReaderBrief` 存 reviewed 概要。先按规范化 URL 的 canonical_id 去重，已有 reviewed 内容不重写。新原始来源可从 `geo-daily-references` 导入，实际发布机构保留在条目上；RSS 源对账保留该来源，不将其误当失效订阅。仅报告引用到的真实有效 full-article reviewed 条目出现在“已核对原文”入口，来源停用或快照变化后自动不展示。
