# 参与贡献

[返回项目首页](README.md) · [开发交接](docs/handoff.md)

欢迎改进 GEO 学习地图的阅读体验、中文翻译、来源质量、采集稳定性与文档。中文或英文均可。

## 先给出一个具体问题

在 [本仓库 Issues](https://github.com/Fangx-AI/geo-learning-map-news/issues) 报告问题或讨论方案：

- **阅读体验：** 从哪个入口进入、希望完成什么、在哪里受阻，附桌面或手机截图。
- **翻译或解读：** 提供原文链接、具体句子与依据，不把推测写成来源事实。
- **采集或运行：** 提供提交版本、运行方式、复现步骤与脱敏错误。
- **新增信源：** 提供原始机构、公开入口、内容示例和收录理由；目录标签不能代替内容核验。

安全漏洞按 [安全报告说明](SECURITY.md) 处理，不在公开 Issue 放可利用细节。

## 本地开发

1. Fork 本仓库，从最新 `main` 创建分支。
2. 按 [首次启动](docs/getting-started.md) 配置自己的环境，阅读 [AGENTS.md](AGENTS.md) 和对应模块文档。
3. 保持一次 PR 解决一个清楚的问题；不夹带无关重构或依赖锁文件变动。
4. 向 [本仓库](https://github.com/Fangx-AI/geo-learning-map-news/pulls) 提交 PR，说明问题、改动与验证结果。页面改动附桌面和手机截图。

GEO 的信源与编辑规则在 `industry/`，品牌与导航在 `site/`，采集和阅读功能主要在 `modules/geo-directory/`。框架通用能力才考虑同步给上游 AIHOT；不必把本站专属需求提交到上游。

## 验证改动

纯文档改动核对事实、命令、链接与 GitHub 展示，无需新增业务测试。

代码改动运行相关检查；后端使用独立测试数据库，测试库名必须以 `_test` 或 `_ci` 结尾，账号需有 `CREATEDB` 权限：

```bash
npm run typecheck
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
```

完整后端测试与 Windows 依赖配置见 [隔离测试](docs/geo-test-local.md)。网站运行后执行：

```bash
node scripts/smoke.ts --base http://localhost:3000
```

测试不连接真实付费模型或外部推送服务。数据库变更遵守 [迁移约定](docs/architecture.md#数据库迁移)，不修改已发布的迁移；涉及部署、配置或数据升级时同步更新文档。

## 提交前

- 不提交 `.env`、密钥、Cookie、生产数据库、私有全文或聊天记录。
- 截图与日志去掉个人信息，素材具有使用权限。
- 保留来源归因、原文链接、样本范围与不确定性；不伪造数据或采集覆盖率。
- 保留 [MIT](LICENSE) 原始版权声明；第三方内容权利见 [NOTICE](NOTICE)。

PR 描述写清实际通过和未通过的检查，等待仓库 CI 与维护者审阅；不要把旧版本的测试结果当成本次验证。
