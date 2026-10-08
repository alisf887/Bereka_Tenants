/* Ethiopian calendar helpers — runs entirely in the browser now, since
 * this architecture (React + Supabase) has no server of its own.
 * Same math as the earlier Flask version, so payment cycles and "days
 * late" land on identical dates.
 *
 * Design choices carried over on purpose:
 *   - A rent "month" is always 30 days; the 13th month (Pagume, 5-6 real
 *     days) is never counted as a rent month. Any date that lands there
 *     is rolled forward to Meskerem 1 of the following year.
 *   - The rent day rolls over at 06:00 *local device time*, not midnight.
 *     Because this now runs client-side with no server clock to defer to,
 *     "today" depends on each viewer's own device clock — worth knowing
 *     if someone's device time zone is wrong.
 */

export const EPOCH = 1724221; // JDN of Meskerem 1, year 1 E.C.

export const MONTHS = [
  "መስከረም", "ጥቅምት", "ህዳር", "ታህሳስ", "ጥር", "የካቲት", "መጋቢት",
  "ሚያዚያ", "ግንቦት", "ሰኔ", "ሀምሌ", "ነሀሴ", "ጳጉሜ",
];

const ALIASES = {
  "መስከረም": 1, "ጥቅምት": 2, "ህዳር": 3, "ሕዳር": 3, "ታህሳስ": 4, "ታኅሳስ": 4, "ጥር": 5,
  "የካቲት": 6, "መጋቢት": 7, "ሚያዚያ": 8, "ሚያዝያ": 8, "ግንቦት": 9, "ሰኔ": 10,
  "ሀምሌ": 11, "ሐምሌ": 11, "ነሀሴ": 12, "ነሐሴ": 12, "ጳጉሜ": 13, "ጳጉሜን": 13,
};

export function ethToJdn(y, m, d) {
  return EPOCH + 365 * (y - 1) + Math.floor(y / 4) + 30 * (m - 1) + d - 1;
}

export function jdnToEth(jd) {
  const r = jd - EPOCH;
  const y = 4 * Math.floor(r / 1461) + Math.min(3, Math.floor((r % 1461) / 365)) + 1;
  const doy = r - (365 * (y - 1) + Math.floor(y / 4));
  return { y, m: Math.floor(doy / 30) + 1, d: (doy % 30) + 1 };
}

export function gregToJdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
    - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

/** Pagume never counts as a rent month — roll it into next year's Meskerem 1. */
export function normalizeEth(dt) {
  if (!dt) return dt;
  if (dt.m === 13) return { y: dt.y + 1, m: 1, d: 1 };
  return dt;
}

/** Add n rent-months (each 30 days); wraps years, always skips Pagume. */
export function addMonths(dt, n) {
  let m = dt.m + n, y = dt.y;
  while (m > 12) { m -= 12; y += 1; }
  return normalizeEth({ y, m, d: dt.d });
}

/** 12 months x 30 days per year — Pagume contributes zero rent-days. */
export function rentIndex(dt) {
  const n = normalizeEth(dt);
  return 360 * n.y + 30 * (n.m - 1) + n.d;
}

export function daysBetween(a, b) {
  return rentIndex(b) - rentIndex(a);
}

/** The rent day rolls over at 06:00 local device time, not midnight. */
export function todayEth() {
  const n = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return jdnToEth(gregToJdn(n.getFullYear(), n.getMonth() + 1, n.getDate()));
}

/** 'ነሀሴ 01/2018' -> {y:2018,m:12,d:1}; unrecognized text -> null. */
export function parseEth(text) {
  if (!text) return null;
  const s = String(text).replace(/\s+/g, " ").trim();
  let monthName = null;
  for (const k of Object.keys(ALIASES)) {
    if (s.includes(k) && (!monthName || k.length > monthName.length)) monthName = k;
  }
  if (!monthName) return null;
  const nums = s.replace(monthName, "").match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  const d = parseInt(nums[0], 10), y = parseInt(nums[nums.length - 1], 10);
  const m = ALIASES[monthName];
  if (!(d >= 1 && d <= 30) || !(y > 1900 && y < 2200)) return null;
  return { y, m, d };
}

export function fmtEth(dt) {
  return dt ? `${MONTHS[dt.m - 1]} ${String(dt.d).padStart(2, "0")}/${dt.y}` : "—";
}

/** Same {key,label,cls} shape the earlier versions used. */
export function statusOf(payEnd) {
  if (!payEnd) return { key: "unknown", label: "ቀን አልተነበበም", cls: "none", days: null };
  const days = daysBetween(todayEth(), payEnd);
  if (days < 0) return { key: "late", label: `ያልተከፈለ · ${Math.abs(days)} ቀን አለፈ`, cls: "late", days };
  if (days <= 30) return { key: "soon", label: `በ${days} ቀን ያልቃል`, cls: "warn", days };
  return { key: "paid", label: `የተከፈለ · ${days} ቀን ቀሪ`, cls: "ok", days };
}
