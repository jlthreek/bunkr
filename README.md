# yangjae3dmap

3D 맵 위에서 소형 드론·풍선 침투를 가정하고, 스캐너·재머·대응책의 **최적 배치를 시뮬레이션**하는 Gray-zone C-UAS COP.
(D4D 해커톤 · TEAM AEGIS · Track 1 #3)

CesiumJS 3D 지구본 위에 실제 건물(Cesium OSM Buildings) + Stadia Alidade 베이스맵을 깔고,
위협체(드론/풍선/조류)를 실시간 비행 시뮬레이션하며, 배치 알고리즘용 데이터를 SQLite에서 파생한다.

## 스택
- **프론트**: Vite + TypeScript + CesiumJS (3D 지구본, 3D 건물, 지형)
- **베이스맵**: Stadia Maps Alidade Smooth Dark (localhost keyless / 배포 시 API 키 필요)
- **데이터 파이프라인**: OSM(Overpass) → SQLite(better-sqlite3) → GeoJSON(WGS84 + EPSG:5179), proj4 재투영

## 실행
```bash
# Node 18+ 필요 (권장 20)
npm install
cp .env.example .env      # Cesium Ion 토큰 입력 (무료: https://ion.cesium.com/tokens)
npm run dev               # http://localhost:5174
```

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
