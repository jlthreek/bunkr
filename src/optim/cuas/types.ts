// C-UAS 배치 알고리즘(placement_algorithm.py) 충실 포팅 — 타입.
// 좌표는 로컬 미터(x=동, y=남; 원점=AO center). 렌더 시 lon/lat 로 환산.

export interface Cell {
  index: number;
  x: number;
  y: number;
  weight: number;
  regionIds: string[];
}

export interface Antenna {
  mode: "omni" | "sector";
  pan_mode?: "fixed" | "ptz";
  pan_range_deg?: number;
  beamwidth_deg?: number;
  vertical_beamwidth_deg?: number;
  tilt_deg?: number;
}

export type EqType = "scanner" | "radar" | "camera" | "jammer";

export interface Equipment {
  id: string;
  name: string;
  type: EqType;
  bands: string[];
  range_km: number;
  identify_range_km?: number;
  antenna: Antenna;
  mount_height_m: number;
  min_rooftop_area_m2: number;
  power_kw: number;
  requires_network: boolean;
  performance: Record<string, number>;
}

export interface Region {
  id: string;
  type: "rect" | "polygon" | "multipolygon" | "ellipse" | "ellipse_ring";
  weight: number;
  // rect
  x1?: number; y1?: number; x2?: number; y2?: number;
  // ellipse / ellipse_ring
  cx?: number; cy?: number; rx?: number; ry?: number;
  inner_rx?: number; inner_ry?: number; outer_rx?: number; outer_ry?: number;
  // polygon/multipolygon (로컬 미터 링)
  coordinates?: any;
}

export interface Building {
  id: string;
  footprint?: number[][]; // 로컬 미터 폴리곤
  x?: number; y?: number; w?: number; d?: number; // 박스형
  height?: number;
  ground_alt?: number;
  roof_alt_m?: number;
  is_obstacle?: boolean;
}

export interface Site {
  id: string;
  name: string;
  x: number;
  y: number;
  ground_alt?: number;
  height?: number;
  install_alt_m?: number;
  rooftop_area_m2: number;
  power_kw: number;
  network: boolean;
  access_score: number;
  max_items: number;
  allowed_equipment_types?: string[];
  building_id?: string;
  azimuth_blocked_deg?: number[][];
  same_equipment_limit?: number;
  type_limits?: Record<string, number>;
  lon?: number;
  lat?: number;
}

export interface SiteConstraints {
  exclusive_site?: boolean;
  same_equipment_per_site_limit?: number;
  type_limits_per_site?: Record<string, number>;
  incompatible_type_pairs_per_site?: string[][];
}

export interface Requirements {
  detect_avg_min?: number;
  identify_avg_min?: number;
  jam_avg_min?: number;
  localize_avg_min?: number;
  uncovered_weight_ratio_max?: number;
  leakage_penalty_max?: number;
  power_kw_max?: number;
  equipment_count_min?: number;
  equipment_count_max?: number;
  min_type_counts?: Record<string, number>;
  max_type_counts?: Record<string, number>;
}

export interface Optimization {
  max_items: number;
  coverage_weights: { detect: number; identify: number; jam: number; localize: number };
  threat_bands: Record<string, number>;
  minimum_gain?: number;
  requirement_penalty_weight?: number;
  site_constraints?: SiteConstraints;
  requirements?: Requirements;
}

export interface Area {
  width_m: number;
  height_m: number;
  cell_size_m: number;
  target_altitude_m: number;
  target_altitude_mode?: "absolute" | "agl";
  default_ground_alt_m?: number;
}

export interface Scenario {
  name?: string;
  area: Area;
  optimization: Optimization;
  terrain?: { default_ground_alt_m?: number; points?: { x: number; y: number; ground_alt_m: number }[] };
  los?: { samples?: number; clearance_m?: number; soft_block_margin_m?: number; hard_block_margin_m?: number };
  priority_regions: Region[];
  buildings: Building[];
  sites: Site[];
  equipment: Equipment[];
}

export interface Candidate {
  index: number;
  site_id: string;
  site_name: string;
  equipment_id: string;
  equipment_name: string;
  equipment_type: EqType;
  orientation_deg: number | null;
  power_kw: number;
  required_rooftop_area_m2: number;
  x: number;
  y: number;
  lon: number | null;
  lat: number | null;
  altitude_m: number;
  access_score: number;
  detect: Float64Array;
  identify: Float64Array;
  jam: Float64Array;
  scanner: Float64Array;
  leakage: Float64Array;
}

export interface RequirementCheck {
  name: string;
  actual: number;
  operator: string;
  target: number;
  passed: boolean;
}

export interface PlanScore {
  objective: number;
  coverage: {
    detect_avg: number;
    identify_avg: number;
    jam_avg: number;
    localize_avg: number;
    uncovered_weight_ratio: number;
    leakage_penalty: number;
  };
  requirements: RequirementCheck[];
  requirements_passed: boolean;
  requirement_penalty: number;
  power_kw: number;
  cells: { index: number; x: number; y: number; weight: number; detect: number; identify: number; jam: number; localize: number }[];
}
