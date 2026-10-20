# GEO 学习地图

面向全球生成式引擎优化（GEO）的信源目录与公开资讯流。优先发现有信息增量的官方变化、原始研究、公开数据和作者实测，追踪 AI 搜索、内容发现、引用、品牌可见度、实操与测量，保留原始出处和原文语言。

基于 [AIHOT](https://github.com/KKKKhazix/AIHOT) 开源引擎定制；[上游说明](docs/upstream-README.md)保留供参考。代码使用 MIT 许可，原文内容权利属于各来源。

## 接手开发

这是持续开发版本。生产数据库、聊天记录、原始正文、密钥及个人自动化不随代码发布；新部署需要自己的数据。先读 [接手说明](docs/handoff.md)，了解已知体验问题、架构和验证方法。完整日报配置见 [日报同步](docs/geo-editions.md)。

## 从哪里看

- **`/atlas` 全球信源**：官方平台、论文、媒体、工具、实践作者和国内外社交社区。支持按官方/研究/作者/厂商/社区的来源性质，以及语言、地区、类型、关键词筛选及 OPML 导出。
- **`/` 今日重点**：近 24 小时变化、今日补齐与历史参考分开，先看结论与选读理由。
- **`/library` 解读库**：按工作问题与关键词查找完整解读。
- **`/following` 我的关注**：本浏览器保存关注、继续阅读与已读状态，概要更新后重新提示未读。
- **`/all` 全部动态**：无需模型或付费采集 API。支持渠道、原帖/网页/聚合索引、最近时间、语言、来源与关键词筛选；多个关键词须同时命中，双引号保留短语，并显示匹配位置。同日同语言的相似长标题默认折叠，可展开每条原链接及独立收藏，也可切回逐条阅读。简洁/摘要偏好保存在当前浏览器。`/stream` 保留查询后跳转这里。
- **`/hot` 热点榜**：按近期主题的来源域名数与条目数聚合，说明统计时间范围；不把报道覆盖当成平台热度。
- **`/daily` 日报**：统一进入今日重点；整期报告先读核读重点，再按需打开原始全文。历史日期归档保留。见 [产品路径](docs/geo-reading-product.md)。
- **`/topics` 学习主题 / `/starred` 收藏**：浏览命中主题的内容；收藏保存在当前浏览器，可导出备份并继续站内阅读。
- **站内阅读**：点击精选、动态、主题、日报或收藏中的标题和配图，进入 `/read/:id`。有完整概要的内容显示核心结论、关键发现和 GEO 启示；通过后台语义复核的自动稿标注“AI 整理”，并保留研究范围及限制；其余条目明确显示来源摘要。可切回原文摘要，按需打开来源链接；返回后保留列表筛选和页码。见 [阅读概要](docs/geo-reader.md)。
- **中文阅读**：外文标题和短摘要由后台自动翻译，默认显示已有中文译文，可全局或逐条切回原文；收藏也保留双语，并同步原文版本相符的新译文。中文和外文均可搜索，原文链接保持不变。专业术语按原文语境统一，中文视图显示补译进度，当前卡片会原地更新，不打断分页与阅读。卡片“纠错”可提交译文建议，审核通过后显示“已修订”。
- **`/admin`**：后台管理；管理员密码在本机 `.env` 的 `ADMIN_PASSWORD` 中。

目录入口数不等于已自动采集的平台数。X 和 Reddit 通过公开作者文章发现链接，再读取平台公开嵌入内容；Bluesky、Mastodon、V2EX、CSDN 等已有公开订阅。公众号接入搜狗公开搜索索引，知乎接入逐条核验发布方的 Google News 索引，大数跨境补充作者文章及转载。索引与转载明确标示出处，小红书仍未找到稳定的免登录自动笔记入口；详见[国内来源核验](docs/geo-domestic-research.md)。

## Windows 本地启动

需要 Node.js 24.11+。本机已验证可用独立 PostgreSQL 运行，无需先修复 Docker Desktop。

```powershell
npm ci
node scripts/init-geo-local.mjs
New-Item -ItemType Directory -Force .data/runtime
Set-Content .data/runtime/package.json '{"private":true,"type":"module"}'
npm install --prefix .data/runtime embedded-postgres@18.4.0-beta.17
```

启动数据库并保持终端运行：

```powershell
node --env-file=.env scripts/local-db.mjs
```

另一个终端初始化：

```powershell
node --env-file=.env scripts/migrate.ts
node --env-file=.env scripts/seed.ts
```

启动后端和网页，各保持一个终端运行：

```powershell
node --env-file=.env apps/api/src/main.ts
```

```powershell
npm run dev:web
```

打开 [全球信源](http://localhost:3000/atlas) 或 [公开资讯流](http://localhost:3000/stream)。本地服务只监听本机；PostgreSQL 使用 `55432` 端口，数据位于 `.data/postgres`。

完成首次初始化后，重启电脑或部分服务退出时可一键恢复；重复执行会复用已有服务：

```powershell
./scripts/start-geo.ps1
./scripts/start-geo.ps1 -Action status
```

后台启动、服务身份核验、日志和网页重建限制见 [本机启动与恢复](docs/geo-local.md)。

## 无密钥公开采集

在 `.env` 设置 `PUBLIC_FEED_COLLECT_ENABLED=true`。保持 `COLLECT_ENABLED=false`、`MODEL_CALLS_ENABLED=false`、飞书和 IndexNow 开关关闭；公开流独立运行，不消费模型服务或付费社交 API。

```powershell
# 立即采一轮
node --env-file=.env modules/geo-directory/scripts/collect-public.ts

# 持续运行，每轮结束 30 分钟后检查到期来源，进程异常结束后 5 分钟重启
node --env-file=.env modules/geo-directory/scripts/watch-public.ts
```

机器有正常出网代理时，将已有 HTTP 代理地址填入 `.env` 的 `EGRESS_PROXY_URL`。原引擎不会自动把 `HTTPS_PROXY` 当作这项配置，这可能造成浏览器能打开、Node 采集却超时。不要提交代理密码或密钥。

采集器有独立的数据库互斥锁与心跳，避免多个终端重复采集；数据库连接丢失时退出该轮，由守护入口恢复。页面显示最近心跳、下轮时间、过期状态与社交文章待办数。临时的整轮错误 5 分钟后重试，单源失败保留其他结果。持续采集需要电脑、数据库和守护入口运行；一键恢复入口在后台启动缺失服务，电脑重启后执行 `./scripts/start-geo.ps1` 恢复。尚未安装 Windows 开机任务。

守护对普通公开来源执行 `interval_minutes`：最近一次尝试（包括失败）尚未到期时不重复请求，原成功时间及失败信息保持不变。RSS/HTML 来源通常 2–6 小时，arXiv 两路 API 检索按官方每日更新节奏设为 24 小时，所有 arXiv 子域请求共享单进程串行与至少 3 秒间隔。社交来源继续沿用自己的文章、帖子刷新队列。显式不带 `--watch` 的单次采集仍用于初始化或已核实的新入口修复。

公开流使用多语言关键词筛选，可能包含边缘相关资料，也可能遗漏隐含相关内容。精选、日报和主题页面均使用规则与来源摘要，无需模型 API。外文标题与摘要自动翻译；模型评分与生成式解读仍未开启。没有发布日期时保留未知；只对配置了明确发布日期规则的来源补查详情日期，不以采集时间冒充发布时间。

## 社交媒体接入

当前无需密钥的 X / Reddit 采集配置在 `industry/public-social.json`，随上述公开采集命令运行。公开 RSS 与作者文章中的原帖链接进入持久队列，逐轮读取；失败重试与每轮读取上限防止漏掉待办链接。机制、开源参考与实测范围见 [X / Reddit 研究记录](docs/geo-x-reddit-research.md)。

另一条可选接入路径见 [社交接入说明](docs/geo-social.md)：`industry/social-sources.json` 保留暂停状态的 API 检索与外部平台模板。JSON/JSONL 外部导入脚本默认只做校验，显式 `--send` 才向本站导入，不向社交平台发帖。

来源与实测记录见 [信源核验](docs/geo-sources.md)。Google Search、Bing Search、arXiv GEO、Tow Center、SparkToro Research、GSQi 和 SearchPilot 的方法证据见 [高价值来源核验](docs/geo-quality-sources.md)；后续新增 DEJAN、Zyppy Signal、Pew，详见 [扩源核验](docs/geo-quality-expansion.md)。优先级按信息价值安排，不以补齐社交平台为目标；来源身份不等于逐篇质量认证。评分边界与待完成的真实样本校准见 [编辑标准](docs/geo-editorial.md)。

全部动态默认推荐，可切最新；方法/实测/平台变化线索优先，营销、明确转载、聚合和泛 AI 靠后，规则见 [阅读排序](docs/geo-reading-quality.md)。资讯卡片只展示内容与必要出处，不显示采集和排序过程说明。RSS 配图、原文封面和 X 原帖照片进入同一图片链路，缺图自动分批补查，失败收起；见 [封面采集与重试](docs/geo-images.md)。

来源摘要优先保留完整句子，清理已核对的订阅导航尾注，保留原始摘录供后台复核；未取得的文字不猜补。收藏同步、版本保护和轻量纠错的使用范围见 [阅读改进](docs/geo-reading-improvements.md)。

当前本机采集结果、已通过检查和完整测试的剩余兼容问题见 [验收记录](docs/geo-validation.md)。

## 自动中文翻译

在 `.env` 设置 `PUBLIC_TRANSLATION_ENABLED=true`、`PUBLIC_TRANSLATION_PROVIDER=bing`，然后重新启动公开采集守护。普通公开网页翻译无需用户密钥，每秒最多一个请求，译文缓存到数据库；遇到限流或访问检查会停止请求、按要求延后，冷却状态重启后保留。

后台独立处理翻译队列，优先近期高价值内容，再补历史；不必等下一轮采集。需要离线运行时，也可安装腾讯专用翻译模型 Hy-MT2：

```powershell
node --env-file=.env modules/geo-directory/scripts/setup-translation.ts
```

安装后切换 `PUBLIC_TRANSLATION_PROVIDER=local` 并重启采集守护，运行阶段无需外网。本地模型支持当前采集的英语、日语、韩语、德语、西班牙语、葡萄牙语、法语等外文。两种模式均保持原引擎 `MODEL_CALLS_ENABLED=false`，不启用付费编辑流程。

译文按原文版本保存在数据库，重复文本复用，原文变化自动重译；未完成或失败的条目显示原文，后台延迟重试。机器译文可随时对照原文。详见 [翻译配置](docs/geo-translations.md)。

## 配置位置

| 文件 | 用途 |
| --- | --- |
| `industry/source-directory.json` | 全球来源、账号与检索入口 |
| `industry/sources.json` | 可采集的 RSS / 网页 / JSON 配置 |
| `industry/public-social.json` | X / Reddit 公开原帖及动态发现入口 |
| `industry/taxonomy.ts`、`industry/topics.json` | GEO 分类、平台与主题 |
| `industry/prompts/` | GEO 宽召回、评分、写作与归组 |
| `modules/geo-directory/` | 信源目录、公开流与采集 |
| `site/` | 品牌与页面文案 |
| `.env` | 本机运行配置和密钥，不提交 |

## 验证与上线

```powershell
npm run typecheck
npm run build -w @aihot/web
node --test modules/geo-directory/tests/*.standalone.test.ts
node scripts/check-geo-public.mjs
node scripts/smoke.ts --base http://localhost:3000
```

完整后端测试使用 `node scripts/test-local.ts`，仅读 `.env` 的本机数据库连接，生成随机 `*_test` 模板和每文件副本，不继承应用密钥与开发开关；详见 [隔离本机测试](docs/geo-test-local.md)。正式部署沿用 [Docker 部署说明](docs/deploy.md)，公开采集命令作为独立进程运行。当前使用规则和隐私说明为草案，对外发布前需确认运营信息与条款。

