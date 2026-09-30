/* Ethiopian calendar helpers — runs entirely in the browser now, since
 * this architecture (React + Supabase) has no server of its own.
 * Same math as the earlier Flask version, so payment cycles and "days
 * late" land on identical dates.
 *
 * Design choices carried over on purpose:
 *   - A rent "month" is always 30 days; the 13th month (Pagume, 5-6 real
 *     days) is never counted as a rent month. Any date that lands there
 *     is rolled forward to Meskerem 1 of the following year.
 *   - The rent day rolls over at 06:00 *Addis Ababa time* (UTC+3, no DST),
 *     not midnight and not the viewer's device time zone. Only the device's
 *     absolute clock (Date.now) is trusted, so a wrong time zone on a phone
 *     no longer shifts "today".
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
  // 4-year cycle = 1461 days: years of 365, 365, 366 (leap), 365 days.
  // The leap year ends at offset 1096, so offset 1095 (Pagume 6) is still year 3.
  const n = r % 1461;
  const k = n >= 1096 ? 3 : Math.min(2, Math.floor(n / 365));
  const y = 4 * Math.floor(r / 1461) + k + 1;
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
  const base = normalizeEth(dt);
  let m = base.m + n, y = base.y;
  while (m > 12) { m -= 12; y += 1; }
  return normalizeEth({ y, m, d: base.d });
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
  const ADDIS_OFFSET_H = 3, ROLLOVER_H = 6;
  const n = new Date(Date.now() + (ADDIS_OFFSET_H - ROLLOVER_H) * 60 * 60 * 1000);
  return jdnToEth(gregToJdn(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate()));
}

/** 'ነሀሴ 01/2018' or '01/12/2018' -> {y:2018,m:12,d:1}; unrecognized text -> null. */
export function parseEth(text) {
  if (!text) return null;
  const s = String(text).replace(/\s+/g, " ").trim();
  let monthName = null;
  for (const k of Object.keys(ALIASES)) {
    if (s.includes(k) && (!monthName || k.length > monthName.length)) monthName = k;
  }
  let d, m, y;
  if (monthName) {
    const nums = s.replace(monthName, "").match(/\d+/g);
    if (!nums || nums.length < 2) return null;
    d = parseInt(nums[0], 10); y = parseInt(nums[nums.length - 1], 10);
    m = ALIASES[monthName];
  } else {
    // numeric form: day/month/year
    const nums = s.match(/\d+/g);
    if (!nums || nums.length !== 3) return null;
    d = parseInt(nums[0], 10); m = parseInt(nums[1], 10); y = parseInt(nums[2], 10);
  }
  if (!(m >= 1 && m <= 13) || !(d >= 1 && d <= 30) || !(y > 1900 && y < 2200)) return null;
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

/**
 * Extend a free-text contract end date by n rent-months.
 * Keeps the writing style: 'መጋቢት 30/2018' stays named, '30/07/2018' stays numeric.
 * Contract ends are set to day 30. Returns null if the text can't be parsed.
 */
export function extendEthText(text, n) {
  const p = parseEth(text);
  if (!p) return null;
  const r = addMonths({ y: p.y, m: p.m, d: 30 }, n);
  const named = Object.keys(ALIASES).some((k) => String(text).includes(k));
  return named
    ? fmtEth(r)
    : `${String(r.d).padStart(2, "0")}/${String(r.m).padStart(2, "0")}/${r.y}`;
}