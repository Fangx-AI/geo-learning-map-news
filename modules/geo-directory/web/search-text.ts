/** Literal tokens only: user input never becomes executable markup or a regular expression. */
export type SearchTerms = string | string[];
export function searchPattern(query: SearchTerms): RegExp | null {
  const parsed = Array.isArray(query) ? query : [...query.matchAll(/"([^"]+)"|(\S+)/gu)].map(match => match[1] ?? match[2]!);
  const terms = [...new Set(parsed.filter(Boolean))]
    .slice(0, 20).sort((a, b) => b.length - a.length)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return terms.length ? new RegExp(`(${terms.join("|")})`, "giu") : null;
}

export function highlightedParts(text: string, query: SearchTerms): Array<{ text: string; match: boolean }> {
  const pattern = searchPattern(query);
  return pattern ? text.split(pattern).map((text, index) => ({ text, match: index % 2 === 1 })).filter(part => part.text) : [{ text, match: false }];
}

export function hasSearchMatch(text: string, query: SearchTerms): boolean {
  return searchPattern(query)?.test(text) ?? false;
}

/** Keep a summary match visible even when the rest of the card is collapsed. */
export function searchExcerpt(text: string, query: SearchTerms, length = 180): string {
  const match = searchPattern(query)?.exec(text);
  if (!match || text.length <= length) return text;
  const start = Math.max(0, match.index - 55);
  const end = Math.min(text.length, Math.max(start + length, match.index + match[0].length));
  return `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}
