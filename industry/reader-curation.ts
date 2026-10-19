// Article-level decisions from the reviewed full-text briefs, 2026-10-18.
// Keep these methodological papers readable, without treating them as daily field evidence.
const supplementary = new Set([
  "2609.40069", // Conversational Capture: theoretical framework and numerical illustration.
  "2608.11390", // VCR: controlled simulations, no demonstrated platform adoption.
  "2610.20162", // Gap Detection: content-generation experiment, not live search citation results.
]);

export function isSupplementaryResearch(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "arxiv.org" && parsed.hostname !== "www.arxiv.org") return false;
    const id = /^\/(?:abs|html|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?\/?$/.exec(parsed.pathname)?.[1];
    return !!id && supplementary.has(id);
  } catch { return false; }
}
