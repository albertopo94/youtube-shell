export const PREAMBLE = "__PREAMBLE__";

export type SectionResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

interface HeadingSpan {
  level: number;
  title: string;
  start: number;
}

/**
 * Extracts either the preamble before the first level-2 heading (`PREAMBLE`)
 * or a unique level-2 Markdown section matching `selector`, ignoring headings
 * inside fenced code blocks.
 */
export function extractSection(markdown: string, selector: string): SectionResult {
  const headings: HeadingSpan[] = [];
  let fence: string | null = null;
  let offset = 0;

  for (const line of markdown.split(/(?<=\n)/)) {
    const trimmed = line.replace(/\r?\n$/, "");
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(trimmed);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
    } else if (fence === null) {
      const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (headingMatch) {
        headings.push({
          level: headingMatch[1].length,
          title: headingMatch[2],
          start: offset,
        });
      }
    }
    offset += line.length;
  }

  if (selector === PREAMBLE) {
    const firstH2 = headings.find((h) => h.level === 2);
    const text = firstH2 ? markdown.slice(0, firstH2.start) : markdown;
    if (text.trim().length === 0) {
      return { ok: false, reason: "El preámbulo no existe o está vacío." };
    }
    return { ok: true, text };
  }

  const level2 = headings.map((h, index) => ({ ...h, index })).filter((h) => h.level === 2);
  const matches = level2.filter((h) => h.title.includes(selector));

  if (matches.length === 0) {
    return { ok: false, reason: `La sección "${selector}" no existe.` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: `La sección "${selector}" es ambigua (${matches.length} coincidencias).`,
    };
  }

  const match = matches[0];
  const nextBoundary = headings
    .slice(match.index + 1)
    .find((h) => h.level <= 2);
  const raw = markdown.slice(match.start, nextBoundary ? nextBoundary.start : markdown.length);
  return {
    ok: true,
    text: raw.replace(/(\r?\n)+$/, "$1"),
  };
}
