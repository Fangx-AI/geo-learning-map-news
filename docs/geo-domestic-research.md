# 中文公开索引与转载入口核验

核验日期：2026-10-16。本轮在无账号、无 Cookie、无付费 key 的普通公开 GET 条件下实测，沿用本机已有 `EGRESS_PROXY_URL` 网络代理。遇到验证码、登录页或不相关结果即停止该路线，不执行挑战脚本。

本批新增 5 路普通配置；该批完成时 `industry/sources.json` 为 53 路（两路 HN RSS 换为官方 JSON 后，为 41 RSS、10 网页列表、2 JSON），目录为 136 条。这是国内补源批次的历史基线；随后全球高价值来源批次增加至 60 路普通配置、142 条目录，见 [质量核验](geo-quality-sources.md)。独立 X / Reddit 公开嵌入采集仍由 `public-social.json` 管理。配置启用与后台实际运行状态是两回事；下面是读取实测数，不是保证今后每轮有相同数量。

## 已接入的动态入口

| source ID | 动态地址与分类 | 实测候选 / 有日期 / GEO 匹配 | 日期和关联证据 |
| --- | --- | --- | --- |
| `web-wechat-sogou-geo` | [搜狗微信：GEO 生成式引擎优化](https://weixin.sogou.com/weixin?type=2&query=GEO%20%E7%94%9F%E6%88%90%E5%BC%8F%E5%BC%95%E6%93%8E%E4%BC%98%E5%8C%96)，公众号公开搜索索引 | 10 / 10 / 10；两个正常请求均非空，排序及条目发生变化 | 每条结果明确公众号名、摘要、`timeConvert('Unix秒')`。例如新传考研真经《GEO(生成式引擎优化)是什么？》为 2026-10-11 03:52:21 UTC；这是索引声明的文章时间，没有用采集时间代替。 |
| `web-wechat-sogou-geo-page2` | [同一检索第 2 页](https://weixin.sogou.com/weixin?type=2&query=GEO%20%E7%94%9F%E6%88%90%E5%BC%8F%E5%BC%95%E6%93%8E%E4%BC%98%E5%8C%96&page=2)，固定有界翻页 | 10 / 10 / 10 | 例：GEO流量圈《GEO 生成式引擎优化全解析》为 2026-03-09 07:32:15 UTC；漂泊者手记《GEO生成式引擎优化：AI时代的内容生存法则》为 2026-03-23 05:55:16 UTC。 |
| `web-wechat-sogou-ai-search` | [搜狗微信：AI搜索优化](https://weixin.sogou.com/weixin?type=2&query=AI%E6%90%9C%E7%B4%A2%E4%BC%98%E5%8C%96)，另一组动态索引 | 10 / 10 / 10 | 例：承恒GEO优化《AI搜索优化里的内容结构块，怎么写才被引用》为 2026-10-15 16:11:06 UTC；有较多服务商营销观点，作为线索而非独立效果证据。此入口与上面的第 2 页样本合计 20 个不同索引身份。 |
| `rss-google-news-zhihu-geo` | [Google News 限定知乎 GEO 检索 RSS](https://news.google.com/rss/search?q=site%3Azhihu.com%20%22%E7%94%9F%E6%88%90%E5%BC%8F%E5%BC%95%E6%93%8E%E4%BC%98%E5%8C%96%22%20-%E6%9C%8D%E5%8A%A1%E5%95%86%20-%E5%85%AC%E5%8F%B8%20-%E6%A6%9C%E5%8D%95%20-%E6%8E%A8%E8%8D%90&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans)，公开新闻索引 | 32 / 32 / 14 | 32 条逐条检查 `<source url>`，均为 `https://zhuanlan.zhihu.com` 或 `https://www.zhihu.com`，标签为知乎专栏/知乎。专用解析器逐条验证域名，不能仅凭查询中有 `site:` 认定归属。日期来自 RSS `pubDate`，只表示索引提供的时间。 |
| `web-10100-geo` | [大数跨境 GEO 搜索列表](https://www.10100.com/search/article?q=GEO)，作者文章与公开转载/改编 | 10 / 列表 0 / 10；详情小样本 3/3 补到绝对日期 | 列表只显示“1周前”等相对时间，不拿它推断日期；使用详情 JSON-LD `datePublished`，无时区按 +08:00 读取，本轮最多补 8 篇。未补到的继续显示日期未知。 |

这些入口保存摘要、标题和链接，`site_fulltext`、`syndicate_fulltext` 均为 false。Google News RSS 返回聚合链接，feed 自带个人、非商业阅读用途说明；本地订阅接通不代表取得公开再分发授权。

## 公众号索引的准确边界

搜狗搜索列表来自 `.news-list > li`，标题链接是 `h3 a`，署名及时间来自 `.s-p`，摘要来自 `.txt-info`。读取脚本字符串中的明确 epoch，不运行 `document.write` 或其他 JavaScript。

结果链接形式为 `https://weixin.sogou.com/link?url=...&type=2&query=...&token=...`；实际键只有 `url`、`type`、`query`、`token`。这里的 token 是随公开结果返回的跳转参数，不来自任何账户或 API 密钥。专用校验严格限制协议、host、path、参数形状，不扩大其它带凭据地址的许可范围。

正常 GET 一条结果链接时遇到了搜狗验证码，已经停止这条跳转路线。当前保留的是索引链接，不声称抓到了 `mp.weixin.qq.com` 原文，也不声称能完整跟踪指定公众号。`tsn=3` 过滤请求被转回首页，没有配置该变体。

索引摘要保留“公众号：署名”和“搜狗公开索引摘要”。稳定身份为 `JSON.stringify([公众号名, 标题, 明确epoch或null])`，通过 `raw.publicIndexIdentity` 交给公开采集层，避免每次跳转 token 改变就重复入库；新链接可以刷新旧记录。列表存在但全量解析失败、验证码页、异常重定向均报错，不伪报 `ok + 0`。

对应实现：[`public-domestic.ts`](../modules/geo-directory/backend/public-domestic.ts)。它只请求配置的列表，不抓原文，不读取 Cookie，不调用收费读取器。

## 转载与原平台的关联证据

大数跨境列表是正常服务端 HTML，不需要执行页面脚本。公开搜索页面自己的 JS 说明参数为 `q`，配置使用 `/search/article?q=GEO`，而不是无结果的 `?keyword=GEO`。每条选择器为 `.index-shadow:has(a.text-title[href^="/article/"])`，标题和链接取其中 `a.text-title[href^="/article/"]`，只允许本域 `/article/`。

- [什么是 GEO——从 SEO 到 GEO 的范式转移](https://www.10100.com/article/152897297)：JSON-LD 日期 `2026-10-02 20:50:59`；页面公开状态的 `sourceName` 标为“【Yandex Ads推广】公众号…大数AI优化”，`moreInfo.url` 明确指向 `mp.weixin.qq.com/s?__biz=Mzk4ODkyNjY4Mw==&mid=2247483782...`。
- [GEO基础概念：SEO、AEO和GEO有什么区别](https://www.10100.com/article/151211885)：来源标为“【跨境万元户】公众号…大数AI优化”，公开 metadata 保留公众号原 URL，日期 `2026-09-16 13:43:16`。
- [比起没做GEO，做错 GEO 的代价大多了](https://www.10100.com/article/150976124)：标为“【增长超人】公众号”，公开 `moreInfo` 保留公众号链接和署名 GrowthMan，日期 `2026-09-14 08:00:00`。
- [GEO优化：抢占AI流量新红利](https://www.10100.com/article/27749642)：正文直接写出知乎原文 `https://zhuanlan.zhihu.com/p/1946999164174066264`，公开 metadata 又保留公众号 `https://mp.weixin.qq.com/s/Czc4XripyNfHDF95Bo0FOw`。这是转载链证据，不能据此认为全文与任一原文逐字一致；这篇是关联样本，没有被静态硬塞进动态列表。

只读取并核对了公开 HTML 中的这些字符串，没有执行 Nuxt 状态函数。大数有改编标记，因此来源展示为采集到的转载网页；没有把其正文归为公众号或知乎原帖，也没有把商业服务效果主张当作已验证事实。

已有 [人人都是产品经理 GEO RSS](https://www.woshipm.com/tag/geo/feed) 也能补充公众号作者观点。[2500字解析，告诉你GEO该怎么玩](https://www.woshipm.com/ai/6286624.html) 页尾明确“作者挖塘人、微信公众号挖塘人、原创/授权发布”。现有源继续使用，不为此重复新建来源。

## 未接入的路线及原因

| 路线 | 本轮实际结果 | 处理 |
| --- | --- | --- |
| Bing 搜索 RSS：限定知乎与生成式引擎优化 | HTTP 200，但 10 个条目是无关的 S4F 等登录网站 | 不将有返回误认为有效索引；不接。 |
| Google News 限定 `mp.weixin.qq.com GEO` | 只读到无具体文章标题的微信平台结果 | 不接。 |
| 搜狗知乎普通检索 | 初次 HTML 有 10 条知乎结果，主要是旧 SEO/地理含义，与生成式优化不符；精确查询转验证码 | 不接、不绕过验证码、不继续试撞。 |
| 小红书公开索引 | 搜狗 `site:xiaohongshu.com/explore GEO` 无真实笔记结果；Google News 限定小红书只给网站首页；Google 普通搜索 GET 只给 JS 页面而无可提取结果 | 未找到稳定动态笔记入口，不接；目录继续明确需要平台访问条件。 |
| DLZ123 公众号转载例文与 SEO 栏目 | 搜索能找到例文及其公众号原链接，但本机普通读取连接失败 | 不把搜索摘要当作已采集成功，不接。 |

小红书仍是实质缺口：目前不能宣称已自动采到小红书原帖。讨论“小红书GEO”的第三方营销文章不构成小红书原帖，也没有以此增加平台覆盖数字。

## 验证与运行分工

`node --test modules/geo-directory/tests/public-domestic-unit.test.ts` 7/7 通过，覆盖索引署名、epoch、未知日期、异常页、严格跳转形状、token 变动稳定身份、知乎 publisher 域名验证、时区和单次公开 GET。`git diff --check` 通过。

实际读取审计保存在本机 `.data/*-audit.json`，仅用于开发核验，不提交缓存页面或临时跳转参数。公开采集入口由 `collect-public.ts` 调用两种专用索引 reader；主 AIHOT 模型工作流安全阀继续关闭。正式入库数量和定时运行状态，以 `/api/geo/status` 与采集日志为准。
