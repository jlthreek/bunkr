// SQLite canonical store (better-sqlite3). geom 은 GeoJSON geometry 문자열로 저장.
import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { DB_PATH } from "../config.mjs";

export function openDb() {
  if (!existsSync(dirname(DB_PATH))) mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS area_boundary (
  area_id TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  geom    TEXT NOT NULL            -- GeoJSON Polygon (WGS84)
);

CREATE TABLE IF NOT EXISTS buildings (
  building_id       TEXT PRIMARY KEY,
  osm_id            INTEGER,
  name              TEXT,
  ground_alt_m      REAL NOT NULL,
  height_m          REAL NOT NULL,
  levels            REAL,
  height_source     TEXT NOT NULL,  -- osm:height | osm:levels | default (출처 추적)
  is_obstacle       INTEGER NOT NULL DEFAULT 1,
  footprint_area_m2 REAL NOT NULL,
  centroid_lon      REAL NOT NULL,
  centroid_lat      REAL NOT NULL,
  geom              TEXT NOT NULL   -- GeoJSON Polygon (WGS84)
);

CREATE TABLE IF NOT EXISTS install_sites (
  site_id         TEXT PRIMARY KEY,
  building_id     TEXT NOT NULL REFERENCES buildings(building_id),
  name            TEXT,
  install_alt_m   REAL NOT NULL,
  rooftop_area_m2 REAL NOT NULL,
  max_items       INTEGER NOT NULL,
  power_kw        REAL NOT NULL,
  network         INTEGER NOT NULL,
  access_score    REAL NOT NULL,
  install_cost    REAL NOT NULL,
  synthetic       INTEGER NOT NULL DEFAULT 1,  -- 합성 필드 포함 여부 표시
  lon             REAL NOT NULL,
  lat             REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS priority_zones (
  zone_id   TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  zone_type TEXT NOT NULL,          -- protected | approach | sensitive
  weight    REAL NOT NULL,          -- 보호/접근 +, 민감 -
  geom      TEXT NOT NULL           -- GeoJSON Polygon/MultiPolygon (WGS84)
);
`;

export function resetTables(db) {
  db.exec(`DELETE FROM install_sites; DELETE FROM buildings;
           DELETE FROM area_boundary; DELETE FROM meta;`);
  // priority_zones 는 손으로 관리하므로 백필 시 보존
}

export const upsertMeta = (db) =>
  db.prepare(`INSERT INTO meta(key,value) VALUES(@key,@value)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`);

export const insertArea = (db) =>
  db.prepare(`INSERT INTO area_boundary(area_id,name,geom)
    VALUES(@area_id,@name,@geom)`);

export const insertBuilding = (db) =>
  db.prepare(`INSERT INTO buildings
    (building_id,osm_id,name,ground_alt_m,height_m,levels,height_source,
     is_obstacle,footprint_area_m2,centroid_lon,centroid_lat,geom)
    VALUES(@building_id,@osm_id,@name,@ground_alt_m,@height_m,@levels,@height_source,
     @is_obstacle,@footprint_area_m2,@centroid_lon,@centroid_lat,@geom)`);

export const insertSite = (db) =>
  db.prepare(`INSERT INTO install_sites
    (site_id,building_id,name,install_alt_m,rooftop_area_m2,max_items,power_kw,
     network,access_score,install_cost,synthetic,lon,lat)
    VALUES(@site_id,@building_id,@name,@install_alt_m,@rooftop_area_m2,@max_items,
     @power_kw,@network,@access_score,@install_cost,@synthetic,@lon,@lat)`);
