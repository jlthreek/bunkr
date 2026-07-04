// Overpass API 에서 bbox 내 건물 footprint + 태그를 받아 정규화
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { CACHE_DIR } from "../config.mjs";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function query(bbox) {
  const { south, west, north, east } = bbox;
  const b = `${south},${west},${north},${east}`;
  return `[out:json][timeout:90];
(
  way["building"](${b});
);
out body;
>;
out skel qt;`;
}

/** Overpass 원본 JSON (24h 캐시) */
export async function fetchOverpass(bbox) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const key = `${bbox.south}_${bbox.west}_${bbox.north}_${bbox.east}`.replace(
    /\./g,
    "p"
  );
  const cacheFile = resolve(CACHE_DIR, `overpass_${key}.json`);
  if (existsSync(cacheFile)) {
    console.log(`[overpass] 캐시 사용: ${cacheFile}`);
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }

  const q = query(bbox);
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      console.log(`[overpass] 요청 → ${url}`);
      const json = await request(url, q);
      writeFileSync(cacheFile, JSON.stringify(json));
      console.log(`[overpass] 캐시 저장: ${cacheFile}`);
      return json;
    } catch (e) {
      console.warn(`[overpass] 실패(${url}): ${e.message}`);
      lastErr = e;
    }
  }
  throw new Error(`모든 Overpass 엔드포인트 실패: ${lastErr?.message}`);
}

// Node fetch → 실패 시 curl 폴백(사내 프록시 CA 는 시스템 신뢰저장소에만 존재).
async function request(url, q) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(q),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`[overpass] fetch 실패(${e.cause?.code || e.message}) → curl 폴백`);
    const out = execFileSync(
      "curl",
      [
        "-sS",
        "-m",
        "120",
        "-A",
        "yangjae3dmap/0.1 (D4D hackathon; contact mhbot@mz.co.kr)",
        "-H",
        "Accept: application/json",
        "-X",
        "POST",
        "--data-urlencode",
        `data=${q}`,
        url,
      ],
      { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }
    );
    return JSON.parse(out);
  }
}

/** 원본 → { nodes:Map, buildings:[{osmId, tags, ring:[[lon,lat],...]}] } */
export function parseBuildings(json) {
  const nodes = new Map();
  for (const el of json.elements) {
    if (el.type === "node") nodes.set(el.id, [el.lon, el.lat]);
  }
  const buildings = [];
  for (const el of json.elements) {
    if (el.type !== "way" || !el.tags || !el.tags.building) continue;
    if (!el.nodes || el.nodes.length < 4) continue;
    const ring = el.nodes.map((id) => nodes.get(id)).filter(Boolean);
    if (ring.length < 4) continue;
    buildings.push({ osmId: el.id, tags: el.tags, ring });
  }
  return { buildings };
}

/** OSM 태그 → 높이(m) + 출처 */
export function resolveHeight(tags, LEVEL_H, DEFAULT_H) {
  if (tags.height) {
    const h = parseFloat(String(tags.height).replace(/[^\d.]/g, ""));
    if (isFinite(h) && h > 0) return { height_m: h, height_source: "osm:height" };
  }
  if (tags["building:levels"]) {
    const lv = parseFloat(tags["building:levels"]);
    if (isFinite(lv) && lv > 0)
      return { height_m: lv * LEVEL_H, height_source: "osm:levels", levels: lv };
  }
  return { height_m: DEFAULT_H, height_source: "default" };
}
