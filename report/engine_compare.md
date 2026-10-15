# YOLO26n 추론 엔진 비교 결과

ONNX Runtime, OpenVINO, NCNN, TFLite(LiteRT) 네 엔진의 추론 속도, 정확도, 모델 용량을 비교했다.

- 측정일: 2026-10-15
- 스크립트: `yolo26/yolo26_engines.py`
- 원본 결과: `engine_compare.txt`(요약), `engine_compare.csv`(이미지별 측정값)

## 1. 측정 환경

| 항목 | 내용 |
|---|---|
| 플랫폼 | Windows 11 AMD64 / Python 3.13.2 |
| CPU | AMD Ryzen 5 7530U (물리 6코어 / 논리 12스레드) |
| 모델 | yolo26n, FP32, 입력 640x640 (letterbox) |
| 데이터 | `data/coco128` 앞 100장, 정답 박스 741개 |
| 스레드 | 모든 엔진 6스레드 (물리 코어 수) |
| 반복 | 엔진별 웜업 50회 후, 100장 x 3바퀴 = 300회 측정 |

## 2. 결과 요약

| 엔진 | 추론 p50 | 추론 p95 | 전체 p50 | FPS | 상대 속도 | mAP50 | mAP50-95 | 출력 오차 | 용량 | 로드 시간 |
|---|---|---|---|---|---|---|---|---|---|---|
| **OpenVINO** | **57.24 ms** | 100.00 ms | **70.71 ms** | 12.8 | **1.00x** | 0.6250 | 0.4604 | 1.05e-02 | 9.63 MB | 1601 ms |
| ONNX Runtime | 59.60 ms | **68.44 ms** | 76.07 ms | **13.0** | 0.96x | 0.6250 | 0.4604 | 기준 | 9.45 MB | 246 ms |
| TFLite (LiteRT) | 91.38 ms | 99.50 ms | 105.24 ms | 9.4 | 0.63x | 0.6250 | 0.4604 | 2.14e-02 | 9.45 MB | 282 ms |
| NCNN | 117.16 ms | 129.53 ms | 134.34 ms | 7.4 | 0.49x | 0.6250 | 0.4604 | 3.29e-02 | **9.31 MB** | **110 ms** |

- **p50 / p95:** 중앙값 / 느린 쪽 5% 경계값
- **전체:** 전처리 + 추론 + 후처리
- **FPS:** 전체 파이프라인의 실측 처리량
- **상대 속도:** 가장 빠른 엔진의 추론 p50 ÷ 해당 엔진의 추론 p50
- **출력 오차:** ONNX Runtime 원시 출력과 비교한 최대 절대오차 (픽셀 좌표 단위)

## 3. 분석

### 속도
- OpenVINO와 ONNX Runtime이 거의 같은 속도로 가장 빠르다.
- TFLite는 약 1.6배, NCNN은 약 2배 느리다.
- OpenVINO는 중앙값은 가장 빠르지만 p95가 100 ms로 편차가 크다 (표준편차 22.2 ms). ONNX Runtime은 p95가 68 ms로 가장 안정적이다.
- NCNN은 모바일·ARM용으로 최적화된 엔진이라 x86 노트북에서는 불리하다. 라즈베리파이 같은 ARM 기기에서는 순위가 달라질 수 있다.

### 정확도
- 네 엔진 모두 mAP50 0.6250, mAP50-95 0.4604로 소수점 넷째 자리까지 같다.
- 원시 출력 차이도 최대 0.01~0.03 수준이라, 변환하면서 정확도가 떨어지지 않았다.

### 용량
- 같은 FP32 가중치라 9.3~9.6 MB로 비슷하다.
- 용량 차이를 보려면 FP16/INT8 양자화가 있어야 한다. 참고로 TFLite FP16 모델(`yolo26n_float16.tflite`)은 5.0 MB다.

## 4. 단계별 상세 (ms)

| 엔진 | 단계 | p50 | p95 | mean | std | min | max |
|---|---|---|---|---|---|---|---|
| ONNX Runtime | 전처리 | 12.66 | 16.85 | 12.92 | 2.22 | 8.45 | 21.92 |
| | 추론 | 59.60 | 68.44 | 60.15 | 5.70 | 48.73 | 101.81 |
| | 후처리 | 3.41 | 5.10 | 3.44 | 0.89 | 2.11 | 8.55 |
| | 전체 | 76.07 | 86.28 | 76.52 | 6.25 | 65.54 | 118.58 |
| OpenVINO | 전처리 | 11.44 | 17.39 | 11.92 | 3.25 | 8.11 | 45.42 |
| | 추론 | 57.24 | 100.00 | 62.22 | 22.20 | 37.84 | 265.96 |
| | 후처리 | 3.08 | 4.95 | 3.33 | 0.99 | 2.31 | 11.47 |
| | 전체 | 70.71 | 120.11 | 77.46 | 24.03 | 50.67 | 281.09 |
| NCNN | 전처리 | 13.29 | 17.34 | 13.45 | 2.28 | 8.48 | 25.39 |
| | 추론 | 117.16 | 129.53 | 118.08 | 5.89 | 107.72 | 146.26 |
| | 후처리 | 3.61 | 4.89 | 3.66 | 0.67 | 2.39 | 7.69 |
| | 전체 | 134.34 | 148.59 | 135.19 | 7.08 | 122.16 | 170.45 |
| TFLite (LiteRT) | 전처리 | 10.67 | 13.24 | 10.93 | 1.37 | 9.00 | 19.50 |
| | 추론 | 91.38 | 99.50 | 92.22 | 4.74 | 84.64 | 124.75 |
| | 후처리 | 2.89 | 4.22 | 3.08 | 0.64 | 2.27 | 6.85 |
| | 전체 | 105.24 | 115.96 | 106.23 | 5.30 | 97.49 | 137.64 |

## 5. 측정 방식

- **공정성:** 네 엔진 모두 같은 가중치와 같은 전처리·후처리(`yolo26_benchmark.py`), 같은 스레드 수를 쓴다. 엔진마다 다른 것은 추론 호출 부분뿐이다.
- **정확도 기준:** 후보 신뢰도 0.001, 중복 박스 제거(NMS) IoU 0.7로, ultralytics `val`과 같다.
- **속도 측정의 후처리:** 실제 배포 기준인 신뢰도 0.25를 쓴다.
- **입력 형식:** TFLite만 입력이 NHWC라서, 추론 구간 안에서 축 순서를 바꾼다.

## 6. 엔진 버전과 모델 파일

| 엔진 | 버전 | 모델 파일 (`models/` 아래) | 만든 방법 |
|---|---|---|---|
| ONNX Runtime | onnxruntime 1.31.0 | `yolo26n.onnx` | 기존 파일 |
| OpenVINO | openvino 2026.4.1 | `yolo26n_openvino_model/` | ultralytics export |
| NCNN | ncnn 1.0.20260526 | `yolo26n_ncnn_model/` | ultralytics export |
| TFLite (LiteRT) | ai-edge-litert 2.3.0 | `yolo26n_litert_model/yolo26n_float32.tflite` | onnx2tf로 직접 변환 |

ultralytics의 TFLite(LiteRT) 내보내기는 Windows를 지원하지 않아서, `onnx2tf -i yolo26n.onnx -o yolo26n_litert_model -nuo`로 변환했다.

## 7. 재실행

```powershell
python yolo26/yolo26_engines.py                            # 기본 (100장, 3바퀴, 6스레드)
python yolo26/yolo26_engines.py --rounds 5 --threads 4     # 조건 변경
python yolo26/yolo26_engines.py --engines onnxruntime openvino
```

## 8. 엔진별 차이와 사용처

4개는 서로 다른 모델이 아니라 **추론 엔진**이다. 가중치는 모두 같은 yolo26n이고, 그 모델을 **어떤 기기에서 얼마나 빠르게 돌리느냐**가 다르다. 그래서 위 측정에서 정확도가 4개 모두 같게 나왔다.

### 한눈에 비교

| 엔진 | 만든 곳 | 강한 하드웨어 | 주 사용처 |
|---|---|---|---|
| **ONNX Runtime** | Microsoft | 거의 모든 곳 (CPU, NVIDIA GPU, DirectML 등) | 범용 표준, 서버, PC |
| **OpenVINO** | Intel | Intel CPU, 내장 GPU, NPU | Intel PC·산업용 PC·엣지 서버 |
| **NCNN** | Tencent | ARM CPU (모바일), Vulkan GPU | 스마트폰 앱, 라즈베리파이 |
| **TFLite (LiteRT)** | Google | ARM CPU, 모바일 GPU, Edge TPU | 안드로이드, 마이크로컨트롤러, Coral |

### 각각의 특징

**ONNX Runtime: 범용**
- ONNX는 모델 표준 형식이다. PyTorch에서 내보낸 모델을 대부분 그대로 돌릴 수 있다.
- 실행 백엔드(Execution Provider)만 바꾸면 CPU, CUDA, TensorRT, DirectML 등에서 쓸 수 있다.
- 이번 측정에서 가장 안정적이었다 (p95 68 ms).
- **쓸 곳:** 일단 배포해야 할 때의 기본 선택, Windows/Linux 서버, 웹 백엔드

**OpenVINO: Intel 하드웨어 최적화**
- Intel CPU의 AVX-512, VNNI, AMX 같은 명령어와 Intel 내장 GPU, NPU(Core Ultra)를 활용한다.
- INT8 양자화 도구(NNCF)가 잘 갖춰져 있다.
- 이번 PC는 AMD CPU라 장점이 일부만 나왔는데도 가장 빨랐다. Intel CPU에서는 차이가 더 벌어진다.
- **쓸 곳:** 공장 비전 검사 PC, CCTV 분석 서버, Intel NPU 노트북

**NCNN: 모바일 ARM 특화**
- 의존성이 없는 순수 C++ 라이브러리라 가볍다. 이번 측정에서 로드가 가장 빨랐다 (110 ms).
- ARM NEON 최적화와 Vulkan GPU 가속을 지원해서 안드로이드·iOS 앱에 넣기 좋다.
- x86에는 덜 최적화되어 있어서 이번 PC에서는 가장 느렸다.
- **쓸 곳:** 스마트폰 앱 안의 실시간 탐지, 라즈베리파이, 저가 ARM 보드

**TFLite (LiteRT): Google 생태계와 초경량 기기**
- 안드로이드의 공식 온디바이스 AI 런타임이다. GPU·NNAPI·Edge TPU 가속(delegate)을 지원한다.
- INT8 양자화 모델은 마이크로컨트롤러(TFLite Micro)나 Coral Edge TPU에서도 돌아간다.
- PyTorch 모델은 변환을 한 번 더 거쳐야 해서 번거롭다. 이번에도 onnx2tf로 따로 변환했다.
- **쓸 곳:** 안드로이드 앱, Coral TPU, ESP32 같은 초소형 기기

### 상황별 선택

| 상황 | 추천 |
|---|---|
| PC·서버에 빠르게 배포 | ONNX Runtime |
| Intel CPU·NPU 장비 | OpenVINO |
| NVIDIA GPU | ONNX Runtime + TensorRT, 또는 TensorRT 직접 사용 |
| 라즈베리파이 / ARM 보드 | NCNN 또는 TFLite (실기기에서 직접 비교 권장) |
| 안드로이드 앱 | TFLite (LiteRT), 또는 NCNN |
| iOS 앱 | CoreML (이번 비교에는 없음), 또는 NCNN |
| Coral Edge TPU / MCU | TFLite (INT8 필수) |

### 결론

이번 결과는 x86 노트북 CPU에서 잰 것이라 ONNX Runtime과 OpenVINO가 유리했다. 라즈베리파이처럼 ARM 기기에 배포하는 게 목표라면 NCNN과 TFLite가 더 빠를 수 있으니, 실제 기기에서 다시 재 봐야 한다. 기존 Docker arm64 환경은 에뮬레이션이라 속도 비교에는 맞지 않는다.
