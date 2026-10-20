# 首次启动

[返回项目首页](../README.md) · [文档导航](README.md)

目标是先把网站运行起来，再看到自己采集的公开动态。完整中文解读和整期日报需要另外准备内容，不随安装自动生成。

## 选择运行方式

- **Windows 本地开发：** 按下文操作，使用独立 PostgreSQL，无需 Docker。
- **服务器或已有 Docker 环境：** 使用 [Docker 部署](deploy.md)，不要混用下文的本地数据库配置。

需要 Node.js **24.11+**、npm、Git，以及可访问 npm 和目标信源的网络。

## 1. 下载与初始化

在 PowerShell 中执行：

```powershell
git clone https://github.com/Fangx-AI/geo-learning-map-news.git
cd geo-learning-map-news
npm ci
node scripts/init-geo-local.mjs
New-Item -ItemType Directory -Force .data/runtime
Set-Content .data/runtime/package.json '{"private":true,"type":"module"}'
npm install --prefix .data/runtime embedded-postgres@18.4.0-beta.17
```

初始化脚本生成本地 `.env` 与随机密码；已有配置不会被覆盖。管理员密码在 `ADMIN_PASSWORD` 中。数据库仅监听 `127.0.0.1:55432`，数据保存在私有 `.data/postgres/`。

## 2. 启动数据库

在项目根目录运行，保持此终端开启：

```powershell
node --env-file=.env scripts/local-db.mjs
```

看到 `GEO 本地 PostgreSQL 已启动` 后，在**另一个终端**进入同一项目目录，初始化数据库结构和种子配置：

```powershell
node --env-file=.env scripts/migrate.ts
node --env-file=.env scripts/seed.ts
```

## 3. 打开网站

分别在两个终端中启动 API 与网页，保持运行：

```powershell
# 终端 A
node --env-file=.env apps/api/src/main.ts
```

```powershell
# 终端 B
npm run dev:web
```

访问 [本机网站](http://localhost:3000/)，或打开 [全球信源](http://localhost:3000/atlas)。网站能打开、信源目录能显示，说明基础服务已启动；此时没有生产资讯和完整解读属于正常状态。

## 4. 采集第一批公开动态

编辑项目根目录的 `.env`，设置下面几项。保持其他外部推送关闭：

```dotenv
COLLECT_ENABLED=false
MODEL_CALLS_ENABLED=false
PUBLIC_FEED_COLLECT_ENABLED=true
PUBLIC_TRANSLATION_ENABLED=true
PUBLIC_TRANSLATION_PROVIDER=bing
PUBLIC_READER_BRIEFS_ENABLED=false
```

原引擎的采集、付费模型流程与 GEO 公开采集是不同通道，以上配置只开启公开采集与短摘要翻译。运行一次采集：

```powershell
node --env-file=.env modules/geo-directory/scripts/collect-public.ts
```

查看 [全部动态](http://localhost:3000/all)。有可用来源及相关结果时，会出现标题、来源、日期与原文链接；翻译尚未完成的条目先显示原文。

需要持续更新时，启动独立守护，保持终端运行：

```powershell
node --env-file=.env modules/geo-directory/scripts/watch-public.ts
```

守护按来源间隔检查更新，并维护翻译队列。持续采集依赖机器、数据库及进程运行；不是安装后就永久在线。改变翻译配置后需重新启动对应守护。详见 [运行与恢复](geo-local.md)、[翻译配置](geo-translations.md)。

## 5. 让首页有可直接阅读的内容

| 内容 | 如何产生 | 首先在哪里查看 |
| --- | --- | --- |
| 标题与来源摘要 | 公开采集 | 全部动态 |
| 中文标题与短摘要 | 后台翻译队列 | 全部动态，可切原文 |
| 完整中文解读 | 核读完整原文、核对证据后导入 | 解读库、今日重点 |
| 整期日报 | 导入完整报告，或配置授权的聊天同步环境 | 日报归档 |

完整解读按 [概要导入流程](geo-reader.md) 保存，不能把来源摘要标成完整解读。整期日报按 [日报同步说明](geo-editions.md) 配置；个人聊天、运行中的自动化及历史生产数据不包含在仓库中。

## 日常启动与排查

初次数据库初始化完成后，也可以使用后台恢复入口，复用已有服务、补启动缺失服务：

```powershell
./scripts/start-geo.ps1
./scripts/start-geo.ps1 -Action status
```

该入口未安装开机任务。开发服务器已运行时不要再强行启动另一份；启动器会核验已有服务身份。更多说明见 [本机启动与恢复](geo-local.md)。

| 现象 | 先检查什么 |
| --- | --- |
| 首页没有文章 | 解读库是否已有完整解读；采集结果先看全部动态 |
| 所有页面连接失败 | 数据库、API、网页三个服务是否在运行，端口是否被占用 |
| 有外文但没有中文 | 翻译开关、守护状态、服务冷却或限流；失败时保留原文 |
| 浏览器能访问，采集器超时 | 是否需要在 `.env` 配置 `EGRESS_PROXY_URL`；不会自动沿用浏览器代理 |
| 日报没有新一期 | 是否已配置来源与执行环境，分段是否齐全；缺段不会发布 |

私有日志在 `.data/local-services/`。提交问题前去掉密码、Cookie 和个人数据。对外部署另需核对站点地址、运营信息与条款，参考 [部署与升级](deploy.md)。
