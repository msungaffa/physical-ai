// 문서 적재: GitHub 저장소의 홈페이지·PRD·보고서를 읽어 청크 → 임베딩 → site_chunks 저장
// 문서를 고쳐 push한 뒤 POST로 호출하면 바뀐 청크만 다시 임베딩하고, 사라진 청크는 지운다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Chunk, chunkHtml, chunkMarkdown } from "./chunk.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const REPO = Deno.env.get("SITE_GITHUB_REPO") ?? "msungaffa/physical-ai";
const BRANCH = Deno.env.get("SITE_GITHUB_BRANCH") ?? "main";
const EMBED_MODEL = "gemini-embedding-001";
// Gemini 무료 등급은 임베딩 분당 100건 제한 → 한 번에 이만큼만 처리하고, 남으면 1분 뒤 다시 호출
const MAX_EMBED_PER_RUN = 90;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function fetchText(path: string) {
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${encodeURI(path)}`);
  if (!res.ok) throw new Error(`GitHub ${path} ${res.status}`);
  return res.text();
}

async function listReportFiles(): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/report?ref=${BRANCH}`, {
    headers: { "User-Agent": "site-ingest" },
  });
  if (!res.ok) throw new Error(`GitHub report 목록 ${res.status}`);
  const items: { name: string; path: string; type: string }[] = await res.json();
  return items.filter((f) => f.type === "file" && f.name.endsWith(".md")).map((f) => f.path);
}

async function collect(): Promise<Chunk[]> {
  const chunks = chunkHtml("index.html", await fetchText("index.html"));
  for (const path of ["PRD/PRD.md", ...await listReportFiles()]) {
    chunks.push(...chunkMarkdown(path, await fetchText(path)));
  }
  return chunks;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: 768,
        })),
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${await res.text()}`);
  return (await res.json()).embeddings.map((e: { values: number[] }) => e.values);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const byHash = new Map<string, Chunk>();
    for (const c of await collect()) byHash.set(await sha256(`${c.source}\n${c.title}\n${c.content}`), c);

    const { data: existing, error } = await supabase.from("site_chunks").select("content_hash");
    if (error) throw error;
    const existingHashes = new Set(existing.map((r) => r.content_hash));

    const pending = [...byHash].filter(([h]) => !existingHashes.has(h));
    const added = pending.slice(0, MAX_EMBED_PER_RUN);
    const stale = [...existingHashes].filter((h) => !byHash.has(h));

    for (let i = 0; i < added.length; i += 50) {
      const batch = added.slice(i, i + 50);
      const vectors = await embedBatch(batch.map(([, c]) => `${c.title}\n${c.content}`));
      const rows = batch.map(([hash, c], j) => ({ ...c, content_hash: hash, embedding: JSON.stringify(vectors[j]) }));
      const { error } = await supabase.from("site_chunks").insert(rows);
      if (error) throw error;
    }
    for (let i = 0; i < stale.length; i += 100) {
      const { error } = await supabase.from("site_chunks").delete().in("content_hash", stale.slice(i, i + 100));
      if (error) throw error;
    }

    return json({
      total: byHash.size,
      added: added.length,
      removed: stale.length,
      remaining: pending.length - added.length,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
