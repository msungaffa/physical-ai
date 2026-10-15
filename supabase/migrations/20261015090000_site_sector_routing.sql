-- 질문 → 섹터 고르기: 섹터마다 대표 벡터(청크 임베딩 평균)를 두고,
-- 질문 벡터와 가까운 섹터만 검색하게 한다. 대표 벡터는 site-ingest가 적재를 마칠 때 새로 계산한다.
create materialized view if not exists public.site_sector_centroids as
  select sector, avg(embedding)::extensions.vector(768) as centroid, count(*) as chunk_count
  from public.site_chunks
  group by sector;

create unique index if not exists site_sector_centroids_sector_idx on public.site_sector_centroids (sector);

revoke all on public.site_sector_centroids from public, anon, authenticated;

create or replace function public.refresh_site_sector_centroids()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view concurrently public.site_sector_centroids;
$$;

revoke execute on function public.refresh_site_sector_centroids from public, anon, authenticated;

-- 질문과 가까운 섹터 순위 (similarity 높은 순)
create or replace function public.match_site_sectors(
  query_embedding extensions.vector(768),
  exclude_sectors text[] default '{}'
)
returns table (sector text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select s.sector, 1 - (s.centroid <=> query_embedding) as similarity
  from public.site_sector_centroids s
  where not (s.sector = any(exclude_sectors))
  order by s.centroid <=> query_embedding;
$$;

revoke execute on function public.match_site_sectors from public, anon, authenticated;
