export interface WidgetSegment {
  type: "text" | "widget";
  content: string;
  title?: string;
}

type WidgetLang = "show-widget" | "svg" | "html";

const FENCE_OPEN_RE = /```(?:show-widget|svg|html)\s*\n/;
const FENCE_ALL_RE = /```(show-widget|svg|html)\s*\n([\s\S]*?)\n```/g;

export function hasWidgetFence(text: string): boolean {
  return !!text && FENCE_OPEN_RE.test(text);
}

export function parseAllShowWidgets(
  text: string,
): WidgetSegment[] | null {
  if (!text || !hasWidgetFence(text)) return null;

  const segments: WidgetSegment[] = [];
  let lastIndex = 0;

  const regex = new RegExp(FENCE_ALL_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ type: "text", content: before });
    }

    const lang = match[1] as WidgetLang;
    const body = match[2];
    const widget = extractWidgetFromFence(lang, body);
    if (widget) {
      segments.push({
        type: "widget",
        content: widget.code,
        title: widget.title,
      });
    } else {
      segments.push({ type: "text", content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const after = text.slice(lastIndex).trim();
    if (after) segments.push({ type: "text", content: after });
  }

  return segments.length > 0 ? segments : null;
}

function extractWidgetFromFence(
  lang: WidgetLang,
  body: string,
): { code: string; title?: string } | null {
  if (lang === "svg" || lang === "html") {
    const trimmed = body.trim();
    if (!trimmed) return null;
    return { code: trimmed, title: lang };
  }
  return parseWidgetJson(body);
}

function parseWidgetJson(
  jsonStr: string,
): { code: string; title?: string } | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed.widget_code === "string") {
      return { code: parsed.widget_code, title: parsed.title };
    }
  } catch {
    // fallback
  }

  const codeMatch = jsonStr.match(/"widget_code"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (codeMatch) {
    try {
      const code = JSON.parse('"' + codeMatch[1] + '"');
      const titleMatch = jsonStr.match(/"title"\s*:\s*"([^"]*)"/);
      return {
        code,
        title: titleMatch ? titleMatch[1] : "widget",
      };
    } catch {
      /* ignore */
    }
  }

  return null;
}
