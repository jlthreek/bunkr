---
version: alpha
name: D4D BUNKR C-UAS Ops Console
description: D4D/BUNKR 군사 전략 시뮬레이터와 C-UAS 작전 대시보드를 위한 DESIGN.md. Google Labs design.md 형식을 따라 YAML front matter에는 기계가 읽는 토큰을, Markdown 본문에는 사람이 읽는 디자인 의도와 구현 규칙을 기록한다.
references:
  design-md-spec: "https://github.com/google-labs-code/design.md"
  implementation-entry: "index.html"
  token-css: "src/style.css"
colors:
  primary: "#88F298"
  on-primary: "#0A1F0E"
  secondary: "#D9B54A"
  tertiary: "#E0574A"
  neutral: "#080808"
  bg: "#080808"
  surface: "#212121"
  surface-2: "#363636"
  surface-map: "#0F0F0F"
  line: "rgba(255, 255, 255, 0.06)"
  line-strong: "rgba(255, 255, 255, 0.12)"
  text-primary: "#FFFFFF"
  text-secondary: "rgba(255, 255, 255, 0.55)"
  text-muted: "rgba(255, 255, 255, 0.32)"
  green-primary: "#88F298"
  green-secondary: "#8AFAA2"
  gold-caution: "#D9B54A"
  red-hostile: "#E0574A"
  active-selection-text: "#0A1F0E"
  engagement-scrim: "rgba(10, 10, 10, 0.92)"
  alert-strip-bg: "rgba(224, 87, 74, 0.12)"
  alert-strip-line: "rgba(224, 87, 74, 0.35)"
  map-tag-bg: "rgba(15, 15, 15, 0.88)"
  map-glass-bg: "rgba(8, 8, 8, 0.74)"
  map-glass-bg-strong: "rgba(15, 15, 15, 0.88)"
  terrain-01: "#5C521F"
  terrain-02: "#8A7729"
  terrain-03: "#B89A35"
  terrain-04: "#D9BC52"
  terrain-05: "#F0DC7A"
typography:
  display-xl:
    fontFamily: "D-DIN-Bold, Arial Narrow, Pretendard Variable, sans-serif"
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: 0.03em
    textTransform: uppercase
  display-lg:
    fontFamily: "D-DIN-Bold, Arial Narrow, Pretendard Variable, sans-serif"
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0.06em
    textTransform: uppercase
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0em
    fontFeature: "'tnum'"
  data-sm:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0em
    fontFeature: "'tnum'"
  data-md:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0em
    fontFeature: "'tnum'"
  data-lg:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0em
    fontFeature: "'tnum'"
  micro-label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: 10.5px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.1em
    textTransform: uppercase
    fontFeature: "'tnum'"
  button-cap:
    fontFamily: "D-DIN, Pretendard Variable, sans-serif"
    fontSize: 10.5px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.08em
    textTransform: uppercase
rounded:
  none: 0px
  xs: 6px
  sm: 9px
  md: 14px
  lg: 16px
  pill: 32px
  full: 9999px
spacing:
  xxs: 4px
  xs: 6px
  sm: 8px
  md: 12px
  lg: 14px
  xl: 20px
  xxl: 28px
  header-height: 60px
  logo-tile-size: 34px
  icon-well-size: 30px
  gauge-ring-size: 128px
  form-control-height: 44px
  map-preview-height: 360px
  context-rail-width: 250px
  gauge-rail-width: 236px
  stat-strip-width: 620px
motion:
  feedback: 120ms
  content: 180ms
  modal: 220ms
  easing: "cubic-bezier(0.2, 0, 0, 1)"
  reduced-motion-duration: 0ms
effects:
  map-glass-blur: 14px
  map-glass-shadow-color: "rgba(0, 0, 0, 0.36)"
  map-glass-shadow-y: 18px
  map-glass-shadow-spread: 44px
components:
  app-canvas:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.text-primary}"
  map-canvas:
    backgroundColor: "{colors.surface-map}"
    textColor: "{colors.text-secondary}"
  map-glass-panel:
    backgroundColor: "{colors.map-glass-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xs}"
    padding: "{spacing.lg}"
  map-glass-panel-strong:
    backgroundColor: "{colors.map-glass-bg-strong}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xs}"
    padding: "{spacing.lg}"
  candidate-dot:
    backgroundColor: "{colors.text-secondary}"
    size: "{spacing.sm}"
    rounded: "{rounded.full}"
  hairline-divider:
    backgroundColor: "{colors.line}"
    height: 1px
  strong-divider:
    backgroundColor: "{colors.line-strong}"
    height: 1px
  terrain-dot-01:
    backgroundColor: "{colors.terrain-01}"
    size: "{spacing.xs}"
    rounded: "{rounded.full}"
  terrain-dot-02:
    backgroundColor: "{colors.terrain-02}"
    size: "{spacing.xs}"
    rounded: "{rounded.full}"
  terrain-dot-03:
    backgroundColor: "{colors.terrain-03}"
    size: "{spacing.xs}"
    rounded: "{rounded.full}"
  terrain-dot-04:
    backgroundColor: "{colors.terrain-04}"
    size: "{spacing.xs}"
    rounded: "{rounded.full}"
  terrain-dot-05:
    backgroundColor: "{colors.terrain-05}"
    size: "{spacing.xs}"
    rounded: "{rounded.full}"
  status-friendly:
    backgroundColor: "{colors.green-primary}"
    textColor: "{colors.active-selection-text}"
    rounded: "{rounded.full}"
    size: "{spacing.xs}"
  status-friendly-secondary:
    backgroundColor: "{colors.green-secondary}"
    textColor: "{colors.active-selection-text}"
    rounded: "{rounded.full}"
    size: "{spacing.xs}"
  status-caution:
    backgroundColor: "{colors.gold-caution}"
    textColor: "{colors.bg}"
    rounded: "{rounded.full}"
    size: "{spacing.xs}"
  status-hostile:
    backgroundColor: "{colors.red-hostile}"
    textColor: "{colors.bg}"
    rounded: "{rounded.full}"
    size: "{spacing.xs}"
  header-bar:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button-cap}"
    height: "{spacing.header-height}"
    padding: "0 {spacing.xl}"
  header-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.micro-label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.md}"
  logo-tile:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    typography: "{typography.micro-label}"
    rounded: "{rounded.xs}"
    size: "{spacing.logo-tile-size}"
  glass-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
  cta-pill:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.pill}"
    padding: "{spacing.lg} {spacing.xxl}"
  cta-pill-hover:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
  cta-pill-danger:
    backgroundColor: "transparent"
    textColor: "{colors.red-hostile}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.pill}"
    padding: "{spacing.lg} {spacing.xxl}"
  cta-pill-danger-hover:
    backgroundColor: "{colors.red-hostile}"
    textColor: "{colors.bg}"
  segmented-view-btn:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md} {spacing.lg}"
  segmented-view-btn-active:
    backgroundColor: "{colors.green-primary}"
    textColor: "{colors.active-selection-text}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md} {spacing.lg}"
  gauge-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    padding: "{spacing.xl}"
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg} {spacing.xl}"
  track-row-hostile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.data-sm}"
    padding: "{spacing.md} {spacing.xl}"
  track-row-caution:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.data-sm}"
    padding: "{spacing.md} {spacing.xl}"
  track-row-friendly:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.data-sm}"
    padding: "{spacing.md} {spacing.xl}"
  map-tag:
    backgroundColor: "{colors.map-tag-bg}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.micro-label}"
    rounded: "{rounded.xs}"
    padding: "{spacing.xs} {spacing.sm}"
  event-log-line:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body}"
    padding: "{spacing.sm} {spacing.xl}"
  sparkline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
  engagement-modal:
    backgroundColor: "{colors.engagement-scrim}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    padding: "{spacing.xxl}"
  alert-strip:
    backgroundColor: "{colors.alert-strip-bg}"
    typography: "{typography.body}"
    padding: "{spacing.md} {spacing.xxl}"
  alert-strip-message:
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
  alert-strip-marker:
    backgroundColor: "{colors.red-hostile}"
    textColor: "{colors.bg}"
    rounded: "{rounded.full}"
    size: "{spacing.sm}"
  alert-strip-divider:
    backgroundColor: "{colors.alert-strip-line}"
    height: 1px
  text-input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "{spacing.form-control-height}"
    padding: "0 {spacing.md}"
  select:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "{spacing.form-control-height}"
    padding: "0 {spacing.md}"
---

# D4D BUNKR C-UAS Ops Console DESIGN.md

이 문서는 D4D/BUNKR 군사 전략 시뮬레이터, C-UAS 작전 대시보드, `/styleguide` 페이지, 그리고 이후 구현될 COP/교전/센서/이벤트 화면이 공유해야 할 디자인 시스템의 단일 기준이다. 형식은 Google Labs `design.md` 레포의 철학을 따른다. 위 YAML front matter는 기계가 읽는 토큰이고, 아래 Markdown 본문은 사람이 읽는 맥락과 판단 기준이다.

> **구현 매핑 주의.** 이 저장소는 아직 React/Tailwind 프런트엔드가 아니라 Cesium 기반 vanilla TypeScript + Vite 앱이다. 따라서 canonical `design.md` 예시의 `frontend/src/...` 경로 대신, 실제 토큰과 크롬은 [`index.html`](index.html)의 DOM과 [`src/style.css`](src/style.css)의 CSS custom property로 구현한다. 지도 엔티티(구역·후보지·자산·위협)의 색은 [`src/layers.ts`](src/layers.ts), [`src/assets.ts`](src/assets.ts), [`src/sim/drones.ts`](src/sim/drones.ts), [`src/main.ts`](src/main.ts), [`src/optim/cuas/render.ts`](src/optim/cuas/render.ts)에서 이 문서의 semantic palette를 참조한다.

핵심 원칙은 간단하다. 이 인터페이스는 마케팅 사이트가 아니라 작전실 콘솔이다. 예쁘게 꾸민 어두운 SaaS가 아니라, 실시간 위협 분류와 교전 판단을 흔들림 없이 전달하는 도구다. 정보 밀도는 높고, 장식은 적고, 색은 의미가 있을 때만 등장해야 한다. 사용자가 한눈에 "지금 위험한가, 어느 트랙인가, 무엇을 해야 하는가"를 판단할 수 있어야 한다.

## Overview

D4D/BUNKR 디자인 언어는 **중립 검정 작전 콘솔**이다. 화면의 기본 인상은 군사 작전실의 벽면 디스플레이와 항공/레이더 HUD의 중간에 있다. 단, 영화적 과장이나 게임 UI처럼 번쩍이는 장식은 금지한다. 이 시스템은 "멋있어 보이는 전술 UI"가 아니라 "오퍼레이터가 실시간으로 결정을 내릴 수 있는 밀도 높은 계기판"이어야 한다.

디자인의 기준점은 다음 세 가지다.

1. **작전 신뢰성**
   모든 시각 요소는 조작과 판단을 돕기 위해 존재한다. 색, 테두리, 타이포그래피, 모션은 "상태와 우선순위"를 설명해야 한다. 장식적인 강조는 오퍼레이터의 신뢰를 약하게 만든다.

2. **중립 표면 위의 의미색**
   배경과 카드, 섹션, 표면은 순수 무채색만 사용한다. `#080808`, `#212121`, `#363636`, `#0F0F0F`가 표면 계층의 전부다. 초록, 금색, 빨강은 친/주의/적대 상태에만 등장한다. 상태색이 장식색으로 새면 시스템 전체가 무너진다.

3. **숫자 안정성**
   좌표, 거리, 시각, 트랙 ID, 위협도, 고도, 속도처럼 실시간으로 변할 수 있는 모든 값은 IBM Plex Mono와 `tabular-nums`로 렌더링한다. 숫자가 갱신될 때 폭이 흔들리면 콘솔은 장난감처럼 보인다.

이 시스템의 첫 화면은 항상 "실제 도구"여야 한다. 랜딩 페이지, 히어로 카피, 추상 그래픽보다 작전 정보가 우선이다. 데모/스타일가이드 화면 역시 실제값 형식(`T-041`, `RNG 1.2KM`, `37.5665N`, `21:47:03Z`)을 사용해야 하며, lorem ipsum이나 빈 장식 카드로 채우면 안 된다.

### Product Personality / 제품 성격

- **Tactical / 전술적**: 화면은 빠른 판단을 위한 장비처럼 보여야 한다.
- **Dense / 밀도 있음**: 공백은 존재하지만 마케팅식 여백이 아니라 판독을 위한 구획이다.
- **Neutral / 무채색 중심**: 표면 자체는 감정을 드러내지 않는다. 위험은 데이터와 상태색이 말한다.
- **Mechanical / 기계적**: 모션과 상태 전환은 짧고 절제된다. 튀거나 부드럽게 흐르는 느낌이 아니라 스위치처럼 명확해야 한다.
- **Trustworthy / 신뢰 가능**: 색상 의미, 숫자 폭, 간격, 라벨 위치가 일관적이어야 한다.

### Target Users / 대상 사용자

- C-UAS 작전 담당자
- 해커톤 데모 심사위원
- 전략 시뮬레이터를 관찰하는 기술 평가자
- 실시간 센서 데이터, 트랙 분류, 교전 판단 흐름을 빠르게 이해해야 하는 팀원

이 사용자는 브랜드 감성을 감상하려는 사람이 아니다. "현재 어떤 위협이 있고, 대응 판단이 어떻게 내려지는가"를 보려는 사람이다. 따라서 UI는 설명적인 문장보다 작전 데이터와 상태 변화를 더 많이 보여줘야 한다.

## Colors

색상 시스템은 매우 엄격하다. D4D/BUNKR에서 색은 장식이 아니라 작전 의미다.

### Surface Palette / 표면 팔레트

- **Bg `{colors.bg}` `#080808`**
  앱 전체 캔버스다. 거의 검정에 가까운 순수 무채색이다. 네이비, 올리브, 청록, 갈색, 따뜻한 회색으로 기울면 안 된다.

- **Surface `{colors.surface}` `#212121`**
  섹션, 데이터 패널, 카드, 리스트 행의 기본 표면이다. 섹션 outer border와 rounded rectangle 없이 이 색의 덩어리와 간격만으로 구획이 잡혀야 한다.

- **Surface 2 `{colors.surface-2}` `#363636`**
  표면 안쪽의 보조 레벨이다. 아이콘 well, 입력 필드, key-value block, 내부 컨트롤 배경에 사용한다. `surface`보다 한 단계 밝지만 여전히 순수 무채색이다.

- **Surface Map `{colors.surface-map}` `#0F0F0F`**
  COP 지도, 레이더, RF 맵, terrain preview 같은 캔버스성 영역에 사용한다. 앱 배경보다 약간 밝아 실제 데이터가 놓일 공간을 만든다.

- **Line `{colors.line}`**
  기본 hairline이다. 컴포넌트 내부 구분선, 리스트 row 구분, 입력 field border에 사용한다. 큰 섹션 전체를 감싸는 장식 border로 남발하지 않는다.

- **Line Strong `{colors.line-strong}`**
  hover, focus, map tag, CTA 외곽선처럼 더 높은 판독성이 필요한 구획에만 사용한다.

### Semantic Palette / 상태 팔레트

상태색은 세 가지다.

- **Friendly / Normal `{colors.green-primary}` `#88F298`**
  정상, 우군, 안전, live 연결, active selected mode에 사용한다. 이 색은 밝고 명확하므로 조금만 사용해도 충분하다.

- **Friendly Secondary `{colors.green-secondary}` `#8AFAA2`**
  friendly 계열 그래프, 보조 ring, 미세한 normal 상태 강조에 사용한다. 새로운 의미를 만들기 위한 색이 아니라 같은 friendly 계열의 시각적 variation이다.

- **Caution `{colors.gold-caution}` `#D9B54A`**
  미확인, 주의, 센서 품질 저하, 판단 대기, RF confidence 중간 상태에 사용한다. 금색은 terrain ramp와 혼동될 수 있으므로 UI chrome에는 상태 의미가 있을 때만 사용한다.

- **Hostile `{colors.red-hostile}` `#E0574A`**
  적대 트랙, 교전 승인, alert strip, high-risk 위협도에만 사용한다. 순수 빨강보다 낮은 채도라 지속 노출에도 과도하게 자극적이지 않다.

### Terrain Ramp / 지도 전용 지형 램프

`terrain-01`부터 `terrain-05`까지의 금색 계열은 지도/terrain/heat visualization 전용이다. 이 램프는 UI 버튼, nav, 카드 강조, 아이콘 장식에 사용하지 않는다.

지도에서의 사용 원칙:

- `terrain-01`, `terrain-02`: 낮은 밀도, 낮은 강도 dot field
- `terrain-03`: 중간 밀도
- `terrain-04`, `terrain-05`: 고밀도 또는 위험 영역에 가까운 terrain emphasis
- 상태색 `gold-caution`과 혼동되지 않도록, terrain ramp는 데이터 시각화 영역 안에 갇혀 있어야 한다.

### 3D Map Glass Overlay Palette / 입체 지도 HUD 팔레트

3D 도시 지도 위에 직접 올라가는 HUD 패널은 예외적으로 tactical glass를 사용한다. 입체 건물, 도로명, 구역 polygon, 후보지 dot처럼 배경 정보량이 높은 화면에서는 완전 불투명 flat panel만으로는 지도 맥락이 끊기고, 완전 투명 text overlay는 판독성이 떨어진다. 이 저장소의 좌측 커맨드 레일이 바로 이 예외에 해당한다.

허용 토큰:

- **Map Glass Bg `{colors.map-glass-bg}`**
  3D 지도 위 floating HUD의 기본 반투명 표면이다. 색상은 neutral black 계열이며 일반 카드/섹션에는 사용하지 않는다.

- **Map Glass Bg Strong `{colors.map-glass-bg-strong}`**
  layer panel, threat table처럼 데이터 밀도가 높은 overlay에 사용한다.

- **Candidate Dot `{colors.text-secondary}`**
  설치 후보지, sensor candidate, non-threat point처럼 의미가 확정되지 않은 지도 객체 marker는 neutral text-secondary dot으로 표시한다.

제한:

- `map-glass-*`는 3D map overlay 밖에서 사용하지 않는다.
- `map-glass-panel`은 outer border를 만들지 않는다. 지도 위 패널도 기존 D4D 컴포넌트처럼 면과 여백으로 구획한다.
- cyan, blue, navy 계열 HUD chrome은 사용하지 않는다.
- 일반 flat console, stat card, form, modal에는 계속 neutral surface를 사용한다.
- glass overlay도 status color 의미 체계를 깨지 않는다. hostile/caution/friendly는 여전히 상태/구역 의미에만 쓴다.

### Text Palette / 텍스트 팔레트

- **Text Primary `{colors.text-primary}`**
  주요 수치, 제목, 현재 선택 항목에 사용한다.

- **Text Secondary `{colors.text-secondary}`**
  보조 라벨, 설명, secondary metadata에 사용한다.

- **Text Muted `{colors.text-muted}`**
  disabled, placeholder, 미선택 메타 정보에 사용한다.

### Color Rules / 색상 규칙

1. 배경과 카드에는 반드시 무채색만 사용한다.
2. 초록/금색/빨강은 상태를 의미할 때만 사용한다.
3. `primary`가 초록으로 정의되어 있어도, 마케팅식 primary accent로 남발하지 않는다.
4. active segmented button은 예외적으로 초록 fill을 사용할 수 있다. 이것은 장식이 아니라 오퍼레이터의 현재 선택 상태를 뜻한다.
5. alert strip의 빨강 tint는 unresolved hostile track이 있을 때만 나타난다.
6. 그래프와 sparkline은 색 자체가 의미를 갖게 한다. 별도 장식 legend를 만들기보다 bar/line의 색으로 neutral -> friendly -> caution -> hostile 스케일을 보여준다.
7. 파랑, 보라, cyan, orange 같은 추가 accent는 만들지 않는다.

## Typography

타이포그래피는 취향이 아니라 기능별로 나뉜다.

### Font Roles / 글꼴 역할

1. **D-DIN / D-DIN-Bold (fallback: Chakra Petch)**
   제목, 패널 heading, 버튼 cap, 작전 장비 같은 uppercase display에 사용한다. D-DIN은 항공/자동차/계기판 계열의 기술적 인상을 만든다. 저장소에 D-DIN이 설치되어 있지 않으면 유사 계열인 Chakra Petch로 우아하게 degrade한다.

2. **Pretendard Variable**
   한국어와 일반 문장, 설명 텍스트에 사용한다. 한국어를 억지로 all caps 처리하지 않는다. 한국어는 자연스러운 문장 형태가 더 빠르게 읽힌다.

3. **IBM Plex Mono**
   모든 실시간 데이터에 사용한다. 좌표, 시간, 거리, 트랙 ID, 고도, 속도, 위협도, 카운트, window 값, operator ID는 IBM Plex Mono다.

### Hierarchy / 계층

- **Display XL `{typography.display-xl}`**
  화면 제목과 최상위 섹션 제목에 사용한다. 크기는 30px로 제한한다. 군사 콘솔에서 title이 화면을 압도하면 안 된다.

- **Display LG `{typography.display-lg}`**
  카드 제목, modal 제목, panel label에 사용한다. uppercase, tracking, compact line-height로 계기판 느낌을 만든다.

- **Body `{typography.body}`**
  설명 문장, 로그 메시지 본문, form label 주변 텍스트에 사용한다. Pretendard 기반이고, body에서도 `tabular-nums`를 기본으로 켠다.

- **Data SM/MD/LG `{typography.data-*}`**
  데이터 값에 사용한다. 값이 실시간으로 변할 가능성이 있으면 반드시 이 계열을 사용한다.

- **Micro Label `{typography.micro-label}`**
  chip, axis label, tiny metadata, section eyebrow에 사용한다. 항상 uppercase로 처리한다. 단, 한국어 문장에는 적용하지 않는다.

- **Button Cap `{typography.button-cap}`**
  CTA, segmented button, 작전 명령 버튼에 사용한다. 버튼 라벨은 짧고 명령형이어야 한다.

### Numeric Discipline / 숫자 규칙

다음 값은 절대 proportional font로 렌더링하지 않는다.

- `T-041`, `T-087` 같은 track ID
- `RNG 1.2KM`, `ALT 420M`, `SPD 12.4M/S`
- `37.5665N 127.1214E`
- `21:47:03Z`, `00:02:19`
- `82%`, `64%`, `03`, `12`
- sensor window `05M`, `15M`
- operator ID `OPS-07`

숫자에는 `font-variant-numeric: tabular-nums` 또는 `font-feature-settings: 'tnum'`이 반드시 적용되어야 한다.

### Casing / 대소문자

- 구조 라벨: uppercase
- 버튼: uppercase 또는 짧은 English command
- 한국어 설명: 자연 문장
- 데이터 값: source format 유지
- 로그: timestamp는 mono, message는 Pretendard 또는 body

잘못된 예:

- `위협도 추이`를 억지로 uppercase 스타일로 늘려 쓰기
- `37.5665N`을 body font로 렌더링하기
- 긴 버튼 문장을 all caps로 넣기

## Layout

레이아웃은 "작전실 콘솔"의 밀도를 기준으로 한다. 페이지 섹션은 floating card들이 아니라 넓은 surface band와 grid cell이다.

### 이 저장소의 실제 레이아웃 / COP Rail-over-Map

이 앱의 기본 화면은 full-bleed 3D COP 위에 좌측 커맨드 레일이 떠 있는 구조다. 레일은 `map-glass-panel` 규칙을 따르는 floating HUD이며, 지도가 화면 전체를 채우는 것이 정보 밀도상 옳다. 별도의 3열 대시보드로 재구성하지 않는다.

- 레일 폭: `min(304px, 86vw)`
- 레일 표면: `{colors.map-glass-bg}` + `{effects.map-glass-blur}` blur, 우측 hairline
- 지도 크롬(스케일바 등): `{colors.map-glass-bg-strong}`, mono 데이터

### 데스크톱 콘솔 (일반 대시보드 화면 기준)

기준 레이아웃:

- Header: 60px 고정 높이
- Main shell: 3열 구조 (context rail 250px / central COP fluid / gauge rail 236px)
- Bottom strip: sensor/stat grid, stat cards strip 620px

### Tablet / 태블릿

- 768px부터 1279px 사이에서는 gauge rail이 map 아래 또는 옆의 좁은 column으로 이동할 수 있다.
- context rail은 필요하면 상단 또는 왼쪽 compact panel로 유지한다.
- stat card는 2-up grid로 wrapping한다.
- touch target은 최소 30px 이상이어야 한다.

### Mobile / 모바일

- 단일 column을 기본으로 한다.
- Header chip은 줄어들거나 숨는다.
- Map/COP 영역은 full-width surface로 들어간다.
- detail view는 bottom sheet나 stack section으로 내려온다.
- 가로 overflow는 허용하지 않는다.
- 지도 내부 태그와 좌표 label은 겹치면 안 된다.

### Spacing / 간격

spacing은 4px 기반이지만 작전 콘솔에서는 12-20px 범위가 가장 자주 쓰인다.

- `xxs` 4px: bar gap, sparkline gap
- `xs` 6px: icon-label gap, tiny tag padding
- `sm` 8px: row gap, compact chips
- `md` 12px: row padding, standard label gap
- `lg` 14px: panel internal padding
- `xl` 20px: page padding, major internal spacing
- `xxl` 28px: modal/alert/action spacing

### Section Framing / 섹션 프레이밍

각 섹션의 outer rounded rectangle border는 제거한다. 구획은 `bg`, `surface`, `surface-map`, gap, 내부 hairline으로 만든다. 다만 버튼, input, map tag, track row, alert strip 등 컴포넌트 자체의 상태/상호작용/의미를 전달하는 border는 유지한다.

## Elevation & Depth

기본 콘솔 화면에는 전통적 elevation이 없다. 일반 패널, 섹션, 카드, form, stat, gauge는 그림자, blur, glassmorphism, gradient layer로 깊이를 만들지 않는다. 깊이는 다음 세 가지로만 만든다.

1. **Tonal Step / 명도 단계**: `bg -> surface -> surface-2` 순서로만 단계가 올라간다.
2. **Hairline / 얇은 선**: 기능이 있는 구분선만 사용한다.
3. **Semantic Emphasis / 의미 강조**: hostile row의 left border, alert strip, danger CTA처럼 상태 의미가 있을 때만 색이 등장한다.

### 금지되는 depth 방식

- 일반 콘솔 배경의 gradient background
- 장식용 radial glow
- 3D map overlay 밖의 glassmorphism / `backdrop-filter`
- 일반 카드/섹션의 frosted panel, tinted shadow, decorative drop shadow
- card inside card 구조
- rounded rectangle section wrapper
- 게임 UI식 4-코너 브래킷, 스캔라인, 네온 글로우

### 허용되는 예외

- map marker의 live ping 또는 soft ring. 단, 이것은 depth가 아니라 "움직이는 위협/실시간 track" 표시다.
- ring gauge의 colored arc는 상태 값 표시다.
- sparkline의 colored bar는 alert intensity 표시다.
- 3D 도시 지도 위 HUD 패널은 `map-glass-panel` 토큰으로만 glassmorphism을 사용할 수 있다.

## Shapes

shape language는 compact technical이다.

### Radius Scale / 반경 스케일

- `none` 0px: section outer frame, large surface block
- `xs` 6px: logo tile, icon well, map tag, tiny status shape
- `sm` 9px: header chip, segmented button, input/select
- `md` 14px: legacy modal/card radius
- `lg` 16px: legacy large panel radius
- `pill` 32px: single primary CTA 또는 danger CTA
- `full` 9999px: status dot, circular marker

### Shape Semantics / 형태 의미

색이 유일한 상태 구분 수단이 되면 안 된다. 색각 다양성과 빠른 판독성을 위해 shape도 의미를 나눠야 한다.

- Friendly: circle 또는 check/shield 계열
- Caution: triangle 계열
- Hostile: alert triangle, red left border, danger CTA
- Neutral/unknown: muted circle 또는 low-opacity dot

### Pill Rule / pill 규칙

pill radius는 화면당 하나의 가장 중요한 action에만 사용한다. 일반 mode switching이나 필터 chip은 pill이 아니라 `sm` radius를 사용한다.

## Components

컴포넌트는 atomic token을 직접 하드코딩하지 않고 `ds-*` 토큰 또는 CSS custom property를 참조해야 한다. 이 저장소에서 그 custom property는 [`src/style.css`](src/style.css)의 `:root`에 정의된 `--ds-*` 변수다. 새 컴포넌트를 만들 때는 먼저 이 문서의 component token을 찾고, 없으면 새로운 component key를 추가한 뒤 구현한다.

### Header Bar / 레일 헤더

Header는 모든 작전 화면의 기준점이다. 필수 요소: 브랜드/로고, 화면명, mission/context, live dot, THREAT CONDITION 또는 상태. 배경은 `{colors.bg}` 또는 map-glass. 하단 hairline. clock/데이터는 mono. live dot은 friendly color.

### Header Chip

`SECTOR SEOUL-E`, `MODE LIVE-SIM`, `WINDOW 05M`처럼 현재 화면 맥락을 압축한다. micro label typography, neutral surface, semantic color 금지, 버튼처럼 보이지 않게.

### Glass Panel

이름은 과거 exploration에서 남았지만 실제로는 flat surface section이다. outer rounded border 없음, blur 없음(맵 오버레이 제외), shadow 없음, surface background와 internal padding만.

### Tactical Map Glass Panel

`map-glass-panel`은 3D map overlay 전용 컴포넌트다. 이 앱에서는 좌측 커맨드 레일과 스케일바가 여기에 해당한다. 구성: semi-transparent near-black surface, short backdrop blur, compact mono labels, white display heading. 규칙: outer border 없음, blur는 `{effects.map-glass-blur}` 이하, blue/cyan chrome 금지, 후보지 dot은 neutral marker, threat/zone/alert에는 semantic color 유지, 좌표·속도·고도·heading·track ID는 IBM Plex Mono + tabular nums.

### CTA Pill / CTA Pill Danger

`cta-pill`은 화면의 가장 중요한 action이다. transparent bg, line-strong border, pill radius, button-cap typography. hover 시 text-primary + stronger border. `cta-pill-danger`는 적대 트랙 교전 승인 같은 고위험 action에만 사용한다. hostile text/border, hover 시 hostile fill + dark text. 일반 삭제/닫기/navigation에는 사용 금지.

### Segmented View Button

작전 모드 전환에 사용한다. active 상태는 초록 fill을 사용할 수 있고, active selection text는 `#0A1F0E` dark text로 contrast를 확보한다.

### Gauge Card / Stat Card

단일 수치의 비율 또는 KPI를 보여준다. outer frame 없음, 값은 data-lg, label은 micro-label, ring 배경은 neutral, 0/empty는 `NO SIGNAL`처럼 명확히. stat icon well만 `surface-2` + `xs` radius.

### Track Row

track list의 핵심 컴포넌트다. row background는 항상 neutral surface. 상태색은 left border와 ID 색에만 사용한다. 전체 row를 색으로 칠하지 않는다. text overflow는 truncate하되 시간은 오른쪽에 유지. disabled도 행 높이 유지.

### Map Tag

지도 위 작은 위치 label. 배경 near-black alpha, border line-strong, text micro-label, status icon은 shape + semantic color. 좌표 label과 겹치지 않게.

### Event Log Line

timestamp는 mono + semantic tone 가능, message는 body, bottom hairline. 최신 event가 명확한 위치에 들어오고 old entries는 잘려도 된다. timestamp는 절대 proportional font 금지.

### Sparkline

시간 bucket별 alert intensity. bar color는 상태 스케일(neutral -> friendly -> caution -> hostile)을 직접 나타낸다. 장식 gradient 금지, outer frame 없음.

### Engagement Modal

고위험 교전 확인 UI. outer rounded rectangle border는 제거하되 내용은 높은 위험성을 드러낸다. title `ENGAGEMENT AUTHORIZATION`, hostile icon/text, key-value block(surface-2), `Abort`, `Confirm engage`. 교전 대상·방식·operator를 반드시 보여준다.

### Alert Strip

unresolved hostile track이 있을 때만 나타나는 전역 banner. full-width, red tinted background, message는 text-primary, hostile 색은 dot/elapsed/marker/divider에. resolved되면 사라진다. permanent chrome이 아니다.

### Text Input / Select

중립 tone form control. surface-2 background, line border, sm radius, body typography, placeholder text-muted, disabled text-muted, focus line-strong. select option label은 `WINDOW 05M`처럼 짧은 값.

### Empty State

`NO TRACKS IN WINDOW`, `NO SIGNAL`, `NO EVENTS`처럼 장식 없이 간결하게. label은 micro-label, message는 mono/data-sm. illustration/marketing copy 금지.

## Do's and Don'ts

### Do

- **Do** DESIGN.md의 YAML front matter를 토큰의 기준으로 삼는다.
- **Do** 새 UI를 만들기 전에 `colors`, `typography`, `rounded`, `spacing`, `components` token을 먼저 확인한다.
- **Do** 배경과 surface는 무채색만 사용한다.
- **Do** 상태색을 친/주의/적대 의미에만 사용한다.
- **Do** 모든 live number에 IBM Plex Mono와 tabular nums를 적용한다.
- **Do** live dot과 상태 표시를 주요 콘솔 화면에 유지한다.
- **Do** track row에는 left border와 ID 색으로만 상태를 표시한다.
- **Do** alert strip은 unresolved hostile track이 있을 때만 보여준다.
- **Do** mobile에서 가로 overflow를 항상 검사한다.
- **Do** 지도 태그와 좌표 label의 겹침을 검사한다.
- **Do** section outer frame은 flat surface로 처리한다.
- **Do** component 자체의 기능적 border와 section wrapper border를 구분한다.
- **Do** form controls는 neutral tone으로 유지한다.
- **Do** disabled와 empty 상태를 항상 정의한다.
- **Do** 실제 작전 데이터 형식의 mock data를 사용한다.
- **Do** 3D 지도 위 floating HUD에는 `map-glass-panel`을 사용해 지도 맥락과 판독성을 함께 유지한다.
- **Do** glass 효과가 필요한 경우 `map-glass-*` token과 `effects.map-glass-blur`만 사용한다.
- **Do** 3D 지도 HUD도 D4D 컴포넌트 원칙처럼 neutral surface, no outer border, semantic status color를 유지한다.

### Don't

- **Don't** 배경이나 카드에 올리브, 네이비, 보라, 청록 tint를 넣지 않는다.
- **Don't** 일반 콘솔/카드/섹션에 gradient, blur, glassmorphism, frosted panel을 도입하지 않는다.
- **Don't** 3D map overlay에서도 blue/cyan HUD border나 파란 후보지 dot을 만들지 않는다.
- **Don't** green/gold/red를 장식용 accent로 사용하지 않는다.
- **Don't** proportional font로 좌표, 거리, 시간, ID를 표시하지 않는다.
- **Don't** 큰 section을 둥근 사각형 border card로 감싸지 않는다.
- **Don't** 카드 안에 또 카드를 넣어 nested card UI를 만들지 않는다.
- **Don't** `cta-pill`을 화면에 여러 개 배치하지 않는다.
- **Don't** danger CTA를 일반 destructive action에 남용하지 않는다.
- **Don't** COP map을 단순 검정 박스로 비워두지 않는다. 최소한 실제 좌표/tag/terrain 또는 track marker가 있어야 한다.
- **Don't** 빈 상태에 친근한 illustration이나 marketing-style message를 넣지 않는다.
- **Don't** label과 value의 글꼴 역할을 섞지 않는다.
- **Don't** 컴포넌트 코드에 raw hex/px 값을 흩뿌리지 않는다. 토큰이나 CSS variable을 사용한다.
- **Don't** 게임 UI식 코너 브래킷/스캔라인/네온 글로우를 도입하지 않는다.

## Implementation Notes

이 섹션은 Google design.md canonical section에는 없는 프로젝트 확장 섹션이다. design.md spec은 알 수 없는 section을 보존하도록 설계되어 있으므로, D4D 구현자가 참고할 수 있는 실무 지침을 여기에 둔다.

### Token Source Mapping

현재 저장소 기준(Cesium + vanilla TS + Vite):

- CSS variables: [`src/style.css`](src/style.css) `:root`의 `--ds-*` 토큰
- DOM 크롬: [`index.html`](index.html)
- 지도 엔티티 색: [`src/layers.ts`](src/layers.ts)(구역·후보지·AO), [`src/assets.ts`](src/assets.ts)(방어 자산), [`src/sim/drones.ts`](src/sim/drones.ts) 및 [`src/main.ts`](src/main.ts)(위협 트랙), [`src/optim/cuas/render.ts`](src/optim/cuas/render.ts)(커버리지)
- 폰트: [`src/main.ts`](src/main.ts)의 `@fontsource` import (Chakra Petch = D-DIN fallback, IBM Plex Mono = data)

새로운 스타일 값을 추가할 때 순서:

1. `DESIGN.md` front matter에 token 추가
2. `src/style.css` `:root`에 `--ds-*` CSS variable 추가
3. 필요하면 지도 렌더 TS에서 동일 hex 상수를 참조
4. component에서 raw value 대신 token 사용
5. 상태별(hover/active/disabled/empty) 예시를 확인

### Review Checklist

- 새 색상이 neutral surface나 semantic palette 밖으로 벗어나지 않았는가?
- 상태색이 장식/브랜드 accent처럼 쓰이지 않았는가?
- cyan/blue/purple/orange가 UI나 지도 엔티티에 남아 있지 않은가?
- 3D 지도 HUD가 아닌 곳에 blur/backdrop-filter가 쓰이지 않았는가?
- live number가 mono + tabular nums인가?
- section wrapper에 rounded rectangle border가 다시 생기지 않았는가?
- empty/disabled/hover/active 상태가 있는가?
- mobile에서 overflow가 없는가?
- 실제 작전 데이터 형식의 mock value를 사용하는가?

### Example Data Format

권장 mock data: `T-041`, `RNG 1.2KM`, `37.5665N 127.1214E`, `21:47:03Z`, `00:02:19`, `OPS-07`, `HARD-KILL / RF JAM`, `WINDOW 05M`.

금지 mock data: `Lorem ipsum`, `Item 1`, `123`, `Card title`, 실제 형식이 없는 "예쁜" 임의값.

### Accessibility

- 주요 텍스트는 `text-primary` 또는 충분한 contrast의 semantic color를 사용한다.
- `text-muted`는 보조 정보나 disabled에만 사용한다.
- 색만으로 상태를 전달하지 않는다. shape, label, border position을 함께 사용한다.
- interactive control은 keyboard focus를 잃으면 안 된다.
- 모션은 `prefers-reduced-motion`을 존중한다.

### Motion

- hover/focus feedback: `{motion.feedback}`
- panel/modal/content update: `{motion.content}` 또는 `{motion.modal}`
- easing: `{motion.easing}`
- reduced motion: `{motion.reduced-motion-duration}`

금지: spring bounce, overshoot, long fade, ambient floating, decorative looping animation.
허용: live dot pulse, hostile marker ping, 새 event log line의 짧은 fade/slide, chart value update의 짧은 transition.

### Glossary

- **COP**: Common Operational Picture. 상황도.
- **C-UAS**: Counter-Unmanned Aircraft System.
- **Track**: 탐지/추적 중인 객체.
- **Friendly**: 우군 또는 정상 상태.
- **Caution**: 미확인, 판단 대기, 센서 품질 저하.
- **Hostile**: 적대 또는 교전 대상.
- **Zulu Time**: UTC 기반 작전 시각 표기.
- **Surface**: 정보가 놓이는 중립 배경 계층.
- **Semantic Color**: 장식이 아니라 의미를 전달하는 색.
