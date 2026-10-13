// 홈페이지(HTML)와 문서(Markdown)를 섹션 단위 청크로 나눈다.
export type Chunk = { source: string; title: string; content: string };

const MAX_CHARS = 1200;

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, "·")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// 너무 긴 섹션은 문단 단위로 MAX_CHARS 이하로 자른다
function splitLong(text: string) {
  if (text.length <= MAX_CHARS) return [text];
  const out: string[] = [];
  let buf = "";
  for (const para of text.split(/\n/)) {
    if (buf && buf.length + para.length + 1 > MAX_CHARS) { out.push(buf); buf = ""; }
    buf = buf ? `${buf}\n${para}` : para;
    while (buf.length > MAX_CHARS) { out.push(buf.slice(0, MAX_CHARS)); buf = buf.slice(MAX_CHARS); }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

export function chunkHtml(source: string, html: string): Chunk[] {
  const body = html.replace(/<head>[\s\S]*?<\/head>/i, "");
  const chunks: Chunk[] = [];
  for (const part of body.split(/(?=<section\b)/i)) {
    const h = part.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
    const title = h ? htmlToText(h[1]).replace(/\s+/g, " ") : "소개";
    const text = htmlToText(part);
    if (text.length < 30) continue;
    for (const piece of splitLong(text)) chunks.push({ source, title, content: piece });
  }
  return chunks;
}

export function chunkMarkdown(source: string, md: string): Chunk[] {
  const chunks: Chunk[] = [];
  const docTitle = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? source;
  for (const section of md.split(/(?=^#{1,3}\s)/m)) {
    const title = section.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() ?? docTitle;
    const text = section.trim();
    if (text.length < 30) continue;
    for (const piece of splitLong(text)) chunks.push({ source, title, content: `[${docTitle}]\n${piece}` });
  }
  return chunks;
}
