// GEO 学习地图的分类、标签、主体名录与身份核验词典。
// key 和主题 slug 会出现在网址与公开接口中，上线后保持稳定。

export const CATEGORIES = [
  { key: "platform-updates", label: "平台变化", section: "平台变化", guide: "生成式搜索、答案引擎及助手联网搜索的产品变化、引用展示、覆盖地区、发布者政策、合作与商业变化。只有确实影响发现、推荐、引用或流量分配的模型变化才收录；爬虫与索引规则归抓取与索引，第三方工具发布归工具更新。" },
  { key: "crawling-indexing", label: "抓取与索引", section: "抓取与索引", guide: "与 AI 搜索发现网页有关的爬虫、robots.txt、索引、渲染、站点地图、IndexNow、结构化数据、抓取日志和访问控制。区分搜索抓取、用户触发访问与训练抓取；方法侧重可发现性和技术可访问性。" },
  { key: "content-optimization", label: "内容优化", section: "内容优化", guide: "围绕生成式答案的内容设计、实体与品牌信息、事实证据、作者信息、知识组织、多语言、本地与电商内容方法，以及相关观点。方法不自动等于有效；新研究数据归测量研究，完整项目复盘归实战案例。", commentary: true },
  { key: "measurement-research", label: "测量研究", section: "测量研究", guide: "GEO、AEO、AI 搜索的论文、数据集、实验、引用与提及监测方法、流量归因、市场观察及反例。包含负结果、复现失败、抽样偏差和方法争论；区分引用、提及、排名、点击与转化。" },
  { key: "case-studies", label: "实战案例", section: "实战案例", guide: "具体网站、品牌、机构或创作者的 GEO 实施过程与复盘，包括有效、无效和下降案例。保留平台、地区语言、样本、时间窗口、对照和限制；厂商案例的自述不能直接写成因果结论。" },
  { key: "tools", label: "工具更新", section: "工具更新", guide: "GEO 监测、AI 搜索分析、日志审计、引用追踪、内容与实体检查工具的发布、改版、开源、价格和可用性变化。仅涉及普通写作、通用模型或开发工具而无 GEO 任务的不属于本站范围。" },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/** GEO 没有与“新模型数量”对应的统一发布指标。 */
export const RELEASE: { category: string; tag: string; unit: string } | null = null;

/** 总述允许的行业通用词，不为未出现在材料中的具体平台或效果背书。 */
export const PLAIN_TERMS: readonly string[] = ["geo", "aeo", "seo", "ai", "llm", "rag", "api", "html", "http", "url", "ctr", "kpi", "roi", "schema", "robots.txt", "llms.txt"];

/** 保留引擎七类协议与五维权重；具体 GEO 含义见评分及内容理解提示词。 */
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

/** 首标签表示内容形态，后续标签表示涉及的问题与主体。 */
export const CATEGORY_TAGS = ["平台更新", "工具发布", "论文/研究", "开源/仓库", "教程/实践", "观点/分析", "评测/基准", "案例/复盘", "现象/趋势", "行业动态", "政策/规则", "其他"] as const;
export const TOPIC_TAGS = ["GEO", "AEO", "SEO", "AI搜索", "答案引用", "品牌提及", "抓取/爬虫", "索引/收录", "robots.txt", "llms.txt", "结构化数据", "内容质量", "实体/知识图谱", "权威性/信任", "RAG/检索", "可见度监测", "流量/归因", "实验设计", "失败实验", "本地搜索", "电商/购物", "多语言", "版权/授权", "反垃圾/安全", "开放数据", "开源工具", "社区讨论", "社媒发现"] as const;
export const ENTITY_TAGS = ["Google", "Microsoft", "OpenAI", "Perplexity", "Anthropic", "百度", "豆包", "DeepSeek", "腾讯", "Kimi", "千问", "xAI", "Meta", "Mistral", "Brave", "You.com", "Ahrefs", "Semrush", "Moz", "Similarweb", "SISTRIX", "Screaming Frog", "Oncrawl", "Botify", "BrightEdge", "Conductor", "Profound", "Peec AI", "Otterly.AI", "AthenaHQ", "Scrunch AI", "Cloudflare"] as const;

export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "生成式引擎优化": "GEO", "生成引擎优化": "GEO", "Generative Engine Optimization": "GEO", "答案引擎优化": "AEO", "搜索引擎优化": "SEO",
  "AI 搜索": "AI搜索", "人工智能搜索": "AI搜索", "AI Search": "AI搜索", "LLMO": "GEO", "AI可见度": "可见度监测", "AI 可见度": "可见度监测",
  引用: "答案引用", "引用追踪": "答案引用", "品牌曝光": "品牌提及", 爬虫: "抓取/爬虫", 抓取: "抓取/爬虫", 索引: "索引/收录", 收录: "索引/收录",
  "Schema": "结构化数据", "schema.org": "结构化数据", "JSON-LD": "结构化数据", 实体: "实体/知识图谱", "知识图谱": "实体/知识图谱", "E-E-A-T": "权威性/信任", RAG: "RAG/检索", 检索: "RAG/检索",
  论文: "论文/研究", 研究: "论文/研究", paper: "论文/研究", papers: "论文/研究", 基准: "评测/基准", 评测: "评测/基准",
  "open-source": "开源/仓库", 开源: "开源/仓库", 仓库: "开源/仓库", repo: "开源/仓库", 教程: "教程/实践", 指南: "教程/实践", 技巧: "教程/实践", 实践: "教程/实践",
  观点: "观点/分析", 分析: "观点/分析", 案例: "案例/复盘", 复盘: "案例/复盘", "负结果": "失败实验", "无效实验": "失败实验", 趋势: "现象/趋势",
  政策: "政策/规则", 监管: "政策/规则", 法规: "政策/规则", "政策/监管": "政策/规则", 合作: "行业动态", 融资: "行业动态", 收购: "行业动态",
  "Bing": "Microsoft", "Copilot": "Microsoft", "ChatGPT": "OpenAI", "Gemini": "Google", "Claude": "Anthropic", "元宝": "腾讯", "Qwen": "千问", "Moonshot": "Kimi",
};

/** aliases 供结构化识别；otherNames 用于发布方核验，不代表产品具备未经报道的能力。 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  google: { name: "Google / Gemini", displayTag: "Google", aliases: ["Google", "谷歌", "Gemini", "Google Search", "AI Overviews", "AI Mode"], otherNames: ["Google Search Central", "Google DeepMind", "Google Research"] },
  microsoft: { name: "Microsoft / Bing / Copilot", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "Bing", "必应", "Microsoft Copilot"], otherNames: ["Bing Webmaster", "Bing Webmaster Tools", "Microsoft Research", "Microsoft AI"] },
  openai: { name: "OpenAI / ChatGPT", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "ChatGPT Search"], otherNames: ["OpenAI Developers", "OAI-SearchBot", "GPTBot", "ChatGPT-User"] },
  perplexity: { name: "Perplexity", displayTag: "Perplexity", aliases: ["Perplexity", "Perplexity AI"], otherNames: ["PerplexityBot", "Perplexity-User"] },
  anthropic: { name: "Anthropic / Claude", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"], otherNames: ["ClaudeBot", "Claude-SearchBot", "Claude-User"] },
  baidu: { name: "百度 / 文心", displayTag: "百度", aliases: ["百度", "Baidu", "文心", "文心一言", "ERNIE"], otherNames: ["百度搜索", "百度智能云", "百度搜索资源平台"] },
  doubao: { name: "豆包 / 字节跳动", displayTag: "豆包", aliases: ["豆包", "Doubao", "字节跳动", "ByteDance"], otherNames: ["火山引擎", "Volcengine"] },
  deepseek: { name: "DeepSeek / 深度求索", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"] },
  tencent: { name: "腾讯 / 元宝", displayTag: "腾讯", aliases: ["腾讯", "Tencent", "腾讯元宝", "元宝", "混元", "Hunyuan"], otherNames: ["腾讯混元", "腾讯云", "Tencent Cloud"] },
  kimi: { name: "Kimi / 月之暗面", displayTag: "Kimi", aliases: ["Kimi", "月之暗面", "Moonshot AI"], otherNames: ["Moonshot"] },
  qwen: { name: "千问 / 阿里巴巴", displayTag: "千问", aliases: ["Qwen", "千问", "通义千问", "通义", "阿里巴巴", "Alibaba"], otherNames: ["阿里云", "Alibaba Cloud", "Qwen Team"] },
  xai: { name: "xAI / Grok", displayTag: "xAI", aliases: ["xAI", "Grok"] },
  meta: { name: "Meta AI", displayTag: "Meta", aliases: ["Meta", "Meta AI", "Llama"], otherNames: ["AI at Meta"] },
  mistral: { name: "Mistral / Le Chat", displayTag: "Mistral", aliases: ["Mistral", "Mistral AI", "Le Chat"] },
  brave: { name: "Brave Search", displayTag: "Brave", aliases: ["Brave", "Brave Search"] },
  you: { name: "You.com", displayTag: "You.com", aliases: ["You.com"] },
  ahrefs: { name: "Ahrefs", displayTag: "Ahrefs", aliases: ["Ahrefs"], otherNames: ["Ahrefs Brand Radar"] },
  semrush: { name: "Semrush", displayTag: "Semrush", aliases: ["Semrush", "SEMrush"] },
  moz: { name: "Moz", displayTag: "Moz", aliases: ["Moz"] },
  similarweb: { name: "Similarweb", displayTag: "Similarweb", aliases: ["Similarweb", "SimilarWeb"] },
  sistrix: { name: "SISTRIX", displayTag: "SISTRIX", aliases: ["SISTRIX"] },
  "screaming-frog": { name: "Screaming Frog", displayTag: "Screaming Frog", aliases: ["Screaming Frog", "SEO Spider"] },
  oncrawl: { name: "Oncrawl", displayTag: "Oncrawl", aliases: ["Oncrawl", "OnCrawl"] },
  botify: { name: "Botify", displayTag: "Botify", aliases: ["Botify"] },
  brightedge: { name: "BrightEdge", displayTag: "BrightEdge", aliases: ["BrightEdge"] },
  conductor: { name: "Conductor", displayTag: "Conductor", aliases: ["Conductor", "Conductor AI"] },
  profound: { name: "Profound", displayTag: "Profound", aliases: ["Profound", "Profound AI"] },
  "peec-ai": { name: "Peec AI", displayTag: "Peec AI", aliases: ["Peec AI", "Peec"] },
  otterly: { name: "Otterly.AI", displayTag: "Otterly.AI", aliases: ["Otterly.AI", "Otterly AI", "Otterly"] },
  "athena-hq": { name: "AthenaHQ", displayTag: "AthenaHQ", aliases: ["AthenaHQ", "Athena HQ"] },
  "scrunch-ai": { name: "Scrunch AI", displayTag: "Scrunch AI", aliases: ["Scrunch AI", "Scrunch"] },
  cloudflare: { name: "Cloudflare", displayTag: "Cloudflare", aliases: ["Cloudflare"], otherNames: ["Cloudflare Radar"] },
};

/** 常见英语词采用大小写明确的品牌写法，降低把普通词误认成公司的机会。 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "google", name: "Google / Gemini", patterns: [/google|谷歌|deepmind|\bgemini\b|\bAI Overviews\b|\bAI Mode\b/i] },
  { id: "microsoft", name: "Microsoft / Bing / Copilot", patterns: [/microsoft|微软|\bbing\b|必应|\bcopilot\b/i] },
  { id: "openai", name: "OpenAI / ChatGPT", patterns: [/openai|chatgpt|oai-searchbot|gptbot|\bgpt-?[o\d]/i] },
  { id: "perplexity", name: "Perplexity", patterns: [/\bPerplexity\b/] },
  { id: "anthropic", name: "Anthropic / Claude", patterns: [/anthropic|\bclaude\b/i] },
  { id: "baidu", name: "百度 / 文心", patterns: [/baidu|百度|文心|\bernie\b/i] },
  { id: "doubao", name: "豆包 / 字节跳动", patterns: [/豆包|doubao|字节跳动|bytedance|火山引擎|volcengine/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
  { id: "tencent", name: "腾讯 / 元宝", patterns: [/tencent|腾讯|元宝|混元|hunyuan/i] },
  { id: "kimi", name: "Kimi / 月之暗面", patterns: [/\bkimi\b|月之暗面|\bmoonshot\s?ai\b/i] },
  { id: "qwen", name: "千问 / 阿里巴巴", patterns: [/\bqwen\b|千问|通义|阿里巴巴|\balibaba\b|阿里云/i] },
  { id: "xai", name: "xAI / Grok", patterns: [/\bxai\b|\bgrok\b/i] },
  { id: "meta", name: "Meta AI", patterns: [/\bMeta\b/, /\bmeta\s?ai\b|\bllama\b/i] },
  { id: "mistral", name: "Mistral", patterns: [/\bMistral\b|\bLe Chat\b/] },
  { id: "brave", name: "Brave Search", patterns: [/\bBrave(?: Search| AI)?\b/] },
  { id: "you", name: "You.com", patterns: [/\byou\.com\b/i] },
  { id: "ahrefs", name: "Ahrefs", patterns: [/\bahrefs\b/i] },
  { id: "semrush", name: "Semrush", patterns: [/\bsemrush\b/i] },
  { id: "moz", name: "Moz", patterns: [/\bMoz\b/] },
  { id: "similarweb", name: "Similarweb", patterns: [/\bsimilarweb\b/i] },
  { id: "sistrix", name: "SISTRIX", patterns: [/\bsistrix\b/i] },
  { id: "screaming-frog", name: "Screaming Frog", patterns: [/\bscreaming frog\b|\bSEO Spider\b/i] },
  { id: "oncrawl", name: "Oncrawl", patterns: [/\boncrawl\b/i] },
  { id: "botify", name: "Botify", patterns: [/\bbotify\b/i] },
  { id: "brightedge", name: "BrightEdge", patterns: [/\bbrightedge\b/i] },
  { id: "conductor", name: "Conductor", patterns: [/\bConductor\b/] },
  { id: "profound", name: "Profound", patterns: [/\bProfound\b/] },
  { id: "peec-ai", name: "Peec AI", patterns: [/\bpeec(?: ai)?\b/i] },
  { id: "otterly", name: "Otterly.AI", patterns: [/\botterly(?:[. ]ai)?\b/i] },
  { id: "athena-hq", name: "AthenaHQ", patterns: [/\bathena\s?hq\b/i] },
  { id: "scrunch-ai", name: "Scrunch AI", patterns: [/\bScrunch(?: AI)?\b/] },
  { id: "cloudflare", name: "Cloudflare", patterns: [/\bcloudflare\b/i] },
];

/** 仅列官方发布域名；不把社区、共享页面、仓库与论文托管平台当成内容作者。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "google", domains: ["developers.google.com", "blog.google", "deepmind.google", "ai.google", "search.google"] },
  { entityId: "microsoft", domains: ["blogs.microsoft.com", "blogs.bing.com", "www.microsoft.com", "www.bing.com"] },
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "perplexity", domains: ["perplexity.ai"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "baidu", domains: ["ziyuan.baidu.com", "ai.baidu.com", "wenxin.baidu.com", "ir.baidu.com"] },
  { entityId: "doubao", domains: ["doubao.com", "bytedance.com", "volcengine.com"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
  { entityId: "tencent", domains: ["www.tencent.com", "hunyuan.tencent.com"] },
  { entityId: "kimi", domains: ["kimi.com", "kimi.ai", "moonshot.cn", "moonshot.ai"] },
  { entityId: "qwen", domains: ["qwen.ai", "www.alibabacloud.com", "www.aliyun.com"] },
  { entityId: "xai", domains: ["x.ai"] },
  { entityId: "meta", domains: ["ai.meta.com"] },
  { entityId: "mistral", domains: ["mistral.ai"] },
  { entityId: "brave", domains: ["brave.com"] },
  { entityId: "you", domains: ["you.com"] },
  { entityId: "ahrefs", domains: ["ahrefs.com"] },
  { entityId: "semrush", domains: ["semrush.com"] },
  { entityId: "moz", domains: ["moz.com"] },
  { entityId: "similarweb", domains: ["similarweb.com"] },
  { entityId: "sistrix", domains: ["sistrix.com", "sistrix.de"] },
  { entityId: "screaming-frog", domains: ["screamingfrog.co.uk"] },
  { entityId: "oncrawl", domains: ["oncrawl.com"] },
  { entityId: "botify", domains: ["botify.com"] },
  { entityId: "brightedge", domains: ["brightedge.com"] },
  { entityId: "conductor", domains: ["conductor.com"] },
  { entityId: "profound", domains: ["tryprofound.com"] },
  { entityId: "peec-ai", domains: ["peec.ai"] },
  { entityId: "otterly", domains: ["otterly.ai"] },
  { entityId: "athena-hq", domains: ["athenahq.ai"] },
  { entityId: "scrunch-ai", domains: ["scrunchai.com", "scrunch.com"] },
  { entityId: "cloudflare", domains: ["cloudflare.com"] },
];

export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "meta", pattern: /@AIatMeta\b/i },
  { entityId: "google", pattern: /@googlesearchc\b/i },
  { entityId: "microsoft", pattern: /@BingWMC\b/i },
];
