import './styles.css'; 
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { MONTHS, fmtEth, statusOf, todayEth } from "./ethiopianCalendar";
import ReceiptModal from "./pdf/ReceiptModal";

function money(n) {
  return n == null ? "—" : Number(n).toLocaleString("en-US") + " ብር";
}

function errText(err) {
  return err?.message || "ስህተት ተፈጥሯል፤ እንደገና ሞክር።";
}

// ----------------------------------------------------------------------
// Ethiopian contract-date helpers (work on text like "ታህሳስ 14/2019")
// ----------------------------------------------------------------------
const normAm = (s) =>
  String(s || "")
    .replace(/[ሐኀ]/g, "ሀ").replace(/[ሕኅ]/g, "ህ")
    .replace(/ሠ/g, "ሰ").replace(/ሥ/g, "ስ").replace(/ሣ/g, "ሳ")
    .replace(/ዐ/g, "አ").replace(/ፀ/g, "ጸ")
    .replace(/\s+/g, "");

function parseContractDate(txt) {
  const m = String(txt || "").trim().match(/^(\D+?)\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})$/);
  if (!m) return null;
  const idx = MONTHS.slice(0, 12).findIndex((n) => normAm(n) === normAm(m[1]));
  if (idx < 0) return null;
  return { idx, d: Number(m[2]), y: Number(m[3]) };
}

function addMonthsToContract(txt, months) {
  const p = parseContractDate(txt);
  if (!p) return null;
  const total = p.y * 12 + p.idx + months;
  const idx = total % 12;
  const y = Math.floor(total / 12);
  const d = Math.min(p.d, 30); // every regular Ethiopian month has 30 days
  return `${MONTHS[idx]} ${String(d).padStart(2, "0")}/${y}`;
}

// ----------------------------------------------------------------------
// Data loading + realtime sync
// ----------------------------------------------------------------------
function useTenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const [{ data: tRows, error: tErr }, { data: pRows, error: pErr }] = await Promise.all([
      supabase.from("tenants").select("*").order("created_at", { ascending: true }),
      supabase.from("payments").select("*").order("recorded_at", { ascending: true }),
    ]);
    if (tErr || pErr) {
      setError(tErr || pErr);
      setLoading(false);
      return;
    }
    const byTenant = {};
    for (const p of pRows) (byTenant[p.tenant_id] ??= []).push(p);
    
    const merged = tRows.map((t) => {
      let floor = t.floor;
      let room = t.room;

      return {
        id: t.id,
        name: t.name,
        room: room,
        floor: floor,
        phone: t.phone,
        status: t.status || "active",
        contractStart: t.contract_start,
        contractEnd: t.contract_end,
        prevContractEnd: t.prev_contract_end || null,
        payStartRaw: t.pay_start_raw,
        amt3: t.amt3 == null ? null : Number(t.amt3),
        amt6: t.amt6 == null ? null : Number(t.amt6),
        payEnd: t.pay_end_y == null ? null : { y: t.pay_end_y, m: t.pay_end_m, d: t.pay_end_d },
        payments: byTenant[t.id] || [],
      };
    }); 
    setTenants(merged);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("tenant-register-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "tenants" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { tenants, loading, error, reload: load };
}

// ----------------------------------------------------------------------
// Login Component (Username & Password with Show/Hide & Forgot Password)
// ----------------------------------------------------------------------
const FLOOR_STYLES = {
  all:     { bg: "#334155", fg: "#FFFFFF" },
  "G-F":   { bg: "#1F3864", fg: "#FFFFFF" },
  "1-F":   { bg: "#1F6F5C", fg: "#FFFFFF" },
  "2-F":   { bg: "#2E7D4F", fg: "#FFFFFF" },
  "3-F":   { bg: "#6B3FA0", fg: "#FFFFFF" },
  "4-F":   { bg: "#0E7490", fg: "#FFFFFF" },
  "5-F":   { bg: "#C25E1B", fg: "#FFFFFF" },
  store:   { bg: "#F4E3C1", fg: "#5B3A0A" },
};
const FALLBACK_FLOOR = { bg: "#475569", fg: "#FFFFFF" };
const floorStyle = (f) => {
  const s = FLOOR_STYLES[f] || FALLBACK_FLOOR;
  return { "--c": s.bg, "--fg": s.fg };
};

const STATUS_STYLES = {
  all:  "#334155",
  late: "#BE123C",
  soon: "#B45309",
  paid: "#0F766E",
};

// ----------------------------------------------------------------------
// Password field with SVG show/hide icon (emoji icons often render blank on Windows)
// ----------------------------------------------------------------------
function PasswordField({ id, value, onChange, autoComplete, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "የይለፍ ቃል ደብቅ" : "የይለፍ ቃል አሳይ"}
        aria-pressed={show}
        title={show ? "የይለፍ ቃል ደብቅ" : "የይለፍ ቃል አሳይ"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {show ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------
// Login (Username & Password, Show/Hide, Forgot Password)
// ----------------------------------------------------------------------
function Login({ onDone }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null); setInfoMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: username.toLowerCase().trim(),
      password,
    });

    setBusy(false);
    if (error) setError("የተሳሳተ መግቢያ ስም ወይም የይለፍ ቃል አሉ።");
    else onDone();
  }

  async function handleForgotPassword() {
    const emailInput = username.toLowerCase().trim();
    if (!emailInput) {
      setError("እባክዎ በመጀመሪያ ኢሜይልዎን (መግቢያ ስም) ያስገቡ።");
      return;
    }
    setBusy(true); setError(null); setInfoMsg(null);

    const { error } = await supabase.auth.resetPasswordForEmail(emailInput, {
      redirectTo: window.location.origin,
    });

    setBusy(false);
    if (error) setError(errText(error));
    else setInfoMsg("የይለፍ ቃል መቀየሪያ ሊንክ ወደ ኢሜይልዎ ተልኳል። ኢሜይልዎን ይመልከቱ (Spam ጭምር)።");
  }

  return (
    <div className="loginwrap">
      <form className="loginbox" onSubmit={submit} noValidate>
        <div className="login-mark" aria-hidden="true">🏢</div>
        <h1>በረካ ህንፃ</h1>
        <p className="sub">ለመቀጠል መግቢያ ስምዎን እና የይለፍ ቃል ያስገቡ</p>

        <label htmlFor="username">መግቢያ ስም (Username / Email)</label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          required
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <label htmlFor="password">የይለፍ ቃል (Password)</label>
        <PasswordField
          id="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "..." : "ግባ (Login)"}
        </button>

        <button type="button" className="forgot" onClick={handleForgotPassword} disabled={busy}>
          የይለፍ ቃል ረስተዋል? (Forgot Password?)
        </button>

        {error && <div className="err" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        {infoMsg && <div className="info-ok" role="status">{infoMsg}</div>}
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------
// Set a new password (shown after the user opens the reset link in their email)
// ----------------------------------------------------------------------
function ResetPassword({ onDone }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (pw1.length < 6) { setError("የይለፍ ቃል ቢያንስ 6 ፊደል/ቁጥር መሆን አለበት።"); return; }
    if (pw1 !== pw2) { setError("ሁለቱ የይለፍ ቃሎች አይመሳሰሉም።"); return; }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);

    if (error) { setError(errText(error)); return; }
    window.history.replaceState(null, "", window.location.pathname);
    onDone();
  }

  return (
    <div className="loginwrap">
      <form className="loginbox" onSubmit={submit} noValidate>
        <div className="login-mark" aria-hidden="true">🔑</div>
        <h1>አዲስ የይለፍ ቃል</h1>
        <p className="sub">አዲስ የይለፍ ቃልዎን ያስገቡ</p>

        <label htmlFor="newpw">አዲስ የይለፍ ቃል</label>
        <PasswordField id="newpw" autoComplete="new-password" autoFocus value={pw1} onChange={(e) => setPw1(e.target.value)} />

        <label htmlFor="newpw2">የይለፍ ቃል ድገም</label>
        <PasswordField id="newpw2" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "..." : "አስቀምጥ (Save)"}
        </button>

        {error && <div className="err" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------
// Drawer Component
// ----------------------------------------------------------------------
function Drawer({ tenant, mode, owner, floors, defaultFloor, onClose, onSaved, onFlash, onPaid }) {
  const isAdd = mode === "add";
  const t = tenant;
  const [form, setForm] = useState(() =>
    isAdd
      ? { name: "", floor: defaultFloor || "", room: "", phone: "", contractStart: "", contractEnd: "",
          amt3: "", amt6: "", y: todayEth().y, m: todayEth().m, d: todayEth().d }
      : { name: t.name, floor: t.floor, room: t.room, phone: t.phone,
          contractStart: t.contractStart, contractEnd: t.contractEnd, payStartRaw: t.payStartRaw,
          amt3: t.amt3 ?? "", amt6: t.amt6 ?? "",
          y: t.payEnd?.y ?? todayEth().y, m: t.payEnd?.m ?? todayEth().m, d: t.payEnd?.d ?? todayEth().d }
  );
  const [busy, setBusy] = useState(false);
  const [showMoveOutModal, setShowMoveOutModal] = useState(false);
  const [checkoutDate, setCheckoutDate] = useState("");
  const firstFieldRef = useRef(null);
  
  useEffect(() => { firstFieldRef.current?.focus(); }, []);

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function saveInfo() {
    setBusy(true);
    const payload = {
      name: form.name.trim(), 
      floor: form.floor.trim(), 
      room: form.room.trim(),
      phone: form.phone.replace(/\D/g, ""),
      contract_start: form.contractStart.trim(), 
      contract_end: form.contractEnd.trim(), 
      pay_start_raw: form.payStartRaw?.trim() ?? "",
      amt3: form.amt3 === "" ? null : Number(form.amt3),
      amt6: form.amt6 === "" ? null : Number(form.amt6),
    };
    const { error } = await supabase.from("tenants").update(payload).eq("id", t.id);
    setBusy(false);
    if (error) onFlash(errText(error), false);
    else { onFlash("መረጃው ተስተካክሏል።", false); onSaved(); }
  }

  async function extendContract(monthsToAdd) {
    const current = (t.contractEnd || "").trim();
    if (!current) {
      onFlash("የውል ማብቂያ ቀን አልተመዘገበም። መጀመሪያ 'ውል የሚያበቃበት' ያስገቡ።", false);
      return;
    }
    const newEnd = addMonthsToContract(current, monthsToAdd);
    if (!newEnd) {
      onFlash(`የውል ማብቂያ ቀን "${current}" ሊነበብ አልቻለም። ቅርጸቱ "ወር ቀን/ዓመት" መሆን አለበት (ለምሳሌ፦ ታህሳስ 14/2019)።`, false);
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("tenants")
      .update({ contract_end: newEnd, prev_contract_end: current })
      .eq("id", t.id);
    setBusy(false);
    if (error) {
      onFlash(errText(error), false);
    } else {
      // undoable=false: the toast "መልስ" button only undoes payments, never contracts
      onFlash(`ውሉ በ${monthsToAdd === 12 ? "1 ዓመት" : "6 ወር"} ተራዝሟል → ${newEnd}`, false);
      onSaved();
    }
  }

  async function revertContract() {
    if (!t.prevContractEnd) return;
    if (!window.confirm(`የመጨረሻው ውል ይሰረዝ? ውሉ ወደ "${t.prevContractEnd}" ይመለሳል።`)) return;
    setBusy(true);
    const { error } = await supabase
      .from("tenants")
      .update({ contract_end: t.prevContractEnd, prev_contract_end: null })
      .eq("id", t.id);
    setBusy(false);
    if (error) {
      onFlash(errText(error), false);
    } else {
      onFlash("ውሉ ወደ ነበረበት ተመልሷል።", false);
      onSaved();
    }
  }

  async function handleMoveOut() {
    setBusy(true);
    const { error } = await supabase.from("tenants").update({
      status: "moved_out",
      room: t.room ? `${t.room} (ባዶ/ነጻ)` : "ባዶ/ነጻ"
    }).eq("id", t.id);
    setBusy(false);
    setShowMoveOutModal(false);
    if (error) {
      onFlash(errText(error), false);
    } else {
      onFlash(`${t.name} ውል አቋርጦ ወጥቷል። (ክፍሉ ነጻ ሆኗል)`, false);
      onSaved();
      onClose();
    }
  }

  async function saveDate() {
    setBusy(true);
    const d = Number(form.d);
    if (!(d >= 1 && d <= 30)) { setBusy(false); onFlash("ቀን ከ1 እስከ 30 መሆን አለበት።", false); return; }
    const { error } = await supabase.from("tenants")
      .update({ pay_end_y: Number(form.y), pay_end_m: Number(form.m), pay_end_d: d })
      .eq("id", t.id);
    setBusy(false);
    if (error) onFlash(errText(error), false);
    else { onFlash("ቀኑ ተስተካክሏል።", false); onSaved(); }
  }

  async function recordPayment(cycle) {
    setBusy(true);
    const { data, error } = await supabase.rpc("record_payment", { p_tenant_id: t.id, p_cycle: cycle });
    setBusy(false);
    if (error) onFlash(errText(error), false);
    else {
      onFlash(`${cycle} ወር ተመዝግቧል። አዲስ ማብቂያ ${fmtEth({ y: data.pay_end_y, m: data.pay_end_m, d: data.pay_end_d })}`, true, t.id);
      onSaved();
      onPaid(t);
    }
  }

  async function revertLast() {
    setBusy(true);
    const { error } = await supabase.rpc("revert_last_payment", { p_tenant_id: t.id });
    setBusy(false);
    if (error) onFlash(errText(error), false);
    else { onFlash("የመጨረሻው ክፍያ ተሰርዟል።", false); onSaved(); }
  }

  async function createTenant() {
    setBusy(true);
    const name = form.name.trim(), floor = form.floor.trim();
    if (!name || !floor) { setBusy(false); onFlash("ስም እና ወለል ያስፈልጋሉ።", false); return; }
    const d = Number(form.d);
    if (!(d >= 1 && d <= 30)) { setBusy(false); onFlash("ቀን ከ1 እስከ 30 መሆን አለበት።", false); return; }
    const payload = {
      name, floor, room: form.room.trim(), phone: form.phone.replace(/\D/g, ""),
      contract_start: form.contractStart.trim(), contract_end: form.contractEnd.trim(),
      amt3: form.amt3 === "" ? null : Number(form.amt3),
      amt6: form.amt6 === "" ? null : Number(form.amt6),
      pay_end_y: Number(form.y), pay_end_m: Number(form.m), pay_end_d: d,
      status: "active",
    };
    const { error } = await supabase.from("tenants").insert([payload]);
    setBusy(false);
    if (error) onFlash(errText(error), false);
    else { onFlash(`${name} ተጨምሯል።`, false); onSaved(); onClose(); }
  }

  async function deleteTenant() {
    if (!window.confirm(`${t.name} ከመዝገብ ሙሉ በሙሉ ይጥፋ?`)) return;
    setBusy(true);
    const { error } = await supabase.from("tenants").delete().eq("id", t.id);
    setBusy(false);
    if (error) onFlash(errText(error), false);
    else { onFlash(`${t.name} ከመዝገብ ጠፍቷል።`, false); onSaved(); onClose(); }
  }

  const monthOptions = MONTHS.slice(0, 12).map((mn, i) => (
    <option key={mn} value={i + 1}>{mn}</option>
  ));
  const floorOptions = floors.filter((f) => f !== "all");

  if (isAdd) {
    return (
      <>
        <h2>አዲስ ተከራይ ጨምር</h2>
        <div className="field"><label htmlFor="nName">ስም *</label>
          <input id="nName" ref={firstFieldRef} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="field"><label htmlFor="nFloor">ወለል *</label>
          <input id="nFloor" list="floorList" value={form.floor} onChange={(e) => set("floor", e.target.value)} /></div>
        <datalist id="floorList">{floorOptions.map((f) => <option key={f} value={f} />)}</datalist>
        <div className="field"><label htmlFor="nRoom">ክፍል ቁጥር / ሱቅ</label>
          <input id="nRoom" value={form.room} onChange={(e) => set("room", e.target.value)} /></div>
        <div className="field"><label htmlFor="nPhone">ስልክ</label>
          <input id="nPhone" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div className="field"><label htmlFor="nCStart">ውል የጀመረበት</label>
          <input id="nCStart" placeholder="ለምሳሌ፦ መስከረም 01/2019" value={form.contractStart} onChange={(e) => set("contractStart", e.target.value)} /></div>
        <div className="field"><label htmlFor="nCEnd">ውል የሚያበቃበት</label>
          <input id="nCEnd" value={form.contractEnd} onChange={(e) => set("contractEnd", e.target.value)} /></div>
        <div className="field"><label htmlFor="nAmt3">ክፍያ (3 ወር)</label>
          <input id="nAmt3" type="number" value={form.amt3} onChange={(e) => set("amt3", e.target.value)} /></div>
        <div className="field"><label htmlFor="nAmt6">ክፍያ (6 ወር)</label>
          <input id="nAmt6" type="number" value={form.amt6} onChange={(e) => set("amt6", e.target.value)} /></div>
        <div className="field"><label>ክፍያ የሚያበቃበት</label>
          <div>
            <select value={form.m} onChange={(e) => set("m", e.target.value)}>{monthOptions}</select>{" "}
            <input type="number" min="1" max="30" style={{ width: 66 }} value={form.d} onChange={(e) => set("d", e.target.value)} />{" "}
            <input type="number" min="1990" max="2100" style={{ width: 86 }} value={form.y} onChange={(e) => set("y", e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy} onClick={createTenant}>ተከራይ ፍጠር</button>
      </>
    );
  }

  const s = statusOf(t.payEnd);
  return (
    <>
      <h2>{t.name}</h2>
      <div className="sub">{t.room || "—"} · {t.floor} · {t.phone ? "0" + t.phone : "ስልክ የለም"}</div>
      <p>
        <span className={`pill ${s.cls}`}>{s.label}</span>
        {t.status === "moved_out" && <span className="pill" style={{ background: "#fee2e2", color: "#991b1b", marginLeft: 6 }}>ወጥቷል (Moved Out)</span>}
      </p>

      {owner ? (
        <>
          <div className="field"><label htmlFor="edName">ስም</label>
            <input id="edName" ref={firstFieldRef} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="field"><label htmlFor="edRoom">ክፍል ቁጥር</label>
            <input id="edRoom" value={form.room} onChange={(e) => set("room", e.target.value)} /></div>
          <div className="field"><label htmlFor="edFloor">ወለል</label>
            <input id="edFloor" list="floorList" value={form.floor} onChange={(e) => set("floor", e.target.value)} /></div>
          <datalist id="floorList">{floorOptions.map((f) => <option key={f} value={f} />)}</datalist>
          <div className="field"><label htmlFor="edPhone">ስልክ</label>
            <input id="edPhone" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <button className="btn" disabled={busy} onClick={saveInfo}>መረጃ አስቀምጥ</button>

          <div className="field"><label htmlFor="edCStart">ውል የጀመረበት</label>
            <input id="edCStart" value={form.contractStart} onChange={(e) => set("contractStart", e.target.value)} /></div>
          <div className="field"><label htmlFor="edCEnd">ውል የሚያበቃበት</label>
            <input id="edCEnd" value={form.contractEnd} onChange={(e) => set("contractEnd", e.target.value)} /></div>
          <div className="field"><label htmlFor="edPStart">ክፍያ የጀመረበት</label>
            <input id="edPStart" value={form.payStartRaw} onChange={(e) => set("payStartRaw", e.target.value)} /></div>
          <div className="field"><label htmlFor="edAmt3">ክፍያ (3 ወር)</label>
            <input id="edAmt3" type="number" value={form.amt3} onChange={(e) => set("amt3", e.target.value)} /></div>
          <div className="field"><label htmlFor="edAmt6">ክፍያ (6 ወር)</label>
            <input id="edAmt6" type="number" value={form.amt6} onChange={(e) => set("amt6", e.target.value)} /></div>
          <div className="field"><label>ክፍያ የሚያበቃበት</label>
            <div>
              <select value={form.m} onChange={(e) => set("m", e.target.value)}>{monthOptions}</select>{" "}
              <input type="number" min="1" max="30" style={{ width: 66 }} value={form.d} onChange={(e) => set("d", e.target.value)} />{" "}
              <input type="number" min="1990" max="2100" style={{ width: 86 }} value={form.y} onChange={(e) => set("y", e.target.value)} />{" "}
              <button className="btn" disabled={busy} onClick={saveDate}>አስቀምጥ</button>
            </div>
          </div>

          <div className="pay drawer-actions" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="paybtn" disabled={busy} onClick={() => recordPayment(3)}>3 ወር ተከፈለ</button>
              <button className="paybtn" disabled={busy} onClick={() => recordPayment(6)}>6 ወር ተከፈለ</button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={{ flex: 1, background: "var(--bg-secondary)", border: "1px solid var(--border)" }} disabled={busy} onClick={() => extendContract(6)}>
                📅 የስድስት ወር ውል
              </button>
              <button className="btn" style={{ flex: 1, background: "var(--bg-secondary)", border: "1px solid var(--border)" }} disabled={busy} onClick={() => extendContract(12)}>
                📅 የአንድ አመት ውል
              </button>
            </div>
            {t.prevContractEnd && (
              <button className="btn" style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #f87171" }} disabled={busy} onClick={revertContract}>
                ↩ የመጨረሻውን ውል ሰርዝ
              </button>
            )}

            {t.status !== "moved_out" && (
              <button className="btn" style={{ background: "#ef4444", color: "#fff", border: "none" }} disabled={busy} onClick={() => setShowMoveOutModal(true)}>
                ወጥቷል (Move Out)
              </button>
            )}
            {t.payments.length > 0 && (
              <button className="btn" disabled={busy} onClick={revertLast}>የመጨረሻውን ክፍያ ሰርዝ</button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="field"><span className="muted">ውል የጀመረበት</span><span>{t.contractStart || "—"}</span></div>
          <div className="field"><span className="muted">ውል የሚያበቃበት</span><span>{t.contractEnd || "—"}</span></div>
          <div className="field"><span className="muted">ክፍያ (3 ወር)</span><span className="money">{money(t.amt3)}</span></div>
          <div className="field"><span className="muted">ክፍያ (6 ወር)</span><span className="money">{money(t.amt6)}</span></div>
        </>
      )}

      {showMoveOutModal && (
        <div style={{ background: "var(--bg-secondary)", padding: 12, borderRadius: 8, marginTop: 12, border: "1px solid var(--border)" }}>
          <h4 style={{ margin: "0 0 8px 0", color: "var(--late)" }}>ተከራይ ውል አቋርጦ መውጣቱን ያረጋግጡ</h4>
          <div className="field">
            <label>የወጡበት ቀን (የኢትዮጵያ አቆጣጠር)</label>
            <input placeholder="ለምሳሌ፦ መጋቢት 12/2019" value={checkoutDate} onChange={(e) => setCheckoutDate(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" disabled={busy} onClick={handleMoveOut}>አዎ፣ ውል ጨርሶ ወጥቷል</button>
            <button className="btn" onClick={() => setShowMoveOutModal(false)}>ይቅር</button>
          </div>
        </div>
      )}

      <div className="hist">
        <h3>የክፍያ ታሪክ</h3>
        {t.payments.length === 0 ? (
          <p className="muted small">እስካሁን የተመዘገበ ክፍያ የለም።</p>
        ) : (
          <ul>
            {[...t.payments].reverse().map((p) => (
              <li key={p.id}>
                <span><b>{p.cycle} ወር</b> · {money(p.amount)}</span>
                <span className="muted small" style={{ textAlign: "right" }}>
                  {fmtEth({ y: p.from_y, m: p.from_m, d: p.from_d })} → {fmtEth({ y: p.to_y, m: p.to_m, d: p.to_d })}
                  <br />
                  {"የተመዘገበው "}{new Date(p.recorded_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {owner && (
        <button className="btn" style={{ marginTop: 16, color: "var(--late)" }} disabled={busy} onClick={deleteTenant}>
          ተከራይ ከመዝገብ ሰርዝ (Delete)
        </button>
      )}
    </>
  );
}

// ----------------------------------------------------------------------
// Main App Component
// ----------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(undefined);
  const [userRole, setUserRole] = useState("viewer");
  const { tenants, loading, error, reload } = useTenants();
  const [filters, setFilters] = useState({ floor: "all", status: "all", viewMode: "active", q: "" });
  const [drawer, setDrawer] = useState(null);
  const [toast, setToast] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [theme, setTheme] = useState("auto");
  const [recovery, setRecovery] = useState(() => /type=recovery/.test(window.location.hash));
  const toastTimer = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const { data: profile } = await supabase
          .from("app_users")
          .select("role")
          .eq("id", data.session.user.id)
          .single();
        if (profile) setUserRole(profile.role);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
      if (s) {
        const { data: profile } = await supabase
          .from("app_users")
          .select("role")
          .eq("id", s.user.id)
          .single();
        if (profile) setUserRole(profile.role);
      } else {
        setUserRole("viewer");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "auto") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);

  const owner = !!session && userRole === "owner";

  function flash(msg, undoable, tenantId) {
    setToast({ msg, undoable, tenantId });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  async function openReceipt(tenant) {
    const { data: latest, error } = await supabase
      .from("payments")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !latest) {
      flash("ደረሰኝ ማዘጋጀት አልተቻለም።", false);
      return;
    }
    setReceipt({
      tenant,
      payment: {
        total: latest.amount,
        receipt_no: "RCT-" + latest.id.slice(0, 8).toUpperCase(),
      },
    });
  }

  const floors = useMemo(() => {
    const set = new Set(tenants.map((t) => t.floor));
    return ["all", ...[...set].sort()];
  }, [tenants]);

  const scopedByViewMode = useMemo(() => {
    if (filters.viewMode === "archive") {
      return tenants.filter((t) => t.status === "moved_out");
    }
    return tenants.filter((t) => t.status !== "moved_out");
  }, [tenants, filters.viewMode]);

  const inFloorScope = useMemo(
    () => scopedByViewMode.filter((t) => filters.floor === "all" || t.floor === filters.floor),
    [scopedByViewMode, filters.floor]
  );

  const visible = useMemo(() => {
    const q = filters.q.toLowerCase();
    return inFloorScope.filter((t) => {
      const s = statusOf(t.payEnd);
      if (filters.status !== "all" && s.key !== filters.status) return false;
      if (q && !(`${t.name} ${t.room} ${t.phone}`).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inFloorScope, filters.status, filters.q]);

  const stats = useMemo(() => {
    let late = 0, soon = 0, paid = 0, expected = 0;
    for (const t of inFloorScope) {
      const k = statusOf(t.payEnd).key;
      if (k === "late") late++; else if (k === "soon") soon++; else if (k === "paid") paid++;
      expected += t.amt3 ?? t.amt6 ?? 0;
    }
    return { count: inFloorScope.length, late, soon, paid, expected };
  }, [inFloorScope]);

  function exportCsv() {
    const head = ["ተ.ቁ", "ስም", "ክፍል", "ወለል", "ስልክ", "ውል የሚያበቃበት", "ክፍያ የሚያበቃበት", "ሁኔታ", "ክፍያ 3 ወር", "ክፍያ 6 ወር"];
    const lines = [head.join(",")].concat(
      visible.map((t, i) => {
        const s = statusOf(t.payEnd);
        return [i + 1, t.name, t.room, t.floor, t.phone, t.contractEnd, fmtEth(t.payEnd), s.label, t.amt3 || "", t.amt6 || ""]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
      })
    );
    const csv = "\ufeff" + lines.join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "bereka-tenants.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  async function undoToast() {
    if (!toast?.undoable || !toast.tenantId) return;
    const { error } = await supabase.rpc("revert_last_payment", { p_tenant_id: toast.tenantId });
    if (error) flash(errText(error), false);
    else setToast(null);
  }

  const drawerTenant = drawer?.mode === "view" ? tenants.find((t) => t.id === drawer.tenantId) : null;
  useEffect(() => {
    if (drawer?.mode === "view" && !tenants.find((t) => t.id === drawer.tenantId)) setDrawer(null);
  }, [tenants, drawer]);

  const today = todayEth();

  if (session === undefined) return null;

  if (!session) {
    return <Login onDone={() => window.location.reload()} />;
  }

  if (recovery) {
    return <ResetPassword onDone={() => setRecovery(false)} />;
  }

  return (
    <div>
      <div className="wrap">
        <header className="top" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1.5rem" }}>🏢</span>
              <h1>በረካ ህንፃ — የተከራዮች መዝገብ</h1>
            </div>
            <div className="sub" style={{ marginTop: 4 }}>
              ዛሬ <b>{fmtEth(today)} ዓ.ም</b> · አጠቃላይ የህንፃ ንብረት እና ተከራዮች አስተዳደር።
              <span className={`pill ${owner ? "ok" : "none"}`} style={{ marginInlineStart: 6 }}>
                {owner ? "የባለቤት ሁነታ (Owner)" : "የተመልካች ሁነታ (Viewer)"}
              </span>
            </div>
          </div>
          <div className="toolbtns">
            <button className="btn" onClick={exportCsv}>📥 CSV አውርድ</button>
            <button className="btn btn-ghost" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>🌓 ገጽታ</button>
            <button className="btn btn-logout" onClick={() => supabase.auth.signOut()}>ውጣ</button>
          </div>
        </header>

        {error && <div className="err" role="alert">መረጃ መጫን አልተቻለም፦ {errText(error)}</div>}

        <section className="stats">
          <div className="stat"><b>{stats.count}</b><span>{filters.viewMode === "archive" ? "የቀድሞ ተከራዮች" : "ንቁ ተከራዮች"}</span></div>
          <div className="stat"><b>{stats.late}</b><span>ያልተከፈለ</span></div>
          <div className="stat"><b>{stats.soon}</b><span>በ30 ቀን ውስጥ ያልቃል</span></div>
          <div className="stat"><b>{stats.paid}</b><span>የተከፈለ</span></div>
          <div className="stat accent"><b>{money(stats.expected)}</b><span>በአንድ ዙር የሚጠበቅ</span></div>
        </section>

        <div className="filterbar">
          <div className="filterrow">
            <div className="chips" role="group" aria-label="እይታ">
              <button type="button" className="chip" style={{ "--c": "#1F3864" }}
                aria-pressed={filters.viewMode === "active"}
                onClick={() => setFilters((s) => ({ ...s, viewMode: "active" }))}>
                ንቁ ተከራዮች (Active)
              </button>
              <button type="button" className="chip" style={{ "--c": "#8A5A2B" }}
                aria-pressed={filters.viewMode === "archive"}
                onClick={() => setFilters((s) => ({ ...s, viewMode: "archive" }))}>
                የቀድሞ ተከራዮች (Archive / Moved Out)
              </button>
            </div>

            {owner && filters.viewMode === "active" && (
              <button type="button" className="btn btn-primary btn-add" onClick={() => setDrawer({ mode: "add" })}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                አዲስ ተከራይ ጨምር
              </button>
            )}
          </div>

          <div className="filterrow">
            <div className="chips" role="group" aria-label="ወለል">
              {floors.map((f) => (
                <button key={f} type="button" className="chip" style={floorStyle(f)}
                  aria-pressed={filters.floor === f}
                  onClick={() => setFilters((s) => ({ ...s, floor: f }))}>
                  {f === "all" ? "ሁሉም ወለል" : f}
                </button>
              ))}
            </div>

            {filters.viewMode === "active" && (
              <div className="chips" role="group" aria-label="ሁኔታ">
                {[["all", "ሁሉም ሁኔታ"], ["late", "ያልተከፈለ"], ["soon", "ሊያልቅ የቀረበ"], ["paid", "የተከፈለ"]].map(([k, label]) => (
                  <button key={k} type="button" className="chip" style={{ "--c": STATUS_STYLES[k] }}
                    aria-pressed={filters.status === k}
                    onClick={() => setFilters((s) => ({ ...s, status: k }))}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="searchbox">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input className="search" type="search" aria-label="ፈልግ"
                placeholder="በስም፣ በክፍል ቁጥር ወይም በስልክ ፈልግ..."
                value={filters.q} onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="tablecard" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th scope="col">ተ.ቁ</th>
                <th scope="col">ስም</th>
                <th scope="col">ክፍል / ሱቅ</th>
                <th scope="col">ወለል</th>
                <th scope="col">ስልክ</th>
                <th scope="col">ክፍያ የሚያበቃበት ቀን</th>
                <th scope="col">ሁኔታ</th>
                <th scope="col">ውል የሚያበቃበት</th>
                {owner && filters.viewMode === "active" && <th scope="col" style={{ textAlign: "left" }}>ክፍያ መዝግብ</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((t, i) => {
                const s = statusOf(t.payEnd);
                return (
                  <tr className="row" key={t.id}>
                    <td data-label="ተ.ቁ">{i + 1}</td>
                    <td className="name" data-label="ስም">
                      <button className="link" onClick={() => setDrawer({ mode: "view", tenantId: t.id })}>{t.name}</button>
                      {t.status === "moved_out" && <span style={{ fontSize: "0.75rem", color: "var(--late)", marginLeft: 6 }}>(ወጥቷል)</span>}
                    </td>
                    <td data-label="ክፍል">{t.room || "—"}</td>
                    <td data-label="ወለል">{t.floor}</td>
                    <td className="money" data-label="ስልክ">
                      {t.phone ? <a className="link" href={`tel:0${t.phone}`}>0{t.phone}</a> : "—"}
                    </td>
                    <td data-label="ክፍያ የሚያበቃበት">{fmtEth(t.payEnd)}</td>
                    <td data-label="ሁኔታ">
                      <span className={`pill ${s.cls}`}>{s.label}</span>
                    </td>
                    <td data-label="ውል የሚያበቃበት">{t.contractEnd || "—"}</td>
                    {owner && filters.viewMode === "active" && (
                      <td>
                        <div className="pay">
                          <PayButton tenant={t} cycle={3} onFlash={flash} onSaved={reload} onPaid={openReceipt} />
                          <PayButton tenant={t} cycle={6} onFlash={flash} onSaved={reload} onPaid={openReceipt} />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && visible.length === 0 && (
            <div className="empty">በዚህ ማጣሪያ የተከራይ መዝገብ አልተገኘም።</div>
          )}
        </div>

        <footer>ቀኖች በኢትዮጵያ ዘመን አቆጣጠር ናቸው። ወር = 30 ቀን ሆኖ ይሰላል።</footer>
      </div>

      {drawer && (
        <>
          <div className="scrim open" onClick={() => setDrawer(null)} />
          <aside className={`drawer open`} role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
            <button className="btn close" aria-label="ዝጋ" onClick={() => setDrawer(null)}>✕</button>
            <div>
              {drawer.mode === "add" && (
                <Drawer mode="add" owner={owner} floors={floors}
                  defaultFloor={filters.floor !== "all" ? filters.floor : floors[1]}
                  onClose={() => setDrawer(null)} onSaved={reload} onFlash={flash} onPaid={openReceipt} />
              )}
              {drawer.mode === "view" && drawerTenant && (
                <Drawer mode="view" tenant={drawerTenant} owner={owner} floors={floors}
                  onClose={() => setDrawer(null)} onSaved={reload} onFlash={flash} onPaid={openReceipt} />
              )}
            </div>
          </aside>
        </>
      )}

      {toast && (
        <div className="toast show" role="status" aria-live="polite">
          <span>{toast.msg}</span>
          {toast.undoable && <button onClick={undoToast}>መልስ</button>}
        </div>
      )}

      {receipt && (
        <ReceiptModal tenant={receipt.tenant} payment={receipt.payment} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}

function PayButton({ tenant, cycle, onFlash, onSaved, onPaid }) {
  const [busy, setBusy] = useState(false);
  const amt = cycle === 3 ? tenant.amt3 : tenant.amt6;
  async function click() {
    setBusy(true);
    const { data, error } = await supabase.rpc("record_payment", { p_tenant_id: tenant.id, p_cycle: cycle });
    setBusy(false);
    if (error) onFlash(errText(error), false);
    else {
      onFlash(`${tenant.name} · ${cycle} ወር ተመዝግቧል። አዲስ ማብቂያ ${fmtEth({ y: data.pay_end_y, m: data.pay_end_m, d: data.pay_end_d })}`, true, tenant.id);
      onSaved();
      onPaid(tenant);
    }
  }
  return (
    <button className="paybtn" disabled={busy} onClick={click} title={amt != null ? money(amt) : "መጠን አልተመዘገበም"}>
      {cycle} ወር ተከፈለ
    </button>
  );
}