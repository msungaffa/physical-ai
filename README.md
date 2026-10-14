# 나만의 피지컬 AI 제품 만들기

이 폴더는 과제 제출용 작업 폴더입니다.
나만의 피지컬 AI 제품을 기획하고, 그 제품을 소개하는 홈페이지를 만들어 GitHub Pages로 배포합니다.

## 폴더 구성

```
physicalAI/
├── README.md          ← 지금 보고 있는 안내 문서
├── index.html         ← 제품 소개 홈페이지 (GitHub Pages 시작 파일)
├── images/            ← 홈페이지에 쓸 이미지 (제품 사진, 스케치 등)
├── PRD/
│   └── PRD.md         ← 제품 요구사항 문서 (무엇을, 왜, 어떻게 만들지)
└── report/
    └── report.md      ← 과제 보고서 (과정, 회고, 배운 점)
```

## GitHub Pages 배포 방법

cd 
git init
git add .
git commit -m "처음 커밋"

git remote remove origin

git remote add origin https://github.com/msungaffa/physical-ai
git branch -M main
git push -u origin main --force


---

git init
git branch -M main
git remote remove origin
git remote add origin 
git add .
git commit -m "수정 내용에 대한 설명"
git push -u origin main --force

---

## 안내 챗봇 (RAG)

홈페이지 오른쪽 아래 챗봇은 `index.html`, `PRD/PRD.md`, `report/*.md` 내용을 근거로 답합니다.

```
질문 → Gemini 임베딩(768차원) → Supabase pgvector 검색(site_chunks) → Gemini 답변 생성 → site_chat_logs 기록
```

| 구성 | 위치 |
|---|---|
| DB 스키마 (`site_chunks`, `site_chat_logs`, `match_site_chunks`) | `supabase/migrations/20261013070000_site_rag.sql` |
| 섹터 칸·섹터 필터 검색 | `supabase/migrations/20261014090000_site_chunk_sectors.sql` |
| 문서 적재 함수 `site-ingest` (GitHub에서 문서를 읽어 청크·임베딩) | `supabase/functions/site-ingest/` |
| 답변 함수 `chat` | `supabase/functions/chat/index.ts` |
| 화면 위젯 | `chatbot.js` |

### 쉽게 보는 구조 (도서관 비유)

| 구성 | 도서관에서는 | 하는 일 |
|---|---|---|
| GitHub (홈페이지·PRD·보고서) | 원본 책이 있는 서고 | 모든 내용의 원본 |
| `site-ingest` 함수 | 책을 정리하는 사서 | 문서를 짧은 쪽지(청크)로 자름 |
| 임베딩 (Gemini) | 쪽지에 붙이는 주제 스티커 | 비슷한 주제끼리 찾을 수 있게 함 |
| `site_chunks` 테이블 | 쪽지를 모아 둔 카드 서랍 | 청크와 임베딩 저장 |
| `chat` 함수 | 안내 데스크 직원 | 질문과 비슷한 쪽지를 찾아 답을 만듦 |
| `site_chat_logs` 테이블 | 방문자 질문 기록장 | 질문·답변·유사도 기록 |
| `site_questions` 테이블 | "이런 것도 물어보세요" 목록 | 답변 아래 연관 질문 3개 |

```
[문서 정리]  문서 수정 → GitHub push → site-ingest 실행 → 바뀐 쪽지만 다시 임베딩 → site_chunks 저장
[질문 답변]  방문자 질문 → 질문 임베딩 → 비슷한 쪽지 검색 → 쪽지만 근거로 Gemini가 답변 → site_chat_logs 기록
```

- 홈페이지(GitHub Pages)는 사람이 읽는 화면이고, 챗봇은 그 화면 안의 안내 데스크입니다. 위젯이 질문을 Supabase `chat` 함수로 보냅니다.
- 챗봇은 서랍에 있는 쪽지만 보고 답합니다. 문서를 고쳐도 push와 `site-ingest`를 거치기 전에는 챗봇이 새 내용을 모릅니다.
- 서랍에 맞는 쪽지가 없으면 지어내지 않고 "홈페이지 자료에서는 확인되지 않습니다"라고 답합니다.

### 섹터 (쪽지의 주제 분류)

`site_chunks`의 모든 쪽지에는 `sector` 칸이 있어 주제별로 나눠 볼 수 있습니다. 테이블을 나누지 않고 칸 하나로 구분해서, 검색은 지금처럼 한 번에 하고 필요할 때만 섹터로 거릅니다.

| sector | 내용 | 출처 |
|---|---|---|
| `product` | 제품 개요·문제·시나리오·기능·위험 단계·범위 | 홈페이지, PRD |
| `hardware` | 하드웨어 부품·기술 스택 | 하드웨어 보고서, 홈페이지, PRD |
| `ai` | AI 모델·데이터 파이프라인·학습·검증 | 모델 보고서, preprocess, 홈페이지 |
| `business` | 성공 지표·ROI·PoC | PRD, 홈페이지 |
| `survey` | 현장 조사 체크리스트 | 현장조사 체크리스트 |
| `research` | 일반 비전 AI 모델 비교 조사 | 비전 AI 모델 비교 보고서 |
| `visionqc` | 비전QC 엣지 vs 클라우드 (별도 제품 사례) | 비전QC 보고서 |
| `general` | 아래 규칙에 없는 새 보고서 | — |

- 분류 규칙은 `supabase/functions/site-ingest/chunk.ts`에 있습니다. 홈페이지는 `<section id>`, PRD는 `##` 큰 제목, 보고서는 파일 이름으로 정합니다. 새 보고서를 추가하면 `REPORT_SECTORS`에 한 줄 넣어 주세요.
- 규칙만 바꾸고 `site-ingest`를 실행하면 다시 임베딩하지 않고 섹터만 고칩니다 (응답의 `resectored`).
- 챗봇은 질문에 "비전QC"나 "불량"이 없으면 `visionqc` 섹터를 빼고 검색합니다. 안전관리 시스템의 투자비·Edge 질문에 비전QC 수치가 섞이던 문제를 막기 위해서입니다.

```sql
-- 섹터별 쪽지 수
select sector, count(*) from site_chunks group by sector order by 2 desc;
```

### 문서를 고친 뒤 챗봇에 반영하기

1. 문서를 수정하고 GitHub에 push
2. 아래 명령 실행 (바뀐 청크만 다시 임베딩, 지운 내용은 DB에서도 삭제)

```
curl -X POST https://irnmlsgccbvbhsrdxaad.supabase.co/functions/v1/site-ingest
```

응답의 `remaining`이 0보다 크면 1분 뒤 한 번 더 실행합니다 (Gemini 무료 등급 임베딩 한도: 분당 100건).

### 질문 기록 보기

Supabase 대시보드 SQL Editor에서:

```sql
select created_at, question, answer, top_similarity, model, sectors from site_chat_logs order by created_at desc;
```

`top_similarity`가 낮은 질문은 자료가 부족하다는 뜻이니 문서를 보강할 때 참고합니다. `sectors`에는 그 질문에서 뺀 섹터(`excluded`)와 검색된 쪽지의 섹터(`hits`)가 남습니다.
