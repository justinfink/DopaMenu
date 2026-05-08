// Time helpers shared by the intervention engine, quiet-hours editors, and
// per-app monitoring window UI. HH:mm string-based — no Date math leaking into
// callers.

export function parseHHMM(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

export function toMinutes(value: string): number | null {
  const parsed = parseHHMM(value);
  if (!parsed) return null;
  return parsed.h * 60 + parsed.m;
}

export function nowInMinutes(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

// True when `time` falls inside [start, end]. Handles overnight ranges
// (e.g. 22:00 → 07:00) by checking either side of midnight.
export function isTimeInRange(time: string, start: string, end: string): boolean {
  const t = toMinutes(time);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (t == null || s == null || e == null) return false;
  if (s > e) {
    return t >= s || t <= e;
  }
  return t >= s && t <= e;
}

// Same shape as isTimeInRange but for a "now" Date — saves callers from
// formatting their own HH:mm string just to call the above.
export function isNowInRange(start: string, end: string, date: Date = new Date()): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null) return false;
  const t = nowInMinutes(date);
  if (s > e) {
    return t >= s || t <= e;
  }
  return t >= s && t <= e;
}

// Detect whether two ranges overlap. Naive minute-by-minute check across the
// 1440-minute day; cheap and handles wraparound without the corner-case math
// of pure interval arithmetic.
export function rangesOverlap(
  a: { start: string; end: string },
  b: { start: string; end: string },
): boolean {
  const aS = toMinutes(a.start);
  const aE = toMinutes(a.end);
  const bS = toMinutes(b.start);
  const bE = toMinutes(b.end);
  if (aS == null || aE == null || bS == null || bE == null) return false;

  const minutesIn = (s: number, e: number): Set<number> => {
    const out = new Set<number>();
    if (s <= e) {
      for (let i = s; i <= e; i++) out.add(i);
    } else {
      for (let i = s; i < 1440; i++) out.add(i);
      for (let i = 0; i <= e; i++) out.add(i);
    }
    return out;
  };

  const aSet = minutesIn(aS, aE);
  const bSet = minutesIn(bS, bE);
  for (const m of bSet) {
    if (aSet.has(m)) return true;
  }
  return false;
}

// Format HH:mm → "10:30 PM". Used by the home page "back at HH:MM" hint and
// quiet-hours summary copy.
export function formatHHMMForDisplay(value: string): string {
  const parsed = parseHHMM(value);
  if (!parsed) return value;
  const period = parsed.h >= 12 ? 'PM' : 'AM';
  const displayHour = parsed.h % 12 === 0 ? 12 : parsed.h % 12;
  const displayMin = parsed.m.toString().padStart(2, '0');
  return `${displayHour}:${displayMin} ${period}`;
}
