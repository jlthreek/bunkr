// 시드 가능 PRNG (cuas 의 np.random.default_rng 대응) — 시뮬레이션 재현성 확보.
// mulberry32 + Box-Muller. 원본과 수치가 비트 단위로 같진 않으나 분포/재현성은 동일.
export class RNG {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  random(): number {
    return this.next();
  }
  uniform(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  /** [lo, hi) 정수 */
  integers(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo));
  }
  choice<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** 정규분포 (Box-Muller) */
  normal(mu = 0, sigma = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export function clamp(v: number, lo = 0, hi = 1): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
