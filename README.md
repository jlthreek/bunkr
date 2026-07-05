# bunkr

3D 맵 위에서 소형 드론·풍선 침투를 가정하고, **탐지→식별→위협평가→대응 결심**의 Gray-zone
C-UAS 킬체인을 시연하며, 스캐너·재머·요격체의 **최적 배치를 시뮬레이션**하는 통합상황도(COP).
(D4D 해커톤 · TEAM AEGIS · Track 1 #3)

CesiumJS 3D 지구본 위에 실제 건물(Cesium OSM Buildings) + 위성 베이스맵을 깔고, 위협체(드론/
풍선/조류)를 실시간 비행 시뮬레이션한다. 논문 근거 기반 C-UAS 의사결정 엔진으로 각 트랙을
분류·위협평가하고, 방어자산 배치 최적화 알고리즘으로 저위험 대응을 결심 지원한다.

## 두 가지 모드
- **설계(DEPLOY)** — AO(관심구역)에 레이더·스캐너·재머·요격체를 배치. 최적화 알고리즘이
  후보 설치지·우선구역·건물 가림(LOS)을 고려해 배치안을 제안. 구성은 이름 붙여 저장(플랜).
- **작전(OPERATE)** — 저장한 플랜의 센서망으로 실시간 침투 시나리오를 방어. 융합탐지→분류→
  위협평가→대응권고를 트랙별로 전시하고, 우하단 AI가 결심을 보좌.

## 스택
- **프론트**: Vite + TypeScript + CesiumJS (3D 지구본·건물·지형), i18n(ko/en)
- **베이스맵**: Cesium Ion 위성(기본) + 다크/라이트/지형 등 키리스 대체 테마(피커 전환)
- **C-UAS 엔진 / 최적화**: 순수 TS 포팅 (아래 참조), 브라우저 내 실행
- **AI 결심지원**: Anthropic Claude Haiku (서버측 프록시)
- **데이터 파이프라인**: OSM(Overpass) → SQLite(better-sqlite3) → GeoJSON(WGS84 + EPSG:5179), proj4 재투영
- **배포**: Docker(nginx 정적 서빙) + GitHub Actions (dev/stg/prod)

## 실행
```bash
# Node 20 권장 (.nvmrc 포함 — nvm use). Node 18+ 필요.
npm install
cp .env.example .env      # Cesium Ion 토큰 + (선택)Anthropic 키 입력
npm run dev               # http://localhost:5174
```
빌드/미리보기: `npm run build` → `npm run preview`.

## 소스 구조 (`src/`)
```
main.ts          엔트리 — Cesium Viewer, 모드 전환, UI 배선
assets.ts        방어자산 스펙(레이더/스캐너/재머/요격) + 배치 엔티티
layers.ts        데이터 레이어(우선구역·설치지·AO 경계) GeoJSON 렌더
grid.ts          축척 연동 전술 그리드 + 스케일바
plans.ts         배치 플랜 저장/로드(localStorage)
i18n.ts          한/영 다국어
sim/             위협체 비행 시뮬(드론/풍선/조류), 아이콘
cuas/            C-UAS 의사결정 엔진 (융합탐지→분류→위협평가→대응결심)
optim/           방어자산 배치 최적화 (greedy + local search)
llm/             AI 결심지원(DSO) 패널 · 프롬프트 · COP 컨텍스트
ops/             이벤트 로그
```

### C-UAS 의사결정 엔진 (`src/cuas/`)
`cuas/*.py` 참조구현을 순수 TS로 이식. **임계값은 논문 근거가 있어 값 변경 금지.**
- `pipeline.ts` — ①융합탐지(SNR 게이트 + RF·레이더 시공간 연관) → ②오탐저감 → ③분류 →
  ④위협평가 → ⑤대응결심의 트랙 단위 파이프라인.
- `engine.ts` — AHP 위협 가중치(근접/의도/능력/NFZ, CR=0.004), RCS·속도·풍향 게이트,
  Effect-based 대응권고. 근거: Sensors 19(22) 5048, Drones 7(1) 39, AHP(ISAHP2014).
- 그 외: `profiles.ts`(위협체 프로파일) · `pathfinding.ts` · `observation.ts` · `rng.ts`.

### 배치 최적화 (`src/optim/`)
플러그형 옵티마이저 레지스트리(`index.ts`, 기본 `greedy`). 알고리즘팀 구현이 나오면
`OPTIMIZERS`에 등록만 하면 교체됨.
- `cuas/algorithm.ts` — `placement_algorithm.py` 충실 포팅: 후보생성 → 점수 사전계산 →
  요구조건 검사 → greedy + local search.
- `cuas/{scoring,geometry,equipment,render}.ts` — LOS·셀 그리드·장비 스펙·전시.

## AI 결심지원 (DSO 패널)
우하단 **결심지원 AI** 패널 — 지휘관이 자유 질의하면 실시간 COP 스냅샷(트랙별 분류·위협도·
대응권고·거리, 배치 자산, 인구밀집도, THREAT CONDITION)을 근거로 탐지→식별→위협평가→대응
결심을 보좌한다. (Claude Haiku 스트리밍)
- 키(`ANTHROPIC_API_KEY`)는 `VITE_` 접두사 **없이** `.env`에 저장 → dev/preview 서버(Node)
  프로세스에만 로드, 클라이언트 번들·브라우저로 노출되지 않음. 요청은 `/api/llm/chat`
  프록시(`vite.config.ts` 미들웨어 → `server/llm.ts`)를 경유.
- 키 미설정 시 지도·시뮬레이션은 정상, AI 패널만 안내 메시지 표시.
- **주의**: 프록시는 vite dev/preview 전용. Docker 정적 이미지에는 AI 프록시가 없다(지도·시뮬만 배포).
- 시스템 프롬프트/컨텍스트 로직: `src/llm/{prompt,context,panel}.ts`.

## 데이터 파이프라인
canonical store는 위치별 SQLite(`data/<loc>.sqlite`), 산출물은 위치별 네임스페이스.
```bash
npm run data:gwanghwamun  # 광화문 AO: OSM 백필 → 구역 seed → GeoJSON export
npm run data:yangjae      # 양재역 AO
# 개별 단계: data:backfill / data:zones / data:export (data:all = 전체)
```
산출물:
- `public/data/<loc>/*.geojson` — WGS84, Cesium 렌더용
- `export/epsg5179/<loc>/*.geojson` — EPSG:5179 미터, **배치 알고리즘팀 전달 계약**
  (`area_boundary` · `priority_zones` · `buildings` · `install_sites`)

## 기준 위치
`locations.json`으로 구동 (기본 = 광화문). 새 위치 추가 시 항목 등록 → `scripts/seed-zones.mjs`에
구역 정의 → `LOCATION=<id> npm run data:all`. 프론트 좌상단 스위처에 자동 등록.

## 주요 기능
- **설계/작전 모드 전환** + 배치 플랜 저장·로드
- **축척 연동 전술 그리드** + 그래픽 스케일바 (줌 따라 100m~1km 자동 스냅)
- **데이터 레이어** — 우선구역(보호/접근/민감·weight), 설치 후보지(옥상 높이), AO 경계
- **위협 시뮬** — 4종 위협체(쿼드/고정익/풍선/조류) 실시간 비행(웨이포인트 조향·바람 표류·위협도
  상승), 트랙 트레일·리더선·텔레메트리, 섞어쏘기(포화공격) 버스트, 실시간 트랙 테이블
- **C-UAS 킬체인** — 트랙별 융합탐지→분류→위협평가→대응권고, 근거 기반 임계값

## 좌표계
- 렌더: WGS84(경위도)
- 배치 알고리즘 계약: **EPSG:5179** (Korea 2000 / Unified CS, 미터)

## 배포 (bunkr)
정적 프론트 단일 서비스(백엔드/DB 없음). Docker 이미지는 Vite 빌드 → nginx 서빙.

| 환경 | 트리거 | 배포 브랜치 | 서버 디렉토리 |
| --- | --- | --- | --- |
| prod | `main` push (자동) | `main` | `bunkr-prod` |
| stg  | `develop` push (자동) | `develop` | `bunkr-stg` |
| dev  | Actions `deploy-dev` 수동(브랜치 선택) | 선택 | `bunkr-dev` |

- **CI**(`.github/workflows/ci.yml`): PR·`main`/`develop` push 시 프론트 빌드 검증.
- **배포**: SSH → `cd /home/raccoon/deploy/bunkr-{env}` → `git reset --hard origin/{branch}` →
  `docker compose --env-file .env -f compose/docker-compose.yml up -d --build`.
- **빌드타임 시크릿**: `VITE_CESIUM_ION_TOKEN`(공개 토큰, 번들 포함). GitHub Secrets +
  서버 `.env`(`ENV_NAME`, 토큰)로 주입. `.env`는 **커밋 금지**.
- nginx-ui 리버스 프록시가 `nginx-proxy` 도커 네트워크에서 컨테이너 이름(`bunkr-{env}-web`)으로
  443 종단.

## 참고 문서
- `DESIGN.md` — 콘솔 테마·UI 설계
- `pitchdeck.html` — 발표 자료
