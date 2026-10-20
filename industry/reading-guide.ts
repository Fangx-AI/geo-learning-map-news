/** Reader tasks and editorial notes, separate from model scores and source claims. */
export const READING_TASKS = [
  {
    id: "access",
    name: "让 AI 找到并读懂网站",
    audience: "网站负责人、开发者",
    pattern:
      /crawl|robots|javascript|render|index|retriev|fetch|抓取|索引|读取|检索|爬虫/i,
    steps: [
      "挑选一个关键产品页，检查不运行 JavaScript 时是否仍有核心正文。",
      "核对目标平台的官方爬虫说明，再查看自己服务器上的真实访问日志。",
    ],
    check:
      "分别记录页面能否访问、正文能否读取、是否观察到真实爬虫；这些都不能直接证明已收录或被引用。",
  },
  {
    id: "measure",
    name: "衡量引用、流量与效果",
    audience: "增长、营销与数据团队",
    pattern:
      /traffic|attribution|CTR|Search Console|measurement|citation|流量|归因|点击|测量|衡量|引用/i,
    steps: [
      "固定目标平台、问题集、时间窗口，并区分品牌问题与非品牌问题。",
      "保存原始回答与引用，分别记录提及、引用、访问和业务结果。",
    ],
    check:
      "每个指标都有分子、分母和样本条件；只观察到相关变化时，不把它写成优化带来的因果效果。",
  },
  {
    id: "content",
    name: "改进内容与品牌信息",
    audience: "内容运营、品牌与 SEO 团队",
    pattern: /content|brand|entity|source|内容|品牌|实体|信源/i,
    steps: [
      "选一条真实客户问题，核对官网能否用准确事实直接回答。",
      "检查相关第三方资料与官网是否一致，记录修改前后的事实差异。",
    ],
    check:
      "先验证错误是否被纠正，再在相同采样条件下观察回答；不以发布篇数代替成效。",
  },
  {
    id: "platform",
    name: "跟进平台规则与变化",
    audience: "GEO 从业者、产品与技术团队",
    pattern:
      /Google|OpenAI|ChatGPT|Claude|Gemini|Copilot|DeepSeek|Perplexity|官方|平台|AI Mode/i,
    steps: [
      "确认公告适用的产品、地区、账户与推出阶段。",
      "在自己实际使用的产品里检查该能力是否可用，保留检查日期。",
    ],
    check:
      "将测试、逐步推出和全面可用分开记录；API 能力不直接等同于消费者 App 的表现。",
  },
] as const;

export const EDITORIAL_NOTES: Record<string, { why: string; task: string }> = {
  "35c1199d6be254297d2b23e01bd8666b7c7d1c9b0c0229611eb53451aaa2d291": {
    task: "measure",
    why: "这项实测直接挑战“AI 曝光增长会带来直接流量”的归因假设，适合先检查自己的效果报告。",
  },
  "535fd607c54982da1b6b48f0bfad4b84d06a235f6048382c8340b6e89dad2cad": {
    task: "measure",
    why: "155 站数据展示了合并总量与站点中位数可能得出相反方向，能帮助避免误读 AI 搜索线索。",
  },
  c3b56c71560042c32f08634551aafb3e337637b009e05e812fa6ccab86f3422e: {
    task: "access",
    why: "官方说明把搜索与网页读取分开，有助于定位“没被找到”还是“找到后读不到正文”。",
  },
  ca279f36f41d7e3bba6dde0f9e83264489e38573af6fc1108796ba0e3e4a9536: {
    task: "platform",
    why: "先对照 Google 官方要求检查基础问题，避免把没有依据的特殊文件或格式当作必需优化。",
  },
};

export const GEO_GLOSSARY = [
  [
    "GEO",
    "让生成式 AI 更准确地发现、理解和使用公开信息；不意味着能保证推荐或排名。",
  ],
  [
    "AI Mode / AI Overviews",
    "Google 的两种 AI 搜索体验，功能、地区和展示方式可能不同。",
  ],
  [
    "引用与推荐",
    "引用是给出来源链接；推荐是明确建议选择某个对象。两者不能互相替代。",
  ],
  [
    "品牌问题 / 非品牌问题",
    "前者直接点名品牌，后者描述需求。回答品牌问题不等于被潜在客户自然发现。",
  ],
  [
    "CTR / 点击率",
    "点击次数除以曝光次数。比较前要确认时间、页面和曝光口径一致。",
  ],
  ["相关与因果", "两个指标一起变化，并不能单独证明其中一个导致另一个变化。"],
] as const;
