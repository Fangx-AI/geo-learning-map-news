// The AI platforms readers follow, in the order the home page lists them. Each slug is a topic in
// industry/topics.json, so its channel page is that topic's /topics/:slug list. `query` is the
// search term the reader page uses to list the platform's latest news.
export const CHANNELS = [
  { slug: "google", name: "Google", query: "Google", pattern: /Google|谷歌|Gemini|AI Overviews?|AI Mode/i },
  { slug: "openai", name: "ChatGPT", query: "ChatGPT", pattern: /ChatGPT|OpenAI|SearchGPT|GPTBot|OAI-SearchBot/i },
  { slug: "perplexity", name: "Perplexity", query: "Perplexity", pattern: /Perplexity/i },
  { slug: "microsoft", name: "Bing / Copilot", query: "Bing", pattern: /Bing|必应|Copilot/i },
  { slug: "anthropic", name: "Claude", query: "Claude", pattern: /Claude|Anthropic/i },
  { slug: "doubao", name: "豆包", query: "豆包", pattern: /豆包|Doubao/i },
  { slug: "deepseek", name: "DeepSeek", query: "DeepSeek", pattern: /DeepSeek/i },
  { slug: "tencent", name: "元宝", query: "元宝", pattern: /元宝|Yuanbao/i },
  { slug: "baidu", name: "文心 / 百度", query: "百度", pattern: /文心|百度|Baidu|ERNIE/i },
  { slug: "qwen", name: "千问", query: "千问", pattern: /千问|通义|Qwen/i },
  { slug: "kimi", name: "Kimi", query: "Kimi", pattern: /Kimi|月之暗面/i },
] as const;

/** The platforms a headline names, by the original and the translated title; at most two. */
export function itemChannels(...texts: Array<string | null | undefined>) {
  const text = texts.filter(Boolean).join("\n");
  return CHANNELS.filter(channel => channel.pattern.test(text)).slice(0, 2);
}
