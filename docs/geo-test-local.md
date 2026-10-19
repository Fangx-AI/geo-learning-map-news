# 隔离本机测试

使用本机 `.env` 的 PostgreSQL 连接运行完整后端测试：

```powershell
node scripts/test-local.ts
```

这个入口只读取 `.env` 的 `DATABASE_URL`，将数据库名替换为带时间与随机后缀的 `*_test`。每个测试文件再创建自己的随机命名副本，避免 Windows 复用 PID 时碰到旧副本。原数据库名与数据不被修改。测试子进程关闭后，入口在 `finally` 中清理本轮确切模板名及其严格格式的文件副本，补上全局清理失败和模板遗留的路径；不再把每轮随机模板永久保留。

不需要给命令添加 `--env-file=.env`。父进程的应用配置、模型密钥、代理、`NODE_OPTIONS` 和真实会话密钥不传给测试；保留 PATH、临时目录等系统环境。数据库连接凭据是唯一保留的应用凭据，输出会遮盖连接串及密码。测试中的模型与采集开关显式开启，让测试指向本地假服务；公开采集、飞书和 IndexNow 保持关闭。凭据目录指向不存在的测试路径，避免读到本机真实服务凭据。

只运行相关文件，或运行不需要数据库的检查：

```powershell
node scripts/test-local.ts --concurrency=2 tests/analyze-consistency.test.ts tests/analyze-missing-evidence.test.ts tests/analyze-shutdown.test.ts tests/translate-shutdown.test.ts
node scripts/test-local.ts --standalone tests/test-local.standalone.test.ts tests/geo-local.standalone.test.ts
```

入口接受 `--concurrency=1` 至 `6`，默认 `4`。无文件参数时包括根 `tests/` 与各模块测试，未排除失败用例。它不下载数据库、OpenSSL 或备份工具；涉及这些外部可执行文件的测试仍需本机 PATH 提供相应程序。本机 `.data/runtime` 的 PostgreSQL 运行包不含 `pg_dump`，因此运行备份集成检查前需单独提供相同或兼容版本的备份工具，不能把工具缺失当作通过。

## 本轮测试库清理范围

清理只接受入口本次生成的 `geo_<时间>_<12位随机十六进制>_test` 名称，以及它对应的 `_f<PID>_<8位随机十六进制>_test` 副本。只连接本机地址，拒绝连接覆盖参数、任意数据库名和其他轮次的名字；不会按宽泛的 `*_test` 扫库，也不会删除数据库文件夹。

每个库删除前检查所有尚存连接，包括空闲连接。有连接就保留，使用不带 `FORCE` 的 `DROP DATABASE`，不终止会话；[PostgreSQL 的删除语义](https://www.postgresql.org/docs/18/sql-dropdatabase.html)也使检查之后出现的新连接阻止删除。单个副本失败不妨碍尝试其余本轮副本；副本尚有遗留时同时保留模板。连接超时 5 秒，语句超时 5 秒，锁等待上限 1 秒，不无限等待当前数据库恢复。

原始测试输出和退出码保留，清理结果另行报告：删除数量、保留名称、简短原因。原测试失败不会因清理成功变绿；原测试成功但仍有清理错误时入口返回非零。错误中不输出原始数据库连接或 SQL 参数。`--standalone` 不执行数据库清理，也不读取 `.env`。

这些措施只处理此次 `test-local.ts` 运行拥有的数据库。Node 的[全局清理文档](https://nodejs.org/docs/latest-v24.x/api/test.html#global-setup-and-teardown)明确说明，全局初始化抛错时不会调用全局清理；此前的入口也没有删除随机模板，下一轮的新模板名无法匹配上一轮遗留副本。父入口被强制结束、断电或数据库不可用时，仍可能留下本轮库，需依据保留的测试日志另行核对；本入口不会擅自删除旧轮次未知库。备份测试自行创建的 `_restore_test` 子库由该测试的 `after` 管理，不在此处扩展模糊匹配。`npm test` 和共享 `tests/databases.ts` 的原有行为未改变。

2026-10-17 的本次修复通过 `node scripts/test-local.ts --standalone tests/test-local.standalone.test.ts`，7/7；测试用注入的假数据库客户端验证精确范围、外部主机拒绝、连接竞态、部分失败继续、脱敏及退出码保留。`npm run typecheck` 通过。本次没有连接或清理正在恢复的本机数据库，尚未做真实 DROP 的集成验证；不将这些独立函数检查表述为已完成历史库清理。

## Windows 的关闭语义

Node 官方文档说明 Windows 上 `child.kill('SIGTERM')` 会强制结束子进程，不执行可等待的 POSIX 关闭流程：[Child process — subprocess.kill](https://nodejs.org/api/child_process.html#subprocesskillsignal)。

`analyze-shutdown` 和 `translate-shutdown` 在 Windows 中使用仅存在于测试子进程内的 IPC 消息，调用与 SIGTERM 注册的同一个关闭 handler；测试名称明确写 `Windows IPC shutdown`。POSIX 平台仍发送真实 SIGTERM。两种路径都验证已发送请求的回执保存、停止新增调用、事务结果和下一进程复用回执，没有跳过断言，也不声称 Windows 验证了 POSIX 信号。生产关闭机制不受此测试适配影响。

此前从开发 `.env` 继承的 `MODEL_CALLS_ENABLED=false` / `COLLECT_ENABLED=false` 会覆盖 `tests/setup.ts` 的缺省值，导致部分分析/缺证据用例没有执行其本地假服务调用。隔离入口消除这类配置污染；完整回归是否通过仍以当前实际运行结果为准，见 [验收记录](geo-validation.md)。

本机已找到 Git 自带的 OpenSSL（`D:/software/Git/usr/bin/openssl.exe`）。可只在当前测试终端把该目录加入 PATH，不修改系统环境；出站 TLS 协议 4 项在此条件下通过。响应头测试子进程现恢复 mock 并自然退出，避免 `process.exit(0)` 在 Windows 提前关闭 libuv handle；原有允许主机、超限、跨主机重定向和私网阻断断言均保留，2 项通过。备份测试仍缺 `pg_dump`；这与公开采集读取功能分别验收。
