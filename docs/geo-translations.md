# 公开资讯的中文翻译

标题和短摘要在后台翻译、入库，读者打开页面或切换中文／原文不会触发翻译。原始标题、摘要、语言、原文链接保留。内容变化后旧译文失效，必须重新翻译当前版本，不能把旧摘要套在新文章上。

## 术语、历史纠错与阅读更新

行业词表位于 `industry/translation.ts`。只在原文实际出现对应短语及搜索上下文时，纠正有证据的错译；不把普通地理、统计学 perplexity、星座 Gemini 等内容套入产品名称。网址、数字、已有正确品牌名保留。Bing 新译文版本为 `bing-geo-v2`，未受影响的旧缓存仍可使用，不因版本变化重复调用翻译服务。

发布前检查已证实的质量问题：社交前缀不能吞掉冒号前的英文正文；文章标题末尾的 “via @作者” 署名不送去翻译，译文标题里不能留着它（`bing-geo-v5`）；译文不能出现原文字段中没有的年份；原文明确写出的数字百分比不能丢失或改变。质量错误只延后这一条，其他历史条目继续。检查不等于语义完整核验，不能证明全部数字关系、否定、单位与文风都正确。

真实评测集在 `industry/translation-examples.jsonl`，含原文版本、当前译文和参考译文。已逐条核对且标记 `publishable` 的参考可以纠正隐喻、引用方向、捏造年份和明显的生硬句式；仍显示机翻，不代表原文事实得到核实。原文截断保持截断；仅移除已确认的 RSS 导航尾注。

维护命令默认仅预览，不联网；写入时与采集守护共用翻译锁，需先暂停公开采集守护：

```powershell
node --env-file=.env modules/geo-directory/scripts/repair-translations.ts --references industry/translation-examples.jsonl
# 核对预览后写入，再恢复采集守护
node --env-file=.env modules/geo-directory/scripts/repair-translations.ts --references industry/translation-examples.jsonl --write
node --env-file=.env scripts/geo-local.ts start
```

脚本按原文文本与语言计算版本，写入时再次匹配，支持同文跨来源复用；重复执行不会重写相同结果。只改译文缓存，不修改原文、链接、日期、排序或分组。2026-10-16 首轮写入：136 条术语纠正、15 条审核后的参考译文（14 个样例加同文复用）、19 条漏译重新排队。

阅读页在中文模式且标签页可见时，每 30 秒检查进度；译文变化后只批量更新已经显示的卡片，保留分页、滚动、摘要展开状态与单卡原文选择。两个只读接口均不发翻译请求：

- `/api/geo/translation-status`：与资讯列表一致的去重后外文数量、已译、待译、重试及服务状态。
- `/api/geo/translations?ids=...`：最多 100 个已加载条目的当前原文版本和完整译文。停用来源不返回。

实际错误、参考译文与后续改进路径见 [翻译质量评测](geo-translation-quality.md)。

当前默认使用公开网页翻译通道；本地专用模型为可选模式。`.env`：

```dotenv
PUBLIC_TRANSLATION_ENABLED=true
PUBLIC_TRANSLATION_PROVIDER=bing
```

这与原有编辑流程的 `MODEL_CALLS_ENABLED` 是独立开关；不启用付费内容评分或其他模型任务。若需要离线运行，完成下述安装后可改为 `PUBLIC_TRANSLATION_PROVIDER=local`。

## 本地安装

Windows x64，在仓库根目录执行：

```powershell
node --env-file=.env modules/geo-directory/scripts/setup-translation.ts
```

安装器下载腾讯官方 **Hy-MT2-1.8B Q4_K_M** 和官方 **llama.cpp b11696 Windows CPU** 运行时，不需要 API 密钥、模型账号或 Python。需要系统 `curl`；如已配置 `EGRESS_PROXY_URL`，下载沿用该出口。模型约 1.06 GiB，运行时压缩包约 18.7 MiB；模型与压缩包均核验 SHA-256。

重复执行会跳过已经校验的完整文件，`.part` 文件会断点续传，不必从头下载。文件位于已忽略的 `.data/translation/`：

```text
models/model.gguf
runtime/llama-server.exe
downloads/llama-b11696-bin-win-cpu-x64.zip
models.json
```

固定版本与来源：

| 内容 | 官方来源 | 校验 |
| --- | --- | --- |
| Hy-MT2-1.8B Q4_K_M | [腾讯官方模型](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF)，提交 `a0c709d9fac510f2c807aa3af52872340dc37a4a` | `dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699` |
| llama.cpp CPU Windows x64 | [官方 b11696 发布](https://github.com/ggml-org/llama.cpp/releases/tag/b11696) | `1e7c47dff58467540d53e6cf302d83951bcb165afb252c2952ed3872190fc60d` |

模型采用 Apache-2.0 许可；运行时采用 MIT 许可。安装只准备本地文件，不修改系统服务、数据库或生产端口。当前自动安装器仅支持 Windows x64；其他平台需将兼容的官方 `llama-server` 放在 `runtime/`，模型位置相同。

## 持续运行

常规公开采集器的 `--watch` 模式会持续处理翻译队列。使用 `local` 时，Node worker 直接管理驻留 `llama-server` 子进程，使用随机本地端口，限制 4 个 CPU 线程、4096 上下文、单并发，并随 worker 释放子进程。模型加载后重复使用；本地翻译不需要联网。电脑和 worker 必须保持运行。

手动执行有界补译：

```powershell
node --env-file=.env modules/geo-directory/scripts/translate-public.ts --limit 10
```

手动与持续任务共用翻译锁，避免重复执行。已完成且原文版本一致的译文复用；异常会保留原文并延迟重试。数据库和公开读取层负责版本检查，前端仅显示已完成译文。

`PUBLIC_TRANSLATION_PROVIDER=bing` 为当前默认公开网页翻译通道。它依赖外部站点可用性和速率限制；出现限流或访问检查时进入退避，不绕过检查。Google 网页接口和 MyMemory 不属于当前生产翻译流程。

## 质量与实测

2026-10-16 在 Intel Core Ultra 5 125H、约 32 GiB 内存的本机，用 CPU 4 线程、4096 上下文检查本地模型。早期四组 JSON 样本通过后，扩大到实际首页内容发现标题吸收摘要 URL、`AI Mode` 被替换为 `GEO`、输出 JSON 包装残片等问题。因此正式默认改用 Bing，本地模式移除 JSON 格式约束，改为每个字段单独执行官方纯文本翻译提示。

纯文本方案完成十个短样本检查，覆盖英文、法文、日文、西班牙文、百分比增减、否定、链接和领域术语。每字段约 0.85–4.18 秒；其中 `Perplexity` 比较句在温度 0 和 0.7 下结果一致。这是小样本观测，不能代表所有文章质量或吞吐。

领域提示明确 `Generative Engine Optimization`、网站 `traffic` 和 `store` 的含义；译文检查包括品牌、百分比、否定和比较关系。抽测示例：

- `ChatGPT Traffic Drop Appears To Be A Tracking Problem via …` → `通过…的分析，ChatGPT的流量下降似乎是一个追踪问题`
- `Perplexity cited 42% more sources.` → `Perplexity引用的信息来源增加了42%。`
- 法文标题中 `mais toujours pas de données sur les clics` → `但仍然没有点击数据`
- 日文 1,000 条查询、引用率 25% 的摘要保留了两个数值和引用含义。

本地模式遵循[官方模型卡](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF)的纯文本用户提示方式；只在原文实际出现某个术语时提供对应词汇表，分别翻译标题和摘要，不要求模型生成 JSON。仍须保留原文切换和链接：纯文本小样本改善不代表模型没有其他歧义或语义错误，不能把字段结构校验当作事实或翻译质量验证。

早期 Argos 小模型未通过真实首页内容验收：出现 `Generative Engine Optimization`、流量下降、购物商店等明显误译。数字或品牌保护不能弥补核心语义错误，该路线已放弃用于公开展示；不要安装或启用它作为此功能的默认引擎。
