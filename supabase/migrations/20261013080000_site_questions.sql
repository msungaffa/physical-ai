-- 챗봇 연관 질문 (data/chatbot-questions.json을 site-ingest가 임베딩해 저장)
create table if not exists public.site_questions (
  id bigint generated always as identity primary key,
  question text not null unique,
  embedding extensions.vector(768) not null,
  created_at timestamptz not null default now()
);

alter table public.site_questions enable row level security;

-- 방금 질문과 의미가 가까운 연관 질문 검색
-- exclude: 이미 물어본 질문, max_similarity 이상은 사실상 같은 질문이라 제외
create or replace function public.match_site_questions(
  query_embedding extensions.vector(768),
  exclude text[] default '{}',
  match_count int default 3,
  max_similarity float default 0.93
)
returns table (question text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select q.question, 1 - (q.embedding <=> query_embedding) as similarity
  from public.site_questions q
  where not (q.question = any(exclude))
    and 1 - (q.embedding <=> query_embedding) < max_similarity
  order by q.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_site_questions from public, anon, authenticated;
