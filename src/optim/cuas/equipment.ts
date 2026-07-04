// C-UAS 기본 장비 카탈로그 (sample_scenario.json 공개 스펙 그대로).
import type { Equipment, Optimization } from "./types";

export const DEFAULT_EQUIPMENT: Equipment[] = [
  {
    id: "RF_SCANNER_A", name: "tri-band RF scanner", type: "scanner",
    power_kw: 0.8, requires_network: true, bands: ["900MHz", "2.4GHz", "5.8GHz"],
    range_km: 3.6, antenna: { mode: "omni", beamwidth_deg: 360, vertical_beamwidth_deg: 90 },
    mount_height_m: 2.0, min_rooftop_area_m2: 6000,
    performance: { detect_factor: 0.82, localization_factor: 1.0, nlos_floor: 0.35 },
  },
  {
    id: "RF_SCANNER_B", name: "long range RF scanner", type: "scanner",
    power_kw: 1.1, requires_network: true, bands: ["1.5GHz", "2.4GHz", "5.8GHz"],
    range_km: 5.0, antenna: { mode: "omni", beamwidth_deg: 360, vertical_beamwidth_deg: 90 },
    mount_height_m: 2.0, min_rooftop_area_m2: 6500,
    performance: { detect_factor: 0.84, localization_factor: 1.0, nlos_floor: 0.35 },
  },
  {
    id: "RADAR_A", name: "short range 3D radar", type: "radar",
    power_kw: 3.0, requires_network: true, bands: ["radar"], range_km: 4.5,
    antenna: { mode: "sector", beamwidth_deg: 120, vertical_beamwidth_deg: 45, tilt_deg: 2 },
    mount_height_m: 3.0, min_rooftop_area_m2: 8500,
    performance: { detect_factor: 0.94, nlos_floor: 0.18 },
  },
  {
    id: "EOIR_A", name: "EO/IR camera", type: "camera",
    power_kw: 0.5, requires_network: true, bands: ["visual", "ir"], range_km: 2.0, identify_range_km: 1.4,
    antenna: { mode: "sector", pan_mode: "ptz", pan_range_deg: 360, beamwidth_deg: 75, vertical_beamwidth_deg: 35, tilt_deg: 1 },
    mount_height_m: 2.5, min_rooftop_area_m2: 2500,
    performance: { detect_factor: 0.5, identify_factor: 0.92, nlos_floor: 0.06 },
  },
  {
    id: "JAMMER_A", name: "directional dual-band jammer", type: "jammer",
    power_kw: 4.8, requires_network: false, bands: ["2.4GHz", "5.8GHz"], range_km: 2.8,
    antenna: { mode: "sector", pan_mode: "ptz", pan_range_deg: 360, beamwidth_deg: 65, vertical_beamwidth_deg: 55, tilt_deg: 0 },
    mount_height_m: 2.0, min_rooftop_area_m2: 5000,
    performance: { jam_factor: 1.0, leakage_factor: 1.0, ptz_leakage_factor: 0.07, nlos_floor: 0.3 },
  },
  {
    id: "JAMMER_B", name: "wideband sector jammer", type: "jammer",
    power_kw: 7.5, requires_network: false, bands: ["900MHz", "1.5GHz", "2.4GHz", "5.8GHz"], range_km: 2.3,
    antenna: { mode: "sector", pan_mode: "ptz", pan_range_deg: 360, beamwidth_deg: 95, vertical_beamwidth_deg: 60, tilt_deg: 0 },
    mount_height_m: 2.0, min_rooftop_area_m2: 6500,
    performance: { jam_factor: 1.0, leakage_factor: 1.0, ptz_leakage_factor: 0.07, nlos_floor: 0.32 },
  },
];

export const DEFAULT_OPTIMIZATION: Optimization = {
  max_items: 8,
  coverage_weights: { detect: 0.32, identify: 0.18, jam: 0.3, localize: 0.2 },
  threat_bands: { "2.4GHz": 1.0, "5.8GHz": 0.9, "1.5GHz": 0.55, "900MHz": 0.45 },
  minimum_gain: 0.15,
  requirement_penalty_weight: 20.0,
  site_constraints: {
    exclusive_site: false,
    same_equipment_per_site_limit: 1,
    type_limits_per_site: { scanner: 1, radar: 1, camera: 1, jammer: 1 },
    incompatible_type_pairs_per_site: [],
  },
  requirements: {
    detect_avg_min: 0.9, identify_avg_min: 0.45, localize_avg_min: 0.7,
    uncovered_weight_ratio_max: 0.05, leakage_penalty_max: 5.0,
    min_type_counts: { scanner: 2, jammer: 1 },
  },
};
