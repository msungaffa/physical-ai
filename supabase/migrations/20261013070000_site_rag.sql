-- 홈페이지 챗봇 RAG용 저장소 (pgvector)
-- 같은 프로젝트에 있는 다른 실습용 documents/chunks 테이블과 겹치지 않도록 site_ 접두사를 쓴다.
create extension if not exists vector with schema extensions;

create table if not exists public.site_chunks (
  id bigint generated always as identity primary key,
  source text not null,          -- 출처 파일 (예: index.html, PRD/PRD.md)
  title text not null,           -- 섹션 제목
  content text not null,         -- 청크 본문
  content_hash text not null unique,  -- source+title+content 해시, 바뀐 청크만 다시 임베딩
  embedding extensions.vector(768) not null,  -- gemini-embedding-001 (768차원)
  created_at timestamptz not null default now()
);

create index if not exists site_chunks_embedding_idx
  on public.site_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- 챗봇 질문/답변 기록 (어떤 질문이 들어오는지 보고 문서를 보강하는 용도)
create table if not exists public.site_chat_logs (
  id bigint generated always as identity primary key,
  question text not null,
  answer text,
  sources jsonb not null default '[]',
  top_similarity float,
  created_at timestamptz not null default now()
);

-- RLS: 정책을 두지 않아 브라우저(anon)에서는 접근 불가, Edge Function(service role)만 접근
alter table public.site_chunks enable row level security;
alter table public.site_chat_logs enable row level security;

-- 질문 임베딩과 가장 가까운 청크 검색
create or replace function public.match_site_chunks(
  query_embedding extensions.vector(768),
  match_count int default 5,
  match_threshold float default 0.5
)
returns table (id bigint, source text, title text, content text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select c.id, c.source, c.title, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.site_chunks c
  where 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_site_chunks from public, anon, authenticated;

-- 답변을 만든 Gemini 모델 (한도 초과 시 다른 모델로 넘어가므로 기록)
alter table public.site_chat_logs add column if not exists model text;
