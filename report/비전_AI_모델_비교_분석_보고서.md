# 비전 AI 모델 비교 분석 보고서

작성일: 2026-10-12

## 1. 개요

여섯 기술은 경쟁 관계가 아니라 역할이 다른 부품입니다. 탐지는 YOLOE(실시간)와 DINO-X(고정확도), 분할은 SAM 3, 이미지 이해는 SigLIP, 글자 인식은 OCR, 사람 몸·얼굴·손 추적은 MediaPipe가 맡습니다.

이 보고서는 각 기술의 구조와 성능을 비교하고, 장단점을 정리한 뒤, 실생활 분야별로 어느 기술이 맞는지 추천합니다.

| 기술 | 한 줄 정의 | 주요 출력 |
| --- | --- | --- |
| YOLOE | 텍스트·이미지로 지시하는 실시간 오픈어휘 탐지·분할 | 박스 + 마스크 |
| DINO-X | 범용 객체 인식을 목표로 한 대형 오픈월드 탐지 모델 | 박스, 마스크, 키포인트, 캡션 |
| SAM 3 | 개념(명사구·예시 이미지)으로 모든 인스턴스를 찾아 분할·추적 | 마스크 + 영상 트랙 |
| SigLIP | 이미지와 텍스트를 같은 임베딩 공간에 놓는 인코더 | 임베딩, 유사도 점수 |
| OCR | 이미지 속 글자를 텍스트로 변환하는 기술 범주 | 텍스트 + 위치 |
| MediaPipe | 온디바이스 실시간 인체·제스처 인식 프레임워크 | 랜드마크 좌표, 제스처 |

OCR은 단일 모델이 아니라 기술 범주이므로, 대표 엔진(Tesseract, PaddleOCR, 클라우드 OCR, VLM 기반 OCR)을 묶어 비교합니다.

## 2. 모델별 상세 소개

### 2.1 YOLOE — 실시간 오픈어휘 탐지·분할

- **개발**: 칭화대 THU-MIG(Ao Wang 외), 2025년 3월 공개, ICCV 2025 채택. [논문](https://arxiv.org/abs/2503.07465) · [Ultralytics 문서](https://docs.ultralytics.com/models/yoloe/)
- **구조**: YOLO 계열 검출기에 세 가지 프롬프트 모듈을 더했습니다.
    - RepRTA: 텍스트 프롬프트. 재파라미터화로 추론 오버헤드가 0입니다.
    - SAVPE: 예시 박스를 주는 시각 프롬프트.
    - LRPC: 내장 어휘(4,585개 클래스)로 프롬프트 없이 탐지.
- **성능**: YOLOE-v8-S는 LVIS에서 YOLO-Worldv2-S보다 3.5 AP 높고, 학습 비용은 3배 적고, 추론은 1.4배 빠릅니다. 최신 YOLOE-26x는 LVIS minival 40.6 mAP(55.2M 파라미터)입니다.
- **배포**: ONNX, TensorRT, CoreML, LiteRT, OpenVINO, RKNN으로 내보낼 수 있고, n/s 크기는 Jetson·CPU에서도 돕니다. 단, 내보낸 모델은 클래스가 고정됩니다.

### 2.2 DINO-X — 범용 오픈월드 객체 인식

- **개발**: IDEA Research, 2024년 11월 공개(2025년 5월 개정). Grounding DINO 계보의 후속입니다. [논문](https://arxiv.org/abs/2411.14347) · [API](https://github.com/IDEA-Research/DINO-X-API)
- **구조**: Transformer 인코더-디코더 구조로, 1억 건 이상의 그라운딩 샘플(Grounding-100M)로 사전학습했습니다.
- **기능**: 텍스트·시각·맞춤형 프롬프트와 프롬프트 없는 탐지를 지원합니다. 탐지와 함께 분할, 포즈 추정, 영역 캡션, 개수 세기도 합니다.
- **성능**: DINO-X Pro는 제로샷으로 COCO 56.0 AP, LVIS-minival 59.8 AP, LVIS-val 52.4 AP입니다. 희귀 클래스는 63.3 AP로 기존 최고보다 5.8 AP 높습니다.
- **배포**: 가중치 비공개, DeepDataSpace 클라우드 API로만 제공되며 토큰 신청과 유료 과금이 필요합니다.

### 2.3 SAM 3 — 개념 기반 분할·추적

- **개발**: Meta, 2025년 11월 공개. 2026년 3월 다중 객체 추적을 빠르게 한 SAM 3.1 출시. [논문](https://arxiv.org/abs/2511.16719) · [GitHub](https://github.com/facebookresearch/sam3)
- **핵심 개념**: PCS(Promptable Concept Segmentation). "노란 스쿨버스" 같은 명사구나 예시 이미지를 주면, 이미지·영상 속 해당 객체 모두를 찾아 분할하고 추적합니다. SAM 1·2의 점·박스 프롬프트도 그대로 지원합니다.
- **구조**: 848M 파라미터. 검출기와 메모리 기반 영상 추적기가 하나의 백본을 공유합니다. 400만 개 고유 개념 라벨 데이터로 학습했습니다.
- **성능**: 이미지·영상 PCS 정확도가 기존 시스템의 약 2배입니다. SA-Co/Gold에서 55.7 cgF1로, 사람(74.0)의 약 75%입니다.
- **배포**: SAM License, Hugging Face에서 접근 승인 후 체크포인트 다운로드.

### 2.4 SigLIP / SigLIP 2 — 이미지-텍스트 임베딩

- **개발**: Google. SigLIP은 2023년(ICCV 2023), SigLIP 2는 2025년 2월 공개. [SigLIP 2 논문](https://arxiv.org/abs/2502.14786)
- **구조**: CLIP과 같은 이중 인코더(이미지 ViT + 텍스트). CLIP의 softmax 대조 손실 대신 쌍별 sigmoid 손실을 써서 배치 크기에 덜 민감하고 학습이 효율적입니다.
- **SigLIP 2 개선점**: 캡션 기반 사전학습, 자기지도 손실, 온라인 데이터 선별을 더해 위치 파악·밀집 예측이 개선됐고, 다국어 이해와 공정성이 좋아졌습니다. 원본 비율을 유지하는 NaFlex 변형도 있습니다.
- **크기**: ViT-B(86M), L(303M), So400m(400M), g(1B).
- **용도**: 제로샷 분류, 이미지 검색, VLM의 비전 인코더(PaliGemma, Gemma 3 등). 박스나 마스크는 직접 내지 않습니다.

### 2.5 OCR — 문자 인식 기술 범주

- **구조**: 전통적으로 텍스트 검출 → 문자 인식 2단계 파이프라인입니다. 최근에는 VLM이 표·수식·레이아웃까지 한 번에 읽는 문서 파싱형이 늘고 있습니다.
- **대표 엔진**:
    - Tesseract: 오래된 오픈소스 엔진. 깔끔한 인쇄물에 강하고 사진·손글씨에는 약합니다.
    - [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR): Baidu, Apache 2.0. 2026년 6월 PP-OCRv6(1.5M~34.5M 파라미터, CPU 5.2배 가속) 출시. 문서 파싱용 PaddleOCR-VL(0.9B)은 111개 언어(한국어 포함)를 지원하고 OmniDocBench v1.6에서 96.3% 이상입니다.
    - 클라우드 OCR: Google Cloud Vision, Azure Document Intelligence, AWS Textract, 네이버 CLOVA OCR 등. 양식·영수증 특화 기능을 종량 과금으로 제공합니다.

### 2.6 MediaPipe — 온디바이스 인체 인식 프레임워크

- **개발**: Google, Apache 2.0. [공식 가이드](https://developers.google.com/edge/mediapipe/solutions/guide)
- **비전 태스크**: 얼굴 탐지, 얼굴 랜드마크(478점), 손 랜드마크(21점), [포즈 랜드마크](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)(33점, 3D 월드 좌표 포함), 제스처 인식, 홀리스틱, 이미지 분류·분할, 객체 탐지.
- **구조**: MobileNetV2류 경량 CNN(BlazePose 등). 포즈 모델은 Lite/Full/Heavy 3종입니다.
- **배포**: Android, iOS, Web, Python. Model Maker로 제스처·분류·탐지 모델을 재학습할 수 있고, LLM 추론 등 비전 외 태스크도 있습니다.

## 3. 종합 비교표

오픈어휘 탐지가 필요하면 실시간은 YOLOE, 최고 정확도는 DINO-X, 정밀한 마스크·영상 추적은 SAM 3가 유리합니다. 나머지 세 기술은 출력 종류가 달라 직접 경쟁하지 않습니다.

| 항목 | YOLOE | DINO-X | SAM 3 | SigLIP 2 | OCR (PaddleOCR 기준) | MediaPipe |
| --- | --- | --- | --- | --- | --- | --- |
| 개발사 | 칭화대 / Ultralytics | IDEA Research | Meta | Google | Baidu 외 다수 | Google |
| 주 태스크 | 탐지 + 인스턴스 분할 | 탐지, 분할, 포즈, 캡션 | 개념 분할 + 영상 추적 | 분류, 검색, 임베딩 | 문자 검출·인식, 문서 파싱 | 얼굴·손·포즈 랜드마크 |
| 오픈어휘 | 예 (텍스트·시각·무프롬프트) | 예 (텍스트·시각·무프롬프트) | 예 (명사구·예시 이미지·점/박스) | 예 (임의 텍스트 레이블) | 해당 없음 (문자 전용) | 아니오 (고정 태스크) |
| 대표 수치 | LVIS minival 40.6 mAP (26x) | COCO 56.0 AP, LVIS-minival 59.8 AP | SA-Co/Gold 55.7 cgF1 (사람 74.0) | 제로샷 분류·검색 SigLIP 대비 향상 | OmniDocBench v1.6 96.3%+ (VL-1.6) | 포즈 33점, 손 21점, 얼굴 478점 |
| 모델 크기 | 3.9M ~ 55.2M | 비공개 (대형) | 848M | 86M ~ 1B | 1.5M ~ 34.5M (에지), 0.9B (VL) | 수 MB 급 경량 |
| 속도 | 실시간 (모바일·Jetson 가능) | 클라우드 응답 시간 의존 | GPU 필요, 실시간은 고사양 GPU에서만 | 빠름 (임베딩 1회 계산) | 에지 모델은 CPU 실시간 | 모바일 CPU에서 실시간 |
| 배포 형태 | 로컬 / 에지 | 클라우드 API 전용 | 로컬 GPU 서버 | 로컬 / 서버 | 로컬 / 클라우드 | 온디바이스 (Android·iOS·Web·Python) |
| 라이선스 | AGPL-3.0 (상용은 Ultralytics 라이선스) | 상용 API (유료) | SAM License (접근 승인) | Apache 2.0 | Apache 2.0 | Apache 2.0 |
| 학습 난이도 | 낮음 (Ultralytics API) | 불가 (API) | 중간 (파인튜닝 가능) | 중간 | 낮음~중간 | 낮음 (Model Maker) |

속도 행은 공식 문서의 배포 대상을 근거로 한 상대 비교입니다. 동일 하드웨어에서 측정한 값이 아니라서, 도입 전 자체 벤치마크를 권장합니다. YOLOE의 AGPL-3.0은 Ultralytics 통합본 기준이며, 원본 THU-MIG 저장소 라이선스는 별도 확인이 필요합니다.

## 4. 모델별 장단점

가장 큰 차이는 "어디서 돌아가는가"입니다. YOLOE·MediaPipe·에지 OCR은 기기 안에서 돌고, DINO-X는 클라우드, SAM 3는 GPU 서버가 필요합니다.

| 기술 | 장점 | 단점 |
| --- | --- | --- |
| YOLOE | 실시간 속도와 오픈어휘를 동시에 제공; 텍스트·시각·무프롬프트 3모드; 박스와 마스크를 한 번에 출력; 다양한 에지 포맷 내보내기; 학습·파인튜닝이 쉬움 | 정확도는 DINO-X 같은 대형 모델보다 낮음(복잡한 문장 프롬프트에 약함); 내보낸 모델은 클래스 고정; AGPL-3.0이라 상용 제품은 라이선스 구매 검토 |
| DINO-X | 오픈월드 탐지 최상위 정확도, 특히 희귀 클래스와 롱테일에 강함; 탐지·분할·포즈·캡션·개수 세기를 하나로; GPU 인프라 불필요 | 가중치 비공개, API 전용이라 오프라인·온프레미스 불가; 호출 당 비용과 네트워크 지연; 이미지를 외부 서버로 보내는 보안·개인정보 문제; 자체 재학습 불가 |
| SAM 3 | 개념 하나로 모든 인스턴스를 찾아 픽셀 단위 마스크; 영상 추적까지 통합; 점·박스로 대화형 수정 가능; 라벨링 자동화에 매우 강함 | 848M로 무거워 고사양 GPU 필요, 모바일 불리; 긴 문장·추론이 필요한 프롬프트는 별도 LLM 에이전트 필요; 사람 대비 약 75% 수준; 체크포인트 접근 승인 필요 |
| SigLIP 2 | 임의 라벨 제로샷 분류·검색; 임베딩을 미리 계산해 대규모 검색에 효율적; 다국어 지원; VLM의 비전 백본으로 검증됨; Apache 2.0 | 박스·마스크 등 위치 정보를 직접 출력하지 않음; 개수 세기·세밀한 공간 관계에 약함; 단독으로는 완성 서비스가 아니고 부품 |
| OCR | 문서 디지털화의 핵심; 에지용 초경량부터 문서 파싱 VLM까지 선택지가 넓음; 오픈소스(PaddleOCR)는 무료 상용 가능 | 손글씨·굴곡·저화질에서 정확도 하락; 글자만 읽고 장면 의미는 모름; VLM OCR은 환각(없는 내용 생성) 위험; 클라우드는 비용·개인정보 이슈 |
| MediaPipe | 모바일 CPU에서도 실시간; 성숙한 크로스플랫폼 SDK; 3D 포즈 좌표; 오프라인이라 개인정보에 유리; Apache 2.0 | 사람(얼굴·손·몸) 중심이고 오픈어휘 불가; 다인원·가림에 약함; 객체 탐지 정확도는 최신 YOLO류보다 낮음; 일부 레거시 솔루션 지원 종료 |

## 5. 실생활 분야별 적합 AI

기기 안에서 실시간으로 돌아야 하면 YOLOE·MediaPipe, 정확도가 최우선이고 오프라인 처리가 가능하면 DINO-X·SAM 3가 맞습니다. 문서가 대상이면 OCR, 검색·분류가 목적이면 SigLIP이 중심입니다.

| 분야 | 대표 사례 | 1순위 | 보조 | 선정 이유 |
| --- | --- | --- | --- | --- |
| 제조·품질검사 | 라인 위 불량 탐지, 부품 개수 | YOLOE | SAM 3 (결함 라벨링), OCR (각인·로트번호) | 라인 속도에 맞는 실시간성과 공장 내 에지 배포가 필수 |
| 교통·스마트시티 | 차량·보행자 인식, 번호판 인식 | YOLOE | OCR (번호판), SAM 3 (오프라인 영상 분석) | CCTV·차량 에지 장치에서 실시간 처리 |
| 보안·관제 | 침입 탐지, 이상 물체 탐색 | YOLOE | SigLIP ("빨간 가방 든 사람" 같은 영상 검색), DINO-X (사후 정밀 분석) | 현장은 실시간, 사후 수사는 정확도·검색 |
| 의료·영상진단 | 장기·병변 분할, 의료영상 라벨링 | SAM 3 | OCR (처방전·진료기록), MediaPipe (재활 동작 분석) | 픽셀 단위 정밀도가 핵심, 환자 데이터는 외부 API 전송 금지 — 의료 도메인 파인튜닝 필수 |
| 헬스케어·피트니스 | 홈트레이닝 자세 교정, 낙상 감지 | MediaPipe | YOLOE (사람 검출) | 스마트폰에서 33점 포즈를 오프라인 실시간 추적 |
| 리테일·물류 | 진열대 재고 파악, 무인계산, 택배 분류 | YOLOE | OCR (송장·가격표), SigLIP (상품 이미지 검색), DINO-X (소량·다품종 개수 세기) | 신상품이 계속 바뀌어 오픈어휘가 유리 |
| 전자상거래·검색 | 사진으로 비슷한 상품 찾기, 자동 태깅 | SigLIP | SAM 3 (배경 제거) | 이미지-텍스트 임베딩 검색, 다국어 지원 |
| 금융·행정·문서 | 영수증·신분증 입력, 계약서 디지털화 | OCR | SigLIP (문서 유형 분류) | 텍스트·표 추출이 목적, 개인정보는 온프레미스 PaddleOCR 권장 |
| 농업·환경 | 작물 병해 부위, 과일 개수, 드론 항공 분석 | SAM 3 | YOLOE (드론 실시간), DINO-X (희귀종 탐지) | 불규칙한 형태의 영역 분할과 개체 수 세기 |
| 로봇·자율주행 | 물체 집기, 장애물 인식 | YOLOE | SAM 3 (파지 영역 마스크), MediaPipe (사람 제스처 명령) | 로봇 탑재 연산 안에서 "컵 집어줘" 같은 임의 대상 탐지 |
| AR·VR·엔터테인먼트 | 얼굴 필터, 핸드 트래킹, 모션 캡처 | MediaPipe | SAM 3 (영상 편집·객체 지우기) | 얼굴 478점·손 21점 랜드마크를 모바일·웹에서 실시간 |
| 교육·접근성 | 수어 인식, 시각장애인 안내, 교과서 읽기 | MediaPipe (수어) / OCR (읽기) | YOLOE (주변 물체 안내), SigLIP (장면 설명) | 휴대폰 오프라인 동작이 필수 |
| AI 데이터 구축 | 학습 데이터 자동 라벨링 | SAM 3 | DINO-X (박스 자동 생성), SigLIP (데이터 선별·중복 제거) | 속도보다 품질, 라벨링 비용을 크게 절감 |

추천은 공개 문서의 능력·배포 조건에 기반한 판단이며, 분야별 도입 전 실제 데이터로 검증이 필요합니다.

## 6. 조합 활용 전략 및 결론

실제 서비스는 단일 모델보다 조합이 일반적입니다. 대표적인 조합은 다음과 같습니다.

1. **라벨링 → 경량 배포**: SAM 3·DINO-X로 학습 데이터를 자동 라벨링 → YOLOE를 파인튜닝 → 에지 기기에 배포. 정확도와 속도를 모두 얻는 가장 현실적인 방법입니다.
2. **탐지 → 정밀 분할**: YOLOE가 실시간으로 박스를 찾고, 필요한 프레임만 SAM 3에 박스 프롬프트로 넘겨 정밀 마스크를 얻습니다.
3. **검출 → 인식**: YOLOE로 번호판·송장 영역을 찾고 OCR로 글자를 읽습니다.
4. **사람 + 사물**: MediaPipe로 손 위치·제스처를 추적하고, YOLOE로 손에 든 물체를 인식합니다(제조 작업 모니터링, 무인계산대).
5. **자르기 → 의미 판단**: 탐지·분할한 영역을 SigLIP에 넣어 세부 속성(색상, 브랜드, 상태)을 제로샷 분류하거나 검색 색인을 만듭니다.

### 결론: 상황별 선택 기준

- **실시간 + 기기 내 + 임의 사물** → YOLOE
- **최고 정확도 + 클라우드 허용 + 인프라 없음** → DINO-X
- **픽셀 단위 마스크 + 영상 추적 + GPU 보유** → SAM 3
- **분류·검색·VLM 백본** → SigLIP 2
- **글자·문서·표** → OCR (에지: PP-OCRv6, 복잡한 문서: PaddleOCR-VL)
- **얼굴·손·자세 + 스마트폰** → MediaPipe

미결 사항: 상용 제품이라면 YOLOE(AGPL-3.0)와 SAM 3(SAM License)의 라이선스 조건을 법무 검토해야 합니다.

## 7. 참고 자료

- [YOLOE: Real-Time Seeing Anything (arXiv 2503.07465)](https://arxiv.org/abs/2503.07465)
- [Ultralytics YOLOE 문서](https://docs.ultralytics.com/models/yoloe/)
- [DINO-X: A Unified Vision Model for Open-World Object Detection and Understanding (arXiv 2411.14347)](https://arxiv.org/abs/2411.14347)
- [DINO-X API (GitHub)](https://github.com/IDEA-Research/DINO-X-API)
- [SAM 3: Segment Anything with Concepts (arXiv 2511.16719)](https://arxiv.org/abs/2511.16719)
- [SAM 3 (GitHub)](https://github.com/facebookresearch/sam3)
- [SigLIP 2 (arXiv 2502.14786)](https://arxiv.org/abs/2502.14786)
- [PaddleOCR (GitHub)](https://github.com/PaddlePaddle/PaddleOCR)
- [MediaPipe Solutions 가이드](https://developers.google.com/edge/mediapipe/solutions/guide)
- [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)

얼굴 478점·손 21점 랜드마크, SigLIP 1(2023), Tesseract·클라우드 OCR 설명은 일반적으로 알려진 내용이며 이번 조사에서 원문을 열어 확인하지는 않았습니다.
