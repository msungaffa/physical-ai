// 홈페이지(HTML)와 문서(Markdown)를 섹션 단위 청크로 나누고, 청크마다 섹터(주제)를 붙인다.
// 섹터 값의 뜻은 supabase/migrations/20261014090000_site_chunk_sectors.sql 참고
export type Sector = "product" | "hardware" | "ai" | "business" | "survey" | "research" | "visionqc" | "general";
export type Chunk = { source: string; title: string; content: string; sector: Sector };

// 홈페이지: <section id>로 정한다. 표에 없는 섹션(첫 화면, 문제, 작동 방식, 위험 단계 등)은 product
const HTML_SECTORS: Record<string, Sector> = {
  stack: "hardware", hardware: "hardware", runtime: "hardware",
  ai: "ai", pipeline: "ai", model: "ai", engine: "ai",
  roi: "business", poc: "business",
};

// 보고서: 파일 이름으로 정한다. 규칙에 없는 새 보고서는 general
const REPORT_SECTORS: [RegExp, Sector][] = [
  [/하드웨어|SBC|컨테이너/, "hardware"],
  [/모델_학습|preprocess|engine_compare/, "ai"],
  [/비전_AI_모델_비교/, "research"],
  [/현장조사/, "survey"],
  [/비전QC/, "visionqc"],
];

// PRD: 소제목(###)은 속한 큰 제목(##)을 따른다
function prdSector(h2: string): Sector {
  if (/기술 스택/.test(h2)) return "hardware";
  if (/성공 지표|ROI|PoC/.test(h2)) return "business";
  return "product";
}

function markdownSector(source: string, h2: string): Sector {
  if (source === "PRD/PRD.md") return prdSector(h2);
  return REPORT_SECTORS.find(([re]) => re.test(source))?.[1] ?? "general";
}

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
    const id = part.match(/^<section\b[^>]*\bid="([^"]+)"/i)?.[1] ?? "";
    const sector = HTML_SECTORS[id] ?? "product";
    const text = htmlToText(part);
    if (text.length < 30) continue;
    for (const piece of splitLong(text)) chunks.push({ source, title, content: piece, sector });
  }
  return chunks;
}

export function chunkMarkdown(source: string, md: string): Chunk[] {
  const chunks: Chunk[] = [];
  const docTitle = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? source;
  let h2 = "";
  for (const section of md.split(/(?=^#{1,3}\s)/m)) {
    const title = section.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() ?? docTitle;
    if (/^#{1,2}\s/.test(section)) h2 = title;
    const sector = markdownSector(source, h2);
    const text = section.trim();
    if (text.length < 30) continue;
    for (const piece of splitLong(text)) chunks.push({ source, title, content: `[${docTitle}]\n${piece}`, sector });
  }
  return chunks;
}
