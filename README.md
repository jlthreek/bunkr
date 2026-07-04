# yangjae3dmap

3D 맵 위에서 소형 드론·풍선 침투를 가정하고, 스캐너·재머·대응책의 **최적 배치를 시뮬레이션**하는 Gray-zone C-UAS COP.
(D4D 해커톤 · TEAM AEGIS · Track 1 #3)

CesiumJS 3D 지구본 위에 실제 건물(Cesium OSM Buildings) + Cesium Ion 위성 베이스맵을 깔고,
위협체(드론/풍선/조류)를 실시간 비행 시뮬레이션하며, 배치 알고리즘용 데이터를 SQLite에서 파생한다.

## 스택
- **프론트**: Vite + TypeScript + CesiumJS (3D 지구본, 3D 건물, 지형)
- **베이스맵**: Cesium Ion 위성(기본) + 다크/라이트/지형 등 키리스 대체 테마(피커 전환)
- **데이터 파이프라인**: OSM(Overpass) → SQLite(better-sqlite3) → GeoJSON(WGS84 + EPSG:5179), proj4 재투영

## 실행
```bash
# Node 18+ 필요 (권장 20 — nvm use 로 전환, .nvmrc 포함)
npm install
cp .env.example .env      # Cesium Ion 토큰 + (선택)Anthropic 키 입력
npm run dev               # http://localhost:5174
```

## AI 결심지원 (DSO 패널)
우하단 **결심지원 AI** 패널 — 지휘관이 자유 질의하면 실시간 COP 스냅샷(트랙별
분류·위협도·대응권고·거리, 배치 자산, 인구밀집도, THREAT CONDITION)을 근거로
탐지→식별→위협평가→대응 결심을 보좌한다. (Anthropic **Claude Haiku** 스트리밍)
- 키(`ANTHROPIC_API_KEY`)는 `VITE_` 접두사 없이 `.env` 에 저장 → **dev/preview 서버(Node)
  프로세스에만 로드**, 클라이언트 번들·브라우저로 노출되지 않음. 요청은 `/api/llm/chat`
  프록시(`vite.config.ts` 미들웨어 → `server/llm.ts`)를 경유.
- 키 미설정 시 지도·시뮬레이션은 정상, AI 패널만 안내 메시지 표시.
- 시스템 프롬프트/컨텍스트 로직: `src/llm/{prompt,context,panel}.ts`.

## 데이터 파이프라인
canonical store는 위치별 SQLite(`data/<loc>.sqlite`), 산출물은 위치별 네임스페이스.
```bash
npm run data:gwanghwamun  # 광화문 AO: OSM 백필 → 구역 seed → GeoJSON export
npm run data:yangjae      # 양재역 AO
```
산출물:
- `public/data/<loc>/*.geojson` — WGS84, Cesium 렌더용
- `export/epsg5179/<loc>/*.geojson` — EPSG:5179 미터, **배치 알고리즘팀 전달 계약**
  (`area_boundary` · `priority_zones` · `buildings` · `install_sites`)

## 기준 위치
`locations.json`으로 구동 (기본 = 광화문). 새 위치 추가 시 항목 등록 → `seed-zones.mjs`에 구역 정의 →
`LOCATION=<id> npm run data:all`. 프론트 좌상단 스위처에 자동 등록.

## 주요 기능
- **축척 연동 전술 그리드** + 그래픽 스케일바 (줌 따라 100m~1km 자동 스냅)
- **데이터 레이어** — 우선구역(보호/접근/민감·weight), 설치 후보지(옥상 높이), AO 경계
- **위협 시뮬** — 4종 위협체(쿼드/고정익/풍선/조류) 실시간 비행(웨이포인트 조향·바람 표류·위협도 상승),
  트랙 트레일·리더선·텔레메트리, 섞어쏘기(포화공격) 버스트, 실시간 트랙 테이블

## 좌표계
- 렌더: WGS84(경위도)
- 배치 알고리즘 계약: **EPSG:5179** (Korea 2000 / Unified CS, 미터)
