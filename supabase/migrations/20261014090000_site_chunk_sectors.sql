-- 청크를 주제(섹터)별로 구분한다. 값은 site-ingest(chunk.ts의 sectorOf)가 채운다.
--   product   제품 개요·문제·시나리오·기능·위험 단계·범위
--   hardware  하드웨어 부품·기술 스택
--   ai        AI 모델·데이터 파이프라인·학습·검증
--   business  성공 지표·ROI·PoC
--   survey    현장 조사 체크리스트
--   research  일반 비전 AI 모델 비교 조사 (우리 제품 선정 결과가 아님)
--   visionqc  비전QC 엣지 vs 클라우드 사례 (별도 제품 사례)
--   general   위 규칙에 없는 새 문서
alter table public.site_chunks add column if not exists sector text not null default 'general';
create index if not exists site_chunks_sector_idx on public.site_chunks (sector);

-- 섹터 필터를 받을 수 있도록 검색 함수를 바꾼다 (필터를 안 주면 기존과 같이 전체 검색)
drop function if exists public.match_site_chunks(extensions.vector, int, float);

create function public.match_site_chunks(
  query_embedding extensions.vector(768),
  match_count int default 5,
  match_threshold float default 0.5,
  include_sectors text[] default null,  -- 이 섹터에서만 찾기 (null이면 전체)
  exclude_sectors text[] default '{}'   -- 이 섹터는 빼기
)
returns table (id bigint, source text, title text, content text, sector text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select c.id, c.source, c.title, c.content, c.sector,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.site_chunks c
  where 1 - (c.embedding <=> query_embedding) > match_threshold
    and (include_sectors is null or c.sector = any(include_sectors))
    and not (c.sector = any(exclude_sectors))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_site_chunks from public, anon, authenticated;

-- 챗봇이 이번 질문에 어떤 섹터 규칙을 썼는지 기록 (평가·디버깅용)
alter table public.site_chat_logs add column if not exists sectors jsonb;
