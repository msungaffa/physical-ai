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
select created_at, question, answer, top_similarity, model from site_chat_logs order by created_at desc;
```

`top_similarity`가 낮은 질문은 자료가 부족하다는 뜻이니 문서를 보강할 때 참고합니다.
