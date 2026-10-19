# 译文纠错与审核

资讯卡片的「纠错」入口打开轻量表单，显示原文对照，让读者修改中文标题或摘要。建议提交成功后进入待审核，不会直接改变站内译文。页面继续提供原文链接和中文／原文切换。

## 提交接口

`POST /api/geo/translation-corrections`，JSON：

```json
{
  "itemId": "64 位小写十六进制条目 ID",
  "original": { "title": "Exact original title", "summary": "Exact original excerpt", "language": "en" },
  "proposed": { "title": "修订后的中文标题", "summary": "修订后的中文摘要" },
  "note": "可选说明"
}
```

- `original` 必须逐字匹配当前原文，摘要没有时为 `null`；来源停用或原文变化后不能继续提交旧版本。
- 中文标题最多 2,000 字符，摘要最多 6,000，说明最多 500；原文无摘要时不能新增摘要。不接受没有改动的建议。
- 浏览器 `Origin` 必须精确匹配配置的 `SITE_URL` 源；拒绝跨站和缺少 Origin 的请求，不开放跨域写入。
- 复用现有反馈来源哈希与禁用名单，不存原始 IP。每个来源每分钟最多 5 条、每天最多 30 条；同一内容最多同时保留 20 条待审建议。
- 相同来源、原文版本和修订内容的重复提交返回原待审编号；已经审核过的相同建议不再次入队。
- 新建议返回 `201 {id,status:"pending"}`，重复待审返回相同 JSON 和 `200`；`409` 表示原文已变或建议已处理，`422` 表示内容校验失败，`429` 带 `Retry-After`。所有响应 `no-store`。
- 建议内容、说明、来源哈希和审核记录不进入公开读取接口。

## 管理员网页审核

登录后台后进入「译文纠错」。待审列表优先显示最早 100 条；处理后继续补入下一批。每条建议并排提供原文、当前机翻与建议，保留原文链接。原文已更新或来源停用时不能应用旧建议，可注明原因后拒绝。

接口 `GET /api/admin/geo/translation-corrections?status=pending` 返回 `{rows}`；状态可选 `pending`、`applied`、`rejected`、`superseded`、`all`。其他状态按最新 100 条显示。`POST /api/admin/geo/translation-corrections/:id/review` 接收 `{action:"apply"|"reject",note?}`；拒绝必须说明原因。两个接口复用现有管理员会话校验，写入额外要求 `X-CSRF-Token`。操作由真实管理员姓名记录，并以 `actorOf(admin)` 同事务写入审计日志。普通读者不能读取建议列表或执行审核。

## 本机维护命令

拥有本机项目和数据库访问权限的维护者使用以下命令。运行环境与服务相同，不调用翻译模型或外部网站。

```powershell
# 查看最近 100 条待审建议，含是否已过期；all 可查看完整状态列表
node --env-file=.env modules/geo-directory/scripts/review-corrections.ts list
node --env-file=.env modules/geo-directory/scripts/review-corrections.ts list all

# 对照原文、建议、原文链接与当前版本
node --env-file=.env modules/geo-directory/scripts/review-corrections.ts show 123

# 默认仅预览；确认措辞、事实与原文一致后显式应用
node --env-file=.env modules/geo-directory/scripts/review-corrections.ts apply 123
node --env-file=.env modules/geo-directory/scripts/review-corrections.ts apply 123 --write

# 拒绝必须记录简短原因；同样默认仅预览
node --env-file=.env modules/geo-directory/scripts/review-corrections.ts reject 124 --note "原文没有这个结论"
node --env-file=.env modules/geo-directory/scripts/review-corrections.ts reject 124 --note "原文没有这个结论" --write
```

审核应核对术语、数字、主语、因果关系、语气和原文截断处，不能为了顺畅而补结论。程序会额外拦截已知漏译、凭空添加年份和百分比变化；这些检查不能替代内容审核。修改建议内容请重新提交，再拒绝旧建议，保留完整记录。

应用使用数据库事务锁定原文，并再次核对标题、摘要、语言及来源状态。同版本原有修订改为 `superseded`，新修订标为 `applied`，记录本机审核用户名、时间与可选说明。拒绝为 `rejected`。已处理建议不能重复应用。

修订以独立覆盖层保存，公开读取层优先使用与当前原文精确匹配的已应用修订，`translation.provider` 为 `geo-reviewed-v1`，页面标记「修订」。后台机翻、在途翻译响应和批量术语修复只更新机翻缓存，因此不会盖掉修订。采集后原文变化时旧修订自动失效，新版机翻可正常继续；历史修订仍可在审核列表查看。

搜索、资讯流、主题／日报、翻译批量读取和补译进度使用同一有效译文。应用时间进入进度 `updatedAt`，让已经打开的中文卡片和收藏能够获取最新修订。收藏同步遵守当前原文版本，原文链接不被纠错修改。

## 上线顺序与验证

先执行普通数据库迁移，再重启 API／重新构建网页。迁移 `0110` 创建建议表，`0111`、`0112` 创建并发索引；不修改历史数据，不修改既有迁移。

`modules/geo-directory/tests/translation-corrections.test.ts` 覆盖私有待审、只读预览、应用／替换／拒绝、失效原文与停用来源、在途机翻竞态、公开搜索与状态更新、数字校验、同源限制、幂等去重与限流，以及真实本机管理员会话、缺失 CSRF 拒绝和审核审计记录。所有数据库测试只写独立测试库，不访问真实翻译服务。
