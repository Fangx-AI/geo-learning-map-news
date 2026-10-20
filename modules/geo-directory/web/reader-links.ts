/** Only reading lists can be a reader's return destination; keep their filters and page cursor. */
export function safeReaderReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/all";
  try {
    const url = new URL(value, "https://reader.invalid");
    const allowed = /^(?:\/|\/library|\/following|\/all|\/hot|\/starred|\/daily(?:\/(?:archive|editions(?:\/\d{4}-\d{2}-\d{2})?|\d{4}-\d{2}-\d{2}))?|\/topics(?:\/[a-zA-Z0-9_-]+(?:\/page\/[1-9]\d*)?)?)$/;
    if (url.origin !== "https://reader.invalid" || !allowed.test(url.pathname)) return "/all";
    return url.pathname + url.search;
  } catch { return "/all"; }
}

export function geoReaderHref(id: string, from: string): string {
  return `/read/${encodeURIComponent(id)}?from=${encodeURIComponent(safeReaderReturnTo(from))}`;
}
