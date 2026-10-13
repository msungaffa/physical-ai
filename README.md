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
