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
const RELATED_COUNT = 3;
// 비전QC는 별도 제품 사례라 비전QC를 물을 때만 검색한다 (안전관리 시스템의 비용·엣지 질문에 섞이지 않게)
const VISIONQC_PATTERN = /비전\s*QC|불량/i;
// 섹터 고르기: 질문과 가까운 섹터 2개는 항상 보고, 3위는 1위와 차이가 이 값 이내일 때만 본다
// (연관 질문 35개로 맞춘 값: 비교 청크 162 → 평균 60개, 전체 검색 1위 청크를 33개 질문에서 그대로 찾음)
const ROUTE_MIN_SECTORS = 2;
const ROUTE_MAX_SECTORS = 3;
const ROUTE_MARGIN = 0.03;
// 고른 섹터에서 찾은 최고 유사도가 이보다 낮으면 섹터를 잘못 고른 것으로 보고 전체에서 다시 찾는다
const ROUTE_FALLBACK_SIMILARITY = 0.6;

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
- 답변은 항상 "~습니다" 체 존댓말로 쓴다. 참고 자료가 "~다" 체여도 그 말투를 따라 하지 않는다.
- 참고 자료에 없는 내용은 지어내지 않는다.
- 참고 자료로 질문에 답할 수 있으면 그 내용만 답하고, "확인되지 않습니다" 같은 문장을 덧붙이지 않는다.
- 참고 자료에 답이 전혀 없을 때만 "홈페이지 자료에서는 확인되지 않습니다"라고 답한다. 일부만 있으면 있는 부분을 답하고, 없는 부분만 "OO은 홈페이지 자료에서 확인되지 않습니다"처럼 짧게 밝힌다.
- 수치(비용, 정확도, 기간 등)는 참고 자료에 적힌 값을 그대로 쓴다.
- "비전QC" 보고서는 공장 불량품 검사라는 별도 사례 검토다. 비전QC를 물을 때만 그 내용으로 답하고, 안전관리 시스템 질문에는 그 수치를 섞지 않는다.
- 3~6문장 정도로 간결하게, 필요하면 짧은 목록을 쓴다. 마크다운 굵게(**) 표시와 코드용 백틱 기호는 쓰지 않는다. 토픽 이름이나 파일 이름도 기호 없이 그대로 쓴다.`;

type Turn = { role: "user" | "assistant"; text: string };
type Match = { id: number; source: string; title: string; content: string; sector: string; similarity: number };

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
        // 위젯은 답변을 글자 그대로 보여 주므로, 프롬프트를 어기고 나온 코드용 백틱은 지운다
        .replace(/`/g, "")
        .trim();
      return { answer, model };
    }
    lastError = `generate ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`;
    if (!RETRYABLE.has(res.status)) break;
    console.warn(lastError);
  }
  throw new Error(lastError);
}

// 질문 벡터를 섹터 대표 벡터(site_sector_centroids)와 비교해 볼 섹터를 고른다. 실패하면 null(전체 검색)
async function routeSectors(embedding: number[], excludeSectors: string[]) {
  const { data, error } = await supabase.rpc("match_site_sectors", {
    query_embedding: JSON.stringify(embedding),
    exclude_sectors: excludeSectors,
  });
  if (error || !data?.length) {
    if (error) console.error(error);
    return null;
  }
  const ranked = data as { sector: string; similarity: number }[];
  const top = ranked[0].similarity;
  const picked = ranked
    .filter((s, i) => i < ROUTE_MIN_SECTORS || (i < ROUTE_MAX_SECTORS && s.similarity >= top - ROUTE_MARGIN))
    .map((s) => s.sector);
  const scores = Object.fromEntries(ranked.map((s) => [s.sector, Math.round(s.similarity * 1000) / 1000]));
  return { picked, scores };
}

async function searchChunks(embedding: number[], includeSectors: string[] | null, excludeSectors: string[]) {
  const { data, error } = await supabase.rpc("match_site_chunks", {
    query_embedding: JSON.stringify(embedding),
    match_count: MATCH_COUNT,
    match_threshold: MATCH_THRESHOLD,
    include_sectors: includeSectors,
    exclude_sectors: excludeSectors,
  });
  if (error) throw error;
  return (data ?? []) as Match[];
}

// 방금 대화와 의미가 가까운 연관 질문 (이미 물어본 질문은 제외). 실패해도 답변은 그대로 보낸다
async function relatedQuestions(embedding: number[], asked: string[]): Promise<string[]> {
  const { data, error } = await supabase.rpc("match_site_questions", {
    query_embedding: JSON.stringify(embedding),
    exclude: asked,
    match_count: RELATED_COUNT,
  });
  if (error) {
    console.error(error);
    return [];
  }
  return (data ?? []).map((r: { question: string }) => r.question);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    // standalone: 버튼으로 고른 질문처럼 그 자체로 완결된 질문이면 true
    const { question, history = [], asked: askedInput = [], standalone = false } = await req.json();
    if (typeof question !== "string" || !question.trim()) return json({ error: "question is required" }, 400);
    if (question.length > 500) return json({ error: "질문은 500자 이내로 입력해 주세요." }, 400);

    const recent: Turn[] = (Array.isArray(history) ? history : [])
      .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t?.text === "string")
      .slice(-6)
      .map((t) => ({ role: t.role, text: t.text.slice(0, 1000) }));

    // 직접 입력한 "그건 얼마야?" 같은 후속 질문도 찾을 수 있도록 직전 질문을 함께 임베딩
    // (버튼 질문은 앞 주제가 섞이면 엉뚱한 문서를 찾으므로 질문만 쓴다)
    const lastUser = standalone === true ? undefined : recent.findLast((t) => t.role === "user")?.text;
    const embedding = await embedQuery(lastUser ? `${lastUser}\n${question}` : question);
    const excludeSectors = VISIONQC_PATTERN.test(`${lastUser ?? ""}\n${question}`) ? [] : ["visionqc"];
    // 관련 섹터의 청크만 비교하고, 거기서 마땅한 게 없으면 전체에서 다시 찾는다
    const route = await routeSectors(embedding, excludeSectors);
    let matches = await searchChunks(embedding, route?.picked ?? null, excludeSectors);
    const fallback = route !== null && (matches[0]?.similarity ?? 0) < ROUTE_FALLBACK_SIMILARITY;
    if (fallback) matches = await searchChunks(embedding, null, excludeSectors);

    const context = matches
      .map((m, i) => `(${i + 1}) [${m.source} · ${m.title}]\n${m.content}`)
      .join("\n\n") || "(관련 자료 없음)";

    // 위젯이 보낸 지금까지의 질문 전체 + 이번 질문은 연관 질문에서 뺀다
    const asked = [
      ...(Array.isArray(askedInput) ? askedInput : []).filter((q) => typeof q === "string").slice(-50),
      ...recent.filter((t) => t.role === "user").map((t) => t.text),
      question.trim(),
    ];
    const [{ answer, model }, related] = await Promise.all([
      generate(question, context, recent),
      relatedQuestions(embedding, asked),
    ]);
    const sources = [...new Set(matches.map((m) => `${m.source} · ${m.title}`))];

    const { error: logError } = await supabase.from("site_chat_logs").insert({
      question,
      answer,
      sources,
      top_similarity: matches[0]?.similarity ?? null,
      model,
      sectors: {
        excluded: excludeSectors,
        routed: route?.picked ?? null,
        fallback,
        scores: route?.scores ?? null,
        hits: matches.map((m) => m.sector),
      },
    });
    if (logError) console.error(logError);

    // 출처는 site_chat_logs에만 기록하고 화면으로는 보내지 않는다
    return json({ answer, related });
  } catch (e) {
    console.error(e);
    return json({ error: "답변 생성 중 오류가 발생했습니다." }, 500);
  }
});
