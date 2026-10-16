# Edge SBC 선정 및 컨테이너 구조 보고서

- 작성자: 박민성
- 작성일: 2026-10-16
- 대상 제품: AI 기반 작업장 안전관리 시스템 (PRD v1.0)

---

## 1. 요약

Edge AI 장비는 **NVIDIA Jetson Orin Nano Super 8GB**를 그대로 유지한다. 장비 1대가 RGB 1080p 3채널과 열화상 1채널을 받아 YOLOE·Pose·ByteTrack을 동시에 돌리고 2초 이내에 판단해야 한다. 이 조건에서 하드웨어 영상 디코딩, TensorRT FP16 추론, 기존 PyTorch → ONNX → TensorRT 흐름을 모두 만족하는 SBC는 Jetson이 유일하다.

Jetson 안의 소프트웨어는 **"죽어도 되는 것"과 "절대 죽으면 안 되는 것"을 기준으로 5개 컨테이너로 나눈다.** AI 추론이 메모리 부족으로 죽어도 열화상 임계값 감시와 경보 경로는 계속 동작한다. Jetson 전체가 멈추면 컨테이너 밖의 ESP32가 하트비트 끊김을 감지해 경광등으로 알린다.

---

## 2. 용어 정리

| 용어 | 뜻 | 이 프로젝트에서 |
|---|---|---|
| SBC (Single Board Computer) | 보드 한 장에 CPU·메모리·입출력이 모두 있는 컴퓨터 | Jetson Orin Nano Developer Kit, Raspberry Pi 5 |
| SoC (System on Chip) | CPU·GPU·NPU를 칩 하나에 모은 것 | Jetson의 Orin 칩 |
| SoM (System on Module) | SoC와 메모리를 모듈로 만든 것. 캐리어 보드에 꽂아 씀 | Jetson Orin Nano 모듈. 개발 키트는 SoM + 캐리어 보드 |

---

## 3. 대상 하드웨어

컨테이너는 **Jetson Orin Nano Super 8GB**(SBC) 위에서 돌고, 경보 출력은 컨테이너 밖의 **ESP32**(MCU)가 맡는다. 두 부품을 고른 이유와 후보 비교는 `SBC_MCU_부품_선정_보고서.md`에 정리했다.

| 구분 | 부품 | 이 보고서에서의 역할 |
|---|---|---|
| SBC | Jetson Orin Nano Super 8GB | 컨테이너 5개를 실행하는 호스트 |
| MCU | ESP32-DevKitC | 경보 명령 수신, 릴레이 구동, Jetson 하트비트 감시 (마지막 안전장치) |

---

## 4. 컨테이너 구조

### 4.1 설계 원칙

1. **죽어도 되는 것과 죽으면 안 되는 것을 분리한다.** 무겁고 불안정한 AI 추론과 경보 경로를 다른 컨테이너에 둔다.
2. **영상은 브로커에 올리지 않는다.** 1080p 4채널을 MQTT로 보내면 Jetson이 감당하지 못한다. 영상 수신부터 추론까지는 한 컨테이너 안에서 처리하고, 브로커에는 검출 결과(JSON)만 올린다.
3. **privileged 권한을 쓰지 않는다.** 카메라가 PoE IP 카메라(RTSP)라서 장치 권한 없이 네트워크로만 받는다. 열어야 할 장치는 ESP32 예비 연결용 UART(`--device /dev/ttyUSB0`) 하나뿐이다.
4. **AI 없이 도는 안전망을 둔다.** 열화상 온도 임계값 감시는 규칙만으로 가능하므로 AI와 따로 돌린다.

### 4.2 구성도 (Jetson 1대 기준: RGB 3대, 열화상 1대)

```
┌──────────────── Jetson Orin Nano (JetPack + Docker + NVIDIA Container Runtime) ────────────────┐
│ [HW] GPU(TensorRT) · NVMe · GbE(PoE 카메라 RTSP) · USB-UART(ESP32 예비)                      │
│                                                                                                 │
│ ① vision-ai                                   💥 "죽어도 되는" 구역                            │
│   RTSP 수신 → 전처리 → YOLOE·Pose·ByteTrack     unprivileged · runtime: nvidia                  │
│   (TensorRT FP16)                               mem_limit (8GB를 CPU·GPU가 공유)                │
│   pub: detect/fall, detect/object, hb/vision    restart: on-failure                             │
│                                                                                                 │
│ ② thermal-guard                               🛟 AI 없이 도는 안전망                           │
│   FLIR A50 Modbus TCP 온도 → 절대 임계값 규칙   unprivileged · 매우 가벼움                     │
│   pub: detect/thermal                           restart: always                                 │
│                                                                                                 │
│ ③ broker (Mosquitto MQTT)                     🧱 시스템의 척추                                  │
│   현장 내부망 전용, 외부 포트 노출 안 함        unprivileged · restart: always                  │
│                                                                                                 │
│ ④ risk-alarm                                  🔒 "절대 죽으면 안 됨" 구역                      │
│   sub: detect/*  →  Level 0~4 판단(여러 프레임 누적)   --device /dev/ttyUSB0 (privileged 아님)  │
│   pub: alarm/cmd, hb/edge  (+ UART 예비 송신)          restart: always · CPU 코어 예약          │
│   hb/vision 끊김 → "시스템 이상" 황색 경보                                                     │
│                                                                                                 │
│ ⑤ uplink                                      💥 "죽어도 되는" 구역                            │
│   이벤트 → FastAPI, 클립 → NAS                  오프라인 시 NVMe에 쌓았다가 재전송              │
│   (Web Push·SMS 출발점)                         restart: unless-stopped                         │
└────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                             │ MQTT (Wi-Fi) / UART 예비
                         ESP32 ── 마지막 안전장치 (컨테이너 밖, 하드웨어 워치독)
                           hb/edge가 N초 동안 안 오면 황색등 → 릴레이 → PATLITE LR6
```

### 4.3 컨테이너별 역할

| 컨테이너 | 역할 | 권한 | 재시작 정책 | 구분 |
|---|---|---|---|---|
| ① vision-ai | RTSP 수신, 전처리, 낙상·위험물 검출, 추적 | unprivileged, GPU runtime, mem_limit | on-failure | 죽어도 됨 |
| ② thermal-guard | 열화상 온도 읽기, 절대 임계값 판단 | unprivileged | always | 안전망 |
| ③ broker | 컨테이너 간, Jetson ↔ ESP32 메시지 전달 | unprivileged | always | 척추 |
| ④ risk-alarm | 위험 Level 판단, 경보 명령, 하트비트, AI 생존 감시 | UART 장치 1개만 | always | 죽으면 안 됨 |
| ⑤ uplink | 서버·NAS 전송, 오프라인 버퍼 | unprivileged | unless-stopped | 죽어도 됨 |

### 4.4 MQTT 토픽

| 토픽 | 보내는 쪽 | 받는 쪽 | 내용 |
|---|---|---|---|
| `detect/fall`, `detect/object` | ① | ④ | 검출 종류, 카메라 ID, 신뢰도, 위치 |
| `detect/thermal` | ② | ④ | 최고 온도, 상승률, 구역 |
| `hb/vision` | ① | ④ | AI 생존 신호 |
| `alarm/cmd` | ④ | ESP32 | 위험 Level, 장치 ID |
| `hb/edge` | ④ | ESP32 | Jetson 경보 경로 생존 신호 |
| `event/*` | ④ | ⑤ | 확정된 이벤트(서버 전송용) |

---

## 5. 고장 시나리오

| 멈춘 것 | 결과 |
|---|---|
| ① vision-ai (메모리 부족 등) | 낙상·위험물 감지가 잠시 중단된다. ② 열화상 감시는 계속되고, ④가 `hb/vision` 끊김을 보고 황색등으로 이상을 알린다. ①은 자동 재시작된다. |
| ⑤ uplink 또는 인터넷 | 현장 경보는 그대로 동작한다. 이벤트는 NVMe에 쌓였다가 연결 복구 후 전송된다. |
| ③ broker | ④가 UART 예비 경로로 ESP32에 직접 명령을 보낸다. |
| Jetson 전체 | ESP32가 `hb/edge` 끊김을 감지해 황색등을 켠다. |

이 구조 덕분에 홈페이지의 "서버나 인터넷이 멈춰도 경보는 울립니다"라는 주장이 소프트웨어 수준에서도 성립한다.

---

## 6. 참고 예시와의 차이

참고한 예시(Raspberry Pi 5 + Docker, 로봇 제어)와 구조 원칙은 같지만 다음이 다르다.

| 항목 | 예시 | 본 제품 |
|---|---|---|
| 호스트 | Raspberry Pi 5 | Jetson Orin Nano |
| 절대 죽으면 안 되는 구역 | 모터 제어·E-Stop | 위험 판단·경보 경로 |
| 센서 수집 | 장치 직접 접근, privileged | IP 카메라 RTSP, privileged 불필요 |
| 센서 데이터 전달 | 브로커로 카메라 데이터 발행 | 영상은 컨테이너 내부 처리, 결과만 발행 |
| 추가 안전망 | - | 열화상 규칙 감시(②), ESP32 하드웨어 워치독 |

---

## 7. 남은 확인 사항

- [ ] Jetson 실기기에서 4채널 동시 디코딩 + 3모델 추론 FPS·지연시간 측정
- [ ] ① vision-ai의 적정 `mem_limit` 값 측정 (8GB 공유 메모리 기준)
- [ ] ESP32 하트비트 타임아웃(N초) 결정
- [ ] FLIR A50 Modbus TCP 온도 레지스터 확인
