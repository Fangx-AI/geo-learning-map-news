# 文档导航

[返回项目首页](../README.md)

第一次运行，从 **[首次启动](getting-started.md)** 开始。接手代码，从 **[开发交接](handoff.md)** 开始。下面按任务找说明，不需要按文件顺序通读。

## 使用与开发

| 我想做什么 | 阅读文档 |
| --- | --- |
| 在本机启动网站并采集第一批内容 | [首次启动](getting-started.md) |
| 恢复服务、查看进程状态与日志 | [本机运行](geo-local.md) |
| 理解首页、最新资讯和折叠规则 | [资讯首页改版](geo-news-home.md) |
| 理解解读库和阅读页的分工 | [产品阅读路径](geo-reading-product.md) |
| 接手项目，找到修改位置 | [开发交接](handoff.md) · [架构](architecture.md) |
| 提交改动或验证功能 | [贡献指南](../CONTRIBUTING.md) · [隔离测试](geo-test-local.md) |
| 部署服务器、备份或升级 | [部署与升级](deploy.md) |

## 采集与翻译

| 我想做什么 | 阅读文档 |
| --- | --- |
| 配置 RSS、网页及其他公开来源 | [信源配置](sources.md) · [GEO 信源核验](geo-sources.md) |
| 理解 X、Reddit 的实际覆盖范围 | [公开采集研究](geo-x-reddit-research.md) · [可选社交接入](geo-social.md) |
| 了解公众号、知乎等国内入口 | [国内来源核验](geo-domestic-research.md) |
| 配置中文翻译或本地翻译模型 | [翻译配置](geo-translations.md) |
| 处理图片、原文封面及失败重试 | [图片采集](geo-images.md) |
| 查看降噪与编辑规则 | [阅读排序](geo-reading-quality.md) · [编辑标准](geo-editorial.md) |

## 解读与日报

- **[完整中文解读](geo-reader.md)**：字段、原文版本、私有证据与导入流程。
- **[整期日报](geo-editions.md)**：来源授权、分段协议、完整性检查及去重。
- **[今日重点与资料库](geo-daily.md)**：时间窗口、原文日期与内容选择。
- **[收藏与阅读改进](geo-reading-improvements.md)**：译文同步、摘要与用户操作。
- **[译文纠错](geo-corrections.md)**：建议提交与审核边界。

## 阅读历史记录时

带日期的核验、扩源和测试文档记录的是**当时的环境与结果**，不代表新部署已经通过，也不代表来源一直可访问。当前产品入口以 [资讯首页改版](geo-news-home.md) 和 [产品阅读路径](geo-reading-product.md) 为准；当前运行方式以首次启动和部署文档为准。

原始框架背景见 [上游 README](upstream-README.md)。上游的模型流水线、演示截图与运营方式不等于本站当前配置。
