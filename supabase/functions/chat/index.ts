// 홈페이지 챗봇: 질문 임베딩 → pgvector 검색(site_chunks) → Gemini로 답변 생성 → site_chat_logs 기록
import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
// 앞 모델이 무료 한도 초과(429)·과부하(503)·미지원(404)·시간 초과면 다음 모델로 넘어간다
// gemini-3.8-flash는 무료 한도가 하루 20회이고 과부하로 응답이 멈추는 일이 잦아 마지막에 둔다
const CHAT_MODELS = (Deno.env.get("GEMINI_CHAT_MODELS") ??
  "gemini-3.5-flash-lite,gemini-3.5-flash,gemini-3.8-flash").split(",").map((m) => m.trim());
const RETRYABLE = new Set([404, 429, 500, 503]);
const MODEL_TIMEOUT_MS = 15_000;
const EMBED_MODEL = "gemini-embedding-001";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MATCH_COUNT = 6;
const MATCH_THRESHOLD = 0.5;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `너는 "AI 기반 작업장 안전관리 시스템" 소개 홈페이지의 안내 챗봇이다.
- 아래 [참고 자료](홈페이지, PRD, 보고서에서 검색한 내용)만 근거로 한국어로 답한다.
- 참고 자료에 없는 내용은 지어내지 말고 "홈페이지 자료에서는 확인되지 않습니다"라고 말한다.
- 수치(비용, 정확도, 기간 등)는 참고 자료에 적힌 값을 그대로 쓴다.
- 3~6문장 정도로 간결하게, 필요하면 짧은 목록을 쓴다. 마크다운 굵게(**) 표시는 쓰지 않는다.`;

type Turn = { role: "user" | "assistant"; text: string };
type Match = { id: number; source: string; title: string; content: string; similarity: number };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(`${GEMINI_BASE}/${EMBED_MODEL}:embedContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  return (await res.json()).embedding.values;
}

async function generate(question: string, context: string, history: Turn[]) {
  const contents = [
    ...history.map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.text }],
    })),
    { role: "user", parts: [{ text: `[참고 자료]\n${context}\n\n[질문]\n${question}` }] },
  ];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: { temperature: 0.3 },
  });
  let lastError = "";
  for (const model of CHAT_MODELS) {
    let res: Response;
    try {
      res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body,
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
    } catch (e) {
      lastError = `generate ${model} 시간 초과/연결 실패: ${e instanceof Error ? e.message : e}`;
      console.warn(lastError);
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      const answer = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim();
      return { answer, model };
    }
    lastError = `generate ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`;
    if (!RETRYABLE.has(res.status)) break;
    console.warn(lastError);
  }
  throw new Error(lastError);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const { question, history = [] } = await req.json();
    if (typeof question !== "string" || !question.trim()) return json({ error: "question is required" }, 400);
    if (question.length > 500) return json({ error: "질문은 500자 이내로 입력해 주세요." }, 400);

    const recent: Turn[] = (Array.isArray(history) ? history : [])
      .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t?.text === "string")
      .slice(-6)
      .map((t) => ({ role: t.role, text: t.text.slice(0, 1000) }));

    // "그건 얼마야?" 같은 후속 질문도 찾을 수 있도록 직전 질문을 함께 임베딩
    const lastUser = recent.findLast((t) => t.role === "user")?.text;
    const embedding = await embedQuery(lastUser ? `${lastUser}\n${question}` : question);
    const { data, error } = await supabase.rpc("match_site_chunks", {
      query_embedding: JSON.stringify(embedding),
      match_count: MATCH_COUNT,
      match_threshold: MATCH_THRESHOLD,
    });
    if (error) throw error;
    const matches = (data ?? []) as Match[];

    const context = matches
      .map((m, i) => `(${i + 1}) [${m.source} · ${m.title}]\n${m.content}`)
      .join("\n\n") || "(관련 자료 없음)";

    const { answer, model } = await generate(question, context, recent);
    const sources = [...new Set(matches.map((m) => `${m.source} · ${m.title}`))];

    const { error: logError } = await supabase.from("site_chat_logs").insert({
      question,
      answer,
      sources,
      top_similarity: matches[0]?.similarity ?? null,
      model,
    });
    if (logError) console.error(logError);

    // 출처는 site_chat_logs에만 기록하고 화면으로는 보내지 않는다
    return json({ answer });
  } catch (e) {
    console.error(e);
    return json({ error: "답변 생성 중 오류가 발생했습니다." }, 500);
  }
});
