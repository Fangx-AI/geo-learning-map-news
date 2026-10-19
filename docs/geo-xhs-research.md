# 小红书公开路线的本轮证据

核验日期：2026-10-16。用户随后将优先级调整为全球高价值信息，本路线已停止继续扩展。以下只记录已发生的普通公开 GET 与开源文档核验，不表示已经接入小红书原帖。

| 路线 | 实际结果 | 结论 |
| --- | --- | --- |
| `https://www.xiaohongshu.com/explore` | HTTP 200，但最终地址是 `/login`，正文无笔记、0 条笔记链接 | 状态码和 `__INITIAL_STATE__` 字符串不足以证明拿到内容；未执行挑战脚本。 |
| [GEO 作者 GitHub 主页](https://github.com/dageno-agents)公开分享的小红书账户链接 | 主页有真实 `xhslink.com/m/` 地址，普通跳转仍到登录页 | 账户链接不是原笔记，也不是可用增量列表。 |
| [超级尹响力作品目录](https://superyinxiangli.com/content-sources.html) | HTML 正常公开，可读 2 个 `/o/` 作品分享链接和 1 个账户链接；含标题与作者整理的观点 | 证明存在作者自建的跨平台索引；仍是作者站索引，不等于读取平台原帖。 |
| 上述作品目录的《AI 搜不到你，不代表你没价值》分享链接 | 普通跳转到小红书错误页，明确 `error_code=300031`、当前笔记暂时无法浏览 | 未取得原笔记正文/发布时间；不改写跳转参数、不继续尝试绕过。 |
| [数英相关营销文章](https://www.digitaling.com/articles/1540720.html)、觉醒 AI 转载页、几家作者站 | 公开 HTML 可读，但抽样没有对应小红书原笔记链接 | 关于小红书 GEO 的文章不能算小红书原帖发现。 |

开源项目也应逐项区分“无 API key”和“无需登录”：

- [xiaohongshu_note_reader](https://github.com/hellojiaru/xiaohongshu_note_reader)的 live 模式明确需要浏览器导出的有效 Cookie，默认 fixture 模式不是线上采集成功证据。
- [OmniSaver](https://github.com/yelosheng/omnisaver)虽然宣传无需 API key，小红书接入步骤仍要求登录并配置 Cookie。
- [RSSHub 小红书用户路由源码](https://raw.githubusercontent.com/DIYgod/RSSHub/master/lib/routes/xiaohongshu/user.ts)存在可选 Cookie 与浏览器路径；本机普通公开入口已转登录，不能仅根据路由存在声称当前可用。未重试此前被拒绝的公共 RSSHub 实例。

已有 Google News、搜狗与普通搜索的无效结果见 [中文公开入口核验](geo-domestic-research.md)，本轮没有反复撞已知验证码。公开作者分享参数没有被当成账户凭据使用，也没有索取、导入或利用 Cookie。

没有创建 `public-xhs.ts` 空壳、伪成功适配器或新增自动小红书 source。可复用的中文作者候选转入 [高价值来源审计](geo-quality-sources.md)，其中仅通过本轮方法审查的候选保留在目录，自动新增优先选择全球官方与原始研究入口。
