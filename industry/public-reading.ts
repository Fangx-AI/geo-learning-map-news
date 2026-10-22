// Public reading order is a transparent heuristic, separate from the model's five-dimensional
// selection rubric and thresholds. Patterns are shared by PostgreSQL and JavaScript.
export const PUBLIC_READING_POLICY = {
  version: 4,
  labels: { priority: "优先阅读线索", standard: "相关资料", deprioritized: "补充线索" },
  limitations: "仅依据标题、短摘要和链接类型；未核实原创性、方法有效性或结论，关键词规则可能误判或遗漏。",
  // Link destinations and HN feed counters are metadata, not methodological evidence.
  ignoredEvidence: "Article URL:[ ]*https?://[^\\s<>]+[ ]+Comments URL:[ ]*https?://[^\\s<>]+[ ]+Points:[ ]*[0-9]+[ ]+# Comments:[ ]*[0-9]+|https?://[^\\s<>]+",
  patterns: {
    explicit: "generative (engine|search) optimi[sz]ation|(^|[^a-z])generative search([^a-z]|$)|answer engine optimi[sz]ation|AI[- ]?(search|overviews?|mode|answers?)|AI engines (search|cite)|search[- ](augmented|grounded)|query fan[- ]out|llms[.]txt|生成式?引擎优化|生成式?搜索优化|答案引擎优化|AI[ ]*搜索|AI[ ]*搜尋|AI検索|生成AI検索|생성형 검색|AI 검색|KI[- ]Suche|moteurs? (génératifs?|de recherche génératifs?)|búsqueda con IA|motores? (generativos?|de búsqueda generativos?)|busca generativa|mecanismos de busca generativos|محركات البحث التوليدية|एआई खोज|(^|[^a-z0-9])(GEO|AEO|LLMO)([^a-z0-9]|$)",
    // Platform changes that matter to AI visibility even when the headline never says "GEO" or "AI search".
    platformSignal: "ChatGPT (ads?|shopping|apps?|search|atlas)([^a-z]|$)|ads? in ChatGPT|ChatGPT.{0,3}s (novel )?ads?([^a-z]|$)|AI (discovery|crawlers?|bots?)|verified bots|pay[- ]per[- ]crawl|GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot|Googlebot|Bingbot|agentic (commerce|shopping|checkout)|AI agents?.{0,40}(storefront|shopping|checkout|commerce)|storefronts?.{0,40}AI agents?|Search Console|Webmaster Tools|AI visibility|Business Profiles?|Business Home|knowledge panel|core (algorithm )?update|site reputation|spam (polic(y|ies)|update)|Indexing API|AI 智能体.{0,20}(购物|电商|下单)|百度站长|搜索资源平台",
    ai: "ChatGPT|OpenAI|Perplexity|Gemini|Claude|DeepSeek|豆包|文心|元宝|Kimi|千问|通义|large language model|LLM",
    aiSummary: "AI (summary|summaries)|AI摘要|AI 摘要",
    google: "Google|谷歌",
    searchInteraction: "search results|click on links|搜索结果|点击链接",
    discovery: "citat|cited|retriev|referral|traffic|UTM|流量|visibility|brand mention|recommendation|search|map (tool|chip)|crawl|index|robots[.]txt|fan[- ]out|引用|检索|检索|可见|推薦|推荐|品牌|爬虫|抓取|索引|검색|인용|検索|引用率",
    method: "experiment|benchmark|dataset|control group|sample size|randomi[sz]ed|ablation|methodology|we (analy[sz]ed|tested|measured|audited)|(^|[^a-z])we examined [0-9][0-9,. ]* domains([^a-z]|$)|(^|[^a-z])we (first )?conduct(ed)? (a |an |human )?(observational |empirical |large-scale empirical )?(study|evaluation)([^a-z]|$)|(^|[^a-z])we evaluate(d)? (both )?(web[- ]search|deep[- ]research|generative search)|I (tested|measured|audited)|[0-9][0-9,. ]*[ ]*(million |M )?(queries|prompts|responses|websites|businesses|samples)|measur(ed|ing)|measurement (data|results)|small test revealed|实测|实验|對照|对照|样本|数据集|测试了|测量|比較実験|調査|検証|実測|실험|측정|데이터셋|échantillon|expérimen|méthodologie|mesur|Stichprobe|Experiment|Datensatz|experimento|metodolog|amostra|قياس|تجربة|प्रयोग",
    firstHand: "we (analy[sz]ed|tested|measured|audited|collected|found)|(^|[^a-z])we examined [0-9][0-9,. ]* domains([^a-z]|$)|(^|[^a-z])we (first )?conduct(ed)? (a |an |human )?(observational |empirical |large-scale empirical )?(study|evaluation)([^a-z]|$)|(^|[^a-z])we evaluate(d)? (both )?(web[- ]search|deep[- ]research|generative search)|I (tested|measured|audited)|our (experiment|dataset|study|results)|我们(测试|实测|分析|采集|测量)|我(测试|实测|测了)|自建数据|独立实验|実測|自社調査|직접 실험",
    change: "updat|expands? (to|into)|launch|rollout|roll.out|introduc|announc|(^|[^a-z])releas|adds? support|new .{0,32}(search|link|citation|crawler)|robots[.]txt|data-nosnippet|OAI-SearchBot|GPTBot|平台更新|上线|推出|发布|开放|新增|调整|改版|规范|政策|更新|導入|発表|지원|출시|업데이트|annonc|mise à jour|lanc|actualiza|anunci|Einführung|Aktualis",
    toolIntegration: "^(introduc(ing|es?)|announc(ing|es?)|adding) support for (Google AI (Mode|Overviews)|ChatGPT|Perplexity)([^a-z]|$)",
    promotion: "book (a |your )?demo|contact us|(^|[^a-z])DM us to talk([^a-z]|$)|free trial|hire (us|our)|guaranteed? .{0,35}(rank|citation|visibility)|(^|[^a-z])(best|top)([^a-z]|$)[^.!?]{0,90}(agencies|agency|service providers)|agency ranking|联系我们|预约演示|免费试用|限时优惠|代运营|包收录|保排名|保证.{0,15}(排名|引用)|服务商.{0,12}(推荐|排名|哪家|实力|力荐)|公司.{0,6}推荐|哪家.{0,8}(强|好)|获客.{0,15}(服务|方案|低成本)|头部服务商|高性价比|用户力荐|支援サービス|無料サービス|무료 서비스|제안드립니다|agencias? .{0,25}(mejores|servicios)|meilleures? agences|melhores agências",
    listicle: "(^|[^a-z])(best|top)([^a-z]|$)[^.!?]{0,70}(tools|software|platforms)|工具.{0,12}(排行榜|推荐榜|排名)|软件.{0,8}(排行榜|推荐榜)|平台.{0,8}(排行榜|推荐榜)|meilleurs outils|mejores herramientas|melhores ferramentas",
    critique: "debunk|scam|myth|criti(que|cism)|doesn.t work|do not work|failed experiment|negative result|no effect|self[- ]promot|cannot guarantee|not guarantee|骗局|割韭菜|批评|批判|失败实验|没有效果|无效|自我推广|不能保证|不保证|誇大広告|효과 없",
    compilation: "weekly (recap|roundup|update)|video recap|news roundup|sponsored by|it.s new [0-9]{1,2}/[0-9]{1,2}|新闻汇总|新闻盘点|赞助播出",
    reprint: "originally published (on|at)|reprinted (from|with)|转载自|原文来自|本文转载|转自[：:]",
    attributedStudy: "(dataset|study|research|experiment|case study) (note )?from |according to .{0,60}(study|research|data)|本文结合.{0,60}(研究|论文)|引用.{0,30}(研究|论文|实验)|Princeton.{0,20}(研究|论文)|研究解读|论文解读",
    referenceOnly: "(excellent|great) (article|conversation)|make it this one from|[轉转]发.{0,20}(文章|研究)",
  },
} as const;
