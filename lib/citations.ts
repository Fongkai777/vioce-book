// One bounded parser for model output, old saved answers, speech and history.
// Ordinary brackets ([2026], [Note]) are deliberately left alone.
const marker = /\[\s*[sS]\s*\d[^\[\]\r\n]{0,96}\]/g;
function numbers(body: string): number[] | null {
  const values: number[] = [];
  // Whitespace can separate IDs, but spaces inside a range must stay intact.
  const grouped = body.replace(/(\d)\s+(?=[sS]\s*\d)/g, "$1,");
  for (const item of grouped.split(/[,，、;；]/)) {
    const match = item.trim().match(/^[sS]?\s*(\d+)\s*(?:[-–—]\s*[sS]?\s*(\d+))?$/);
    if (!match) return null;
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    // Sources are capped at eight by the answer route. Bound expansion even for
    // adversarial ranges such as [S1–S999999999].
    if (!Number.isSafeInteger(start) || start < 1 || end < start || end > 8) return null;
    for (let value = start; value <= end; value++) values.push(value);
  }
  return [...new Set(values)];
}

export function normalizeCitations(text: string, sourceCount = 8) {
  let invalid = false;
  const normalized = text.replace(marker, raw => {
    const values = numbers(raw.slice(1, -1));
    if (!values || values.some(value => value > sourceCount)) { invalid = true; return ""; }
    return values.map(value => `[S${value}]`).join("");
  });
  return { text: normalized, invalid };
}

export function stripCitations(text: string) {
  // Do not expand first: even malformed/out-of-range source markers should not
  // be spoken or carried into a new turn as if their numbering still applied.
  return text.replace(marker, "");
}
