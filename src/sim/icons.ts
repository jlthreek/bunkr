// 위협체 유형별 아이콘을 캔버스로 생성 (오프라인, 외부 에셋 불필요).
// 흰색으로 그려 billboard.color 로 위협도 색을 곱해 틴트한다. 기본 진행방향 = 위쪽(북).
export type DroneType = "quad" | "fixedwing" | "balloon" | "bird" | "unknown";

const cache = new Map<DroneType, HTMLCanvasElement>();

export function iconFor(type: DroneType): HTMLCanvasElement {
  const hit = cache.get(type);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.translate(32, 32);
  g.strokeStyle = "#ffffff";
  g.fillStyle = "#ffffff";
  g.lineCap = "round";
  g.lineJoin = "round";
  g.shadowColor = "rgba(255,255,255,0.6)";
  g.shadowBlur = 3;
  switch (type) {
    case "quad":
      drawQuad(g);
      break;
    case "fixedwing":
      drawFixedwing(g);
      break;
    case "balloon":
      drawBalloon(g);
      break;
    case "bird":
      drawBird(g);
      break;
    case "unknown":
      drawUnknown(g);
      break;
  }
  cache.set(type, c);
  return c;
}

// 미탐지: 물음표 박스 (스캐너 미확인 표적)
function drawUnknown(g: CanvasRenderingContext2D) {
  g.lineWidth = 2.4;
  g.strokeRect(-14, -14, 28, 28);
  g.font = "bold 26px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("?", 0, 1);
}

// 쿼드콥터: X자 암 + 4로터
function drawQuad(g: CanvasRenderingContext2D) {
  g.lineWidth = 3.2;
  const a = 16;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(dx * a, dy * a);
    g.stroke();
    g.beginPath();
    g.arc(dx * a, dy * a, 6, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, 4, 0, Math.PI * 2);
  g.fill();
}

// 고정익: 진행방향(위)으로 향한 델타 + 꼬리
function drawFixedwing(g: CanvasRenderingContext2D) {
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(0, -20); // nose
  g.lineTo(16, 14); // right wing
  g.lineTo(0, 6); // body notch
  g.lineTo(-16, 14); // left wing
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(0, 6);
  g.lineTo(0, 18);
  g.moveTo(-7, 18);
  g.lineTo(7, 18);
  g.stroke();
}

// 침투 풍선: 기구 + 바스켓
function drawBalloon(g: CanvasRenderingContext2D) {
  g.lineWidth = 2.4;
  g.beginPath();
  g.arc(0, -6, 15, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(-8, 6);
  g.lineTo(-5, 16);
  g.moveTo(8, 6);
  g.lineTo(5, 16);
  g.stroke();
  g.strokeRect(-5, 16, 10, 7);
}

// 조류(기만/오탐): 갈매기형 이중 아치
function drawBird(g: CanvasRenderingContext2D) {
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-20, 2);
  g.quadraticCurveTo(-10, -12, 0, 0);
  g.quadraticCurveTo(10, -12, 20, 2);
  g.stroke();
}
