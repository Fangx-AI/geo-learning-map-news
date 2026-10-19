# GEO 社交平台接入

全球信源目录在 `/atlas`。当前无密钥公开管线把真实原文元数据写入公开流，供 `/all`、精选、热点榜、日报和主题页共同读取。X / Reddit 已有公开嵌入读取与作者文章发现链路，详情见 [研究与实测](geo-x-reddit-research.md)。下面同时保留可选 API 和外部导入路径；它们仍须经过原引擎处理，不与公开流的状态混为一谈。

无密钥管线配置在 [`industry/public-social.json`](../industry/public-social.json)，由 `collect-public.ts` 自动执行。另有 [`industry/social-sources.json`](../industry/social-sources.json) 中的 **16 个 X API 查询与 15 个外部导入源模板**，以及 [`social-ingest.ts`](../modules/geo-directory/scripts/social-ingest.ts) JSON / JSONL 导入工具。这些可选模板都为 `enabled: false`；当前没有调用付费社交服务，全文展示关闭。

## 平台覆盖与实际状态

以下为本项目的实现状态，接口说明核验于 **2026-10-16**。平台授权和配额可能变化；开通后的实际能力以对应应用权限为准。

| 平台 | 已有能力 | 自动采集还需要什么 | 原文与内容限制 |
|---|---|---|---|
| X | 已启用作者 RSS / 公开文章链接发现 + 官方嵌入读取；另保留 `x_search` 和外部导入 | 当前公开读取无需密钥；全站关键词 API 检索仍是单独可选路径 | 保存部分公开原帖的作者、日期与短摘录；公开文章发现不等于全量搜索。机制见 [研究记录](geo-x-reddit-research.md) |
| Reddit | 已启用公开文章链接发现 + Reddit 嵌入页读取；另保留 `external` 导入 | 当前公开嵌入读取无需密钥；OAuth API 适配器尚未实现 | 核对目标帖子 ID 与发布时间，保留 r/社区及公开作者；不保证社区所有帖子与回复。机制见 [研究记录](geo-x-reddit-research.md) |
| YouTube | 框架已有 RSS 采集；`external` 接收视频元数据 | 频道 RSS 可配置为普通 `rss`；关键词自动发现可由获得配额的 YouTube Data API 适配器输出导入文件，本项目尚未提供该适配器 | 视频描述不等于字幕；现有框架不会把播放器页面当视频全文。[搜索 API](https://developers.google.com/youtube/data/reference/rest/v3/search/list) |
| LinkedIn | `external` 导入已实现；目录提供原站入口 | 获批应用权限或作者提供的导出；本项目没有全站检索爬虫 | Posts API 的组织/成员读取均有权限范围，不是任意账号的全网搜索授权。[Posts API 权限](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) |
| Bluesky | 已接 Barry Schwartz、Lily Ray、Glenn Gabe 的公开 RSS；另有外部导入 | 当前订阅无需密钥；尚无全站关键词分页适配器 | 标记帖文节选，保留 `bsky.app/profile/.../post/...` 原帖与日期 |
| Mastodon | 已接两个 GEO / AI 搜索公开标签 RSS | 当前实例订阅无需密钥；不覆盖所有实例 | 保留原帖和发布实例，不把局部标签流当成全网搜索 |
| 微信公众号 | 框架已有 `mp_account`；也接受 `wechat` 导入 | `DAJIALA_KEY`、从实际公众号确认的原始 ID、预算；或来源允许的 RSS/授权导出 | 没有预填任何虚构 `ghid`。`mp_account` 不支持手动预览；公开阅读不等于全文转载许可。配置见 [信源](sources.md#mp_account) |
| 知乎 | `external` 导入已实现；目录提供文章/问答入口 | 允许访问的原文、作者导出或授权服务；本项目未实现通用搜索适配器 | 使用回答或专栏文章永久链接，不导入搜索/账号页 |
| 小红书 | `external` 导入已实现；目录提供发现入口 | 作者提供的数据或获准服务；本项目未实现登录后笔记采集 | 使用笔记永久链接；导入器拒绝携带 `xsec_token` 等会话/认证参数的网址，不复制浏览器登录态 |
| 微博 | `external` 导入已实现；目录提供发现入口 | 获准接口、作者导出或来源允许的采集器；本项目未实现 OAuth 适配器 | 保留具体微博或头条文章链接；不要用账号主页代替原文 |
| B 站 | `external` 导入已实现 | 授权账号/开放平台适配器，或作者提供元数据；本项目未实现关键词检索器 | 视频、专栏和动态均可保存原文入口；不声称自动获得字幕。[官方开放平台](https://open.bilibili.com/doc) |
| 抖音 | `external` 导入已实现 | 官方搜索能力需申请并获批；本项目未实现此平台适配器 | 开放页面与部分旧文档说明有差异，以申请结果为准；只在批准范围内处理视频/图文元数据。[搜索能力申请](https://developer.open-douyin.com/product/search)、[视频搜索接口](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/douyin-search-capability/) |
| 掘金 | `external` 导入已实现 | 允许使用的文章数据、作者导出或公开订阅；本项目未实现平台搜索接口 | 使用 `juejin.cn/post/...` 原文链接 |
| CSDN | 已接 V哥AI增长的公开 RSS；另保留外部导入 | 当前作者订阅无需密钥；其他作者须逐源核验 | 使用具体博客文章链接，只保留短摘要 |
| V2EX | 已接 GEO 节点公开订阅；另保留外部导入 | 当前订阅无需密钥；API 2.0 是另一条需凭据的路径 | 保留 `/t/...` 原帖链接与原始日期 |

“external 已实现”表示数据可以进入站内既有处理流程，**不表示已经实现该平台的自动抓取**。未获授权或需登录才能读取的内容保留原站入口；不绕过登录、付费墙、验证码和访问限制。

## 启用 X 多语言发现

模板使用框架已支持的 `config.query` 和 `config.searchType`，没有另造采集器或绕开付费回执。`Latest` 用于追踪新内容；没有点赞数门槛，也没有统一排除回复，以保留小账号和讨论中的线索。SocialData 的语言判断并不总准确，语言标签只作辅助。[操作符说明](https://docs.socialdata.tools/resources/twitter-search-operators/)

| 查询 ID 后缀（统一前缀 `geo-social-x-`） | 覆盖方向 |
|---|---|
| `geo-global`、`aeo-global` | GEO / AEO / LLMO 的核心表达，不限定语言 |
| `ai-search` | AI Overviews、AI Mode、ChatGPT Search、Perplexity 与抓取、引用、发布者等组合 |
| `visibility` | 可见性、基准、实验、研究与测量 |
| `chinese`、`japanese`、`korean` | 中文、日语、韩语原生表达 |
| `spanish`、`portuguese`、`french`、`german`、`italian`、`dutch` | 西班牙语、葡萄牙语、法语、德语、意大利语、荷兰语 |
| `arabic`、`hindi`、`turkish` | 阿拉伯语、印地语、土耳其语 |

实际查询字符串全部在 JSON 文件中。缩写 `GEO` 很容易混入地理信息，模板将缩写与 SEO/AI 语境组合，核心英文全称则单独检索。可以根据漏收样本继续扩词；这些模板不承诺覆盖所有语言或历史帖子。

1. 从模板选定要启用的来源。已有后台来源则按 ID 打开；没有则在 `/admin/sources/new` 按模板的名称、ID、类型和字段创建。采集配置框只粘贴 `config` 内的 JSON。模板的 `enabled` 不是采集配置字段，保存后在后台确认暂停/启用状态。
2. 在后端私有 `.env` 配置 `SOCIALDATA_API_KEY`，重启 API 和 worker；密钥不写进信源文件。
3. 在后台“设置 → 付费请求上限”设置自己接受的 SocialData 分钟/小时/日调用预算；保留预算行，设为 `0` 会停止该服务。模板不修改现有预算，也不自动开通任何订阅。
4. 先预览少量查询，确认结果与 GEO 有关，再启用选定源并按部署说明开启 `COLLECT_ENABLED`。手动预览本身可能产生付费请求，不受自动采集关闭开关保护。
5. 关键词源是发现渠道，默认 `T2`。确认一个账号是机构官方来源后，再为该账号建立单独来源并核对身份，不把整个关键词查询升为官方一手。

首次 X 抓取只读取初始结果页，后续根据水位读取新结果；分页有界，预算中止或服务不可用时可能存在缺口。模板不是历史全量回灌工具。普通 `from:账号 -filter:replies` 查询可利用框架的账号合并采集；这里的复杂关键词查询独立请求，不自动合并。

## 公众号接入

只有确认真实公众号原始 ID 后，才建立 `mp_account`，配置字段是 `ghid` / `nickname`，不要写成 `biz` / `name`。原始 ID 不能从站名、文章标题或账号显示名猜出来。现有采集实现经过 Dajiala 的付费回执和预算。

如果已有获准的文章导出，也可以使用 `platform: "wechat"` 的通用导入路径，保留 `mp.weixin.qq.com/s/...` 原文链接。无论采用哪条路径，全文展示仍默认关闭。

## JSON / JSONL 导入

该工具只读取一个本地文件并调用本项目既有的 `POST /api/ingest/items`，不登录社交平台、不发帖、不发消息。默认只校验，只有显式添加 `--send` 才请求 API。

一条记录的结构如下。尖括号内容必须替换为真实元数据，示例本身会因网址无效而校验失败，不会成为资讯：

```json
{
  "platform": "reddit",
  "sourceId": "geo-social-reddit-seo",
  "sourceName": "Reddit r/SEO",
  "title": "<真实原帖标题>",
  "url": "<真实原帖 HTTPS 永久链接>",
  "publishedAt": "2026-10-16T09:00:00+08:00",
  "author": "<公开作者名>",
  "language": "en",
  "externalId": "<平台原始内容 ID>",
  "backfill": true
}
```

`publishedAt` 应使用原文时间；不确定时显式写 `null`，不要填抓取时间。日期未知的资料会保留为未知，既有后端不会直接将它公开。日期只是格式合法，不等于已核验真实性。首批历史数据推荐设置 `backfill: true` 或 CLI 的 `--backfill`，按历史资料归档，不刷成今日消息。

| 字段 | 要求 |
|---|---|
| `platform` | 必填：`x`、`reddit`、`youtube`、`linkedin`、`bluesky`、`mastodon`、`wechat`、`zhihu`、`xiaohongshu`、`weibo`、`bilibili`、`douyin`、`juejin`、`csdn`、`v2ex` |
| `title` | 必填，真实标题，1–500 字符 |
| `url` | 必填，平台匹配的 HTTPS 内容永久链接；拒绝账号页、搜索页、普通短链、凭据和会话参数 |
| `publishedAt` | 必填，带 `Z` 或 `±HH:mm` 时区的完整 ISO 日期时间；未知为 `null`，不存在的日历日期被拒绝 |
| `sourceId` | 可选，3–80 位小写字母、数字、连字符；默认为 `geo-social-平台`。必须对应外部导入源，不复用 RSS/X 搜索来源 ID |
| `sourceName` | 可选，最多 200 字符；默认为平台的 GEO 外部导入名。同一 ID 的名称和平台必须一致 |
| `author` | 可选，公开作者名，最多 200 字符 |
| `language` | 可选，如 `zh-CN`、`en`、`ja` |
| `externalId` | 可选，平台内容 ID，最多 200 字符；作为追溯元数据保留 |
| `backfill` | 可选布尔值；`true` 表示历史回灌 |

可输入 JSON 数组、`{ "schemaVersion": 1, "items": [...] }`，或者一行一条的 JSONL。拒绝未列出的字段，文件限 10 MiB、最多 5,000 条。工具先校验整个文件，再按原文 URL 判重、按来源分组、每批最多 50 条提交；单批失败时停止，不自动重试。

**现有 ingest API 只接收标题、网址、时间、作者及原始元数据，不接受 `bodyText`、`summary` 或视频字幕。** 原文正文是否能进一步读取、何时完成处理及能否公开，仍取决于已有后端流程和来源权限。该工具不会把导出中的长文本悄悄当成可转载全文。平台、语言、外部 ID 保存在 `raw._geo` 中用于追溯，不会新增公开 API 字段。

在仓库根目录使用 Node.js 24：

```powershell
# 不发网络请求，无需令牌
node modules/geo-directory/scripts/social-ingest.ts --file .data/social-items.jsonl

# 首批历史导出，同样只校验
node modules/geo-directory/scripts/social-ingest.ts --file .data/social-items.jsonl --backfill --dry-run

# 确认文件后，将其送入本机 API；INGEST_TOKEN 从 .env 读取，不放在命令参数里
node --env-file=.env modules/geo-directory/scripts/social-ingest.ts --file .data/social-items.jsonl --backfill --send

# 指定自己部署的 API 根地址
node --env-file=.env modules/geo-directory/scripts/social-ingest.ts --file .data/social-items.jsonl --send --api-base https://你的站点域名
```

`INGEST_TOKEN` 必须与服务端一致，至少 16 位。API 根地址也可通过 `GEO_INGEST_API_BASE` 设置，默认 `http://127.0.0.1:3001`。该环境变量仅供本 CLI 使用。远程地址要求 HTTPS；HTTP 仅用于本机。Docker 部署通常从公开站点端口访问，按自己的映射设置 `--api-base`，不要假定容器的 3001 已暴露。

提交只走 `/api/ingest/items`，不会跟随重定向传递 token。每批间隔至少 6.1 秒，适配默认每分钟 10 次的入口限制；收到 429/503 后按 `Retry-After` 等待再运行。日志只报告数量、批次、HTTP 状态，不打印输入数据、密钥或响应正文。部分批次已成功时，可按 URL 判重重跑；响应结果未知时先查看后台。

不存在的 `sourceId` 会由既有后端创建为 `external + isolated`，**不会立即公开**。在后台核对来源后切换参与方式为 `editorial`；若预先建立的模板仍为暂停状态，接口返回 409，需要先在后台启用。启用导入来源只允许接收数据，不会自动抓取该平台。

长期运行时，建议按账号、社区或实际发布机构分来源，而不是把所有作者都放进同一个平台来源，否则热点里的来源计数不能代表独立发布者数量。热度也不等于事实可信度。

## 接入自己的 API 适配器

外部适配器负责平台侧的授权、关键词搜索、分页/水位、速率限制、撤稿和删除处理；输出上述 JSONL 后交给此 CLI。推荐保留每个平台的采集状态、请求时间和已读游标，并在平台返回限流/授权错误时停止。当平台不提供可用接口或授权不足时，把来源留在 `/atlas` 的原站入口，避免显示为已自动接入。

对接输出的最低标准：一个内容永久链接、一条原始发布时间（未知为 `null`）、公开标题和作者、明确的平台，以及可追溯的内容 ID。不要导出私信、登录 cookie、API 凭据或账号私有资料。

本仓库已有 RSS、网页列表、JSON 列表可复用；先用允许公开的订阅和文档接口，再为确有授权的 API 写适配器。具体配置项和测试入口见 [信源文档](sources.md)。模板 `config` 只接受已有采集器支持的键，不能把 `tokenEnv` 等新字段写进去期待自动生效。

## 验证

```powershell
npx tsc -p modules
node --import ./tests/standalone.ts --test modules/geo-directory/tests/social-ingest.standalone.test.ts
```

测试使用本地文件和模拟 HTTP 返回，覆盖日期/平台/原文链接验证、未知字段、来源一致性、判重、50 条分批、默认 dry-run、令牌必需、禁止重定向与错误输出不泄露令牌。它们不连接真实社交服务，也不能证明已取得平台访问权限或已完整抓取实际数据。
