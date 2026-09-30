import './styles.css';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { MONTHS, fmtEth, statusOf, todayEth, extendEthText } from "./ethiopianCalendar";
import ReceiptModal from "./pdf/ReceiptModal";

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------
const money = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US") + " ብር");
const errText = (err) => err?.message || "ስህተት ተፈጥሯል፤ እንደገና ሞክር።";

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

    setTenants(tRows.map((t) => ({
      id: t.id,
      name: t.name,
      room: t.room,
      floor: t.floor,
      phone: t.phone,
      status: t.status || "active",
      movedOutAt: t.moved_out_at || "",
      contractStart: t.contract_start,
      contractEnd: t.contract_end,
      prevContractEnd: t.prev_contract_end || null,
      payStartRaw: t.pay_start_raw ?? "",
      amt3: t.amt3 == null ? null : Number(t.amt3),
      amt6: t.amt6 == null ? null : Number(t.amt6),
      payEnd: t.pay_end_y == null ? null : { y: t.pay_end_y, m: t.pay_end_m, d: t.pay_end_d },
      payments: byTenant[t.id] || [],
    })));
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
// Small shared components
// ----------------------------------------------------------------------
function Field({ id, label, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function EthDateInputs({ form, set, monthOptions, children }) {
  return (
    <div>
      <select value={form.m} onChange={(e) => set("m", e.target.value)}>{monthOptions}</select>{" "}
      <input type="number" min="1" max="30" style={{ width: 66 }} value={form.d} onChange={(e) => set("d", e.target.value)} />{" "}
      <input type="number" min="1990" max="2100" style={{ width: 86 }} value={form.y} onChange={(e) => set("y", e.target.value)} />{" "}
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------
// Login
// ----------------------------------------------------------------------
function Login({ onDone }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError("የተሳሳተ ኢሜይል ወይም የይለፍ ቃል።");
    else onDone();
  }

  async function forgotPassword() {
    if (!email) { setError("መጀመሪያ ኢሜይልዎን ያስገቡ።"); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (error) setError(error.message);
    else setResetSent(true);
  }

  return (
    <div className="loginwrap">
      <form className="loginbox" onSubmit={submit} noValidate>
        <div className="login-mark" aria-hidden="true">🏢</div>
        <h1>በረካ ህንፃ</h1>
        <p className="sub">የተከራዮች መዝገብ ለማስተዳደር ግባ</p>
        <label htmlFor="email">ኢሜይል</label>
        <input id="email" type="email" autoComplete="username" required autoFocus
          value={email} onChange={(e) => { setEmail(e.target.value); setResetSent(false); }} />
        <label htmlFor="password">የይለፍ ቃል</label>
        <input id="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "..." : "ግባ"}</button>
        <button type="button" className="forgot" disabled={busy} onClick={forgotPassword}>የይለፍ ቃል ረሳህ?</button>
        {resetSent && <div className="hint" role="status">የመልሶ ማስጀመሪያ ሊንክ ወደ ኢሜይልዎ ተልኳል።</div>}
        {error && <div className="err" role="alert">{error}</div>}
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------
// Drawer (add / view / edit tenant)
// ----------------------------------------------------------------------
function Drawer({ tenant, mode, owner, floors, defaultFloor, onClose, onSaved, onFlash, onPaid }) {
  const isAdd = mode === "add";
  const t = tenant;
  const [form, setForm] = useState(() => {
    const today = todayEth();
    return isAdd
      ? { name: "", floor: defaultFloor || "", room: "", phone: "", contractStart: "", contractEnd: "",
          payStartRaw: "", amt3: "", amt6: "", y: today.y, m: today.m, d: today.d }
      : { name: t.name, floor: t.floor, room: t.room, phone: t.phone,
          contractStart: t.contractStart, contractEnd: t.contractEnd, payStartRaw: t.payStartRaw ?? "",
          amt3: t.amt3 ?? "", amt6: t.amt6 ?? "",
          y: t.payEnd?.y ?? today.y, m: t.payEnd?.m ?? today.m, d: t.payEnd?.d ?? today.d };
  });
  const [busy, setBusy] = useState(false);
  const [showMoveOut, setShowMoveOut] = useState(false);
  const [checkoutDate, setCheckoutDate] = useState("");
  const firstFieldRef = useRef(null);

  useEffect(() => { firstFieldRef.current?.focus(); }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const amountOrNull = (v) => (v === "" ? null : Number(v));
  const validDay = () => {
    const d = Number(form.d);
    if (d >= 1 && d <= 30) return true;
    onFlash("ቀን ከ1 እስከ 30 መሆን አለበት።", false);
    return false;
  };

  // Runs a Supabase call with busy state + uniform error handling.
  async function run(fn, onOk) {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (result.error) onFlash(errText(result.error), false);
    else onOk?.(result.data);
  }

  const saveInfo = () => run(
    () => supabase.from("tenants").update({
      name: form.name.trim(),
      floor: form.floor.trim(),
      room: form.room.trim(),
      phone: form.phone.replace(/\D/g, ""),
      contract_start: form.contractStart.trim(),
      contract_end: form.contractEnd.trim(),
      pay_start_raw: form.payStartRaw.trim(),
      amt3: amountOrNull(form.amt3),
      amt6: amountOrNull(form.amt6),
    }).eq("id", t.id),
    () => { onFlash("መረጃው ተስተካክሏል።", false); onSaved(); }
  );

  const saveDate = () => {
    if (!validDay()) return;
    return run(
      () => supabase.from("tenants")
        .update({ pay_end_y: Number(form.y), pay_end_m: Number(form.m), pay_end_d: Number(form.d) })
        .eq("id", t.id),
      () => { onFlash("ቀኑ ተስተካክሏል።", false); onSaved(); }
    );
  };

  const extendContract = (months) => {
    const newEnd = extendEthText(form.contractEnd, months);
    if (!newEnd) {
      onFlash("የውል ማብቂያ ቀን ቅርጸት አልታወቀም። መጀመሪያ ያስተካክሉ (ለምሳሌ፦ መጋቢት 30/2018)።", false);
      return;
    }
    return run(
      () => supabase.rpc("extend_tenant_contract", { p_tenant_id: t.id, p_new_end: newEnd }),
      () => {
        set("contractEnd", newEnd);
        // undoable=false: the toast Undo button only reverts payments, not contracts.
        onFlash(`ውሉ በ${months === 12 ? "1 ዓመት" : "6 ወር"} ተራዝሟል! (አዲስ ቀን: ${newEnd})`, false);
        onSaved();
      }
    );
  };

  const revertContract = () => run(
    () => supabase.rpc("revert_tenant_contract", { p_tenant_id: t.id }),
    (data) => {
      if (data?.contract_end) set("contractEnd", data.contract_end);
      onFlash("ውሉ ወደ ቀድሞው ተመልሷል።", false);
      onSaved();
    }
  );

  const recordPayment = (cycle) => run(
    () => supabase.rpc("record_payment", { p_tenant_id: t.id, p_cycle: cycle }),
    (data) => {
      onFlash(`${cycle} ወር ተመዝግቧል። አዲስ ማብቂያ ${fmtEth({ y: data.pay_end_y, m: data.pay_end_m, d: data.pay_end_d })}`, true, t.id);
      onSaved();
      onPaid(t);
    }
  );

  const revertLast = () => run(
    () => supabase.rpc("revert_last_payment", { p_tenant_id: t.id }),
    () => { onFlash("የመጨረሻው ክፍያ ተሰርዟል።", false); onSaved(); }
  );

  const handleMoveOut = () => run(
    () => supabase.from("tenants").update({
      status: "moved_out",
      moved_out_at: checkoutDate.trim(),
    }).eq("id", t.id),
    () => {
      setShowMoveOut(false);
      onFlash(`${t.name} ውል አቋርጦ ወጥቷል።`, false);
      onSaved();
      onClose();
    }
  );

  const createTenant = () => {
    const name = form.name.trim(), floor = form.floor.trim();
    if (!name || !floor) { onFlash("ስም እና ወለል ያስፈልጋሉ።", false); return; }
    if (!validDay()) return;
    return run(
      () => supabase.from("tenants").insert([{
        name, floor, room: form.room.trim(), phone: form.phone.replace(/\D/g, ""),
        contract_start: form.contractStart.trim(), contract_end: form.contractEnd.trim(),
        amt3: amountOrNull(form.amt3), amt6: amountOrNull(form.amt6),
        pay_end_y: Number(form.y), pay_end_m: Number(form.m), pay_end_d: Number(form.d),
        status: "active",
      }]),
      () => { onFlash(`${name} ተጨምሯል።`, false); onSaved(); onClose(); }
    );
  };

  const deleteTenant = () => {
    if (!window.confirm(`${t.name} እና ሁሉም የክፍያ ታሪኩ ሙሉ በሙሉ ይጥፋ? ይህ አይመለስም።\n\nምክር፦ መዝገቡን ለማቆየት "ወጥቷል (Move Out)" ይጠቀሙ።`)) return;
    return run(
      () => supabase.from("tenants").delete().eq("id", t.id),
      () => { onFlash(`${t.name} ከመዝገብ ጠፍቷል።`, false); onSaved(); onClose(); }
    );
  };

  const monthOptions = MONTHS.slice(0, 12).map((mn, i) => <option key={mn} value={i + 1}>{mn}</option>);
  const floorOptions = floors.filter((f) => f !== "all");
  const floorList = <datalist id="floorList">{floorOptions.map((f) => <option key={f} value={f} />)}</datalist>;

  // ---------------- Add mode ----------------
  if (isAdd) {
    return (
      <>
        <h2>አዲስ ተከራይ ጨምር</h2>
        <Field id="nName" label="ስም *"><input id="nName" ref={firstFieldRef} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field id="nFloor" label="ወለል *"><input id="nFloor" list="floorList" value={form.floor} onChange={(e) => set("floor", e.target.value)} /></Field>
        {floorList}
        <Field id="nRoom" label="ክፍል ቁጥር / ሱቅ"><input id="nRoom" value={form.room} onChange={(e) => set("room", e.target.value)} /></Field>
        <Field id="nPhone" label="ስልክ"><input id="nPhone" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field id="nCStart" label="ውል የጀመረበት"><input id="nCStart" placeholder="ለምሳሌ፦ መስከረም 01/2018" value={form.contractStart} onChange={(e) => set("contractStart", e.target.value)} /></Field>
        <Field id="nCEnd" label="ውል የሚያበቃበት"><input id="nCEnd" placeholder="ለምሳሌ፦ መስከረም 30/2019" value={form.contractEnd} onChange={(e) => set("contractEnd", e.target.value)} /></Field>
        <Field id="nAmt3" label="ክፍያ (3 ወር)"><input id="nAmt3" type="number" min="0" value={form.amt3} onChange={(e) => set("amt3", e.target.value)} /></Field>
        <Field id="nAmt6" label="ክፍያ (6 ወር)"><input id="nAmt6" type="number" min="0" value={form.amt6} onChange={(e) => set("amt6", e.target.value)} /></Field>
        <div className="field"><label>ክፍያ የሚያበቃበት</label>
          <EthDateInputs form={form} set={set} monthOptions={monthOptions} />
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy} onClick={createTenant}>ተከራይ ፍጠር</button>
      </>
    );
  }

  // ---------------- View / edit mode ----------------
  const s = statusOf(t.payEnd);
  const movedOut = t.status === "moved_out";
  return (
    <>
      <h2>{t.name}</h2>
      <div className="sub">{t.room || "—"} · {t.floor} · {t.phone ? "0" + t.phone : "ስልክ የለም"}</div>
      <p>
        <span className={`pill ${s.cls}`}>{s.label}</span>
        {movedOut && (
          <span className="pill" style={{ background: "#fee2e2", color: "#991b1b", marginLeft: 6 }}>
            ወጥቷል (Moved Out){t.movedOutAt ? ` · ${t.movedOutAt}` : ""}
          </span>
        )}
      </p>

      {owner ? (
        <>
          <Field id="edName" label="ስም"><input id="edName" ref={firstFieldRef} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field id="edRoom" label="ክፍል ቁጥር"><input id="edRoom" value={form.room} onChange={(e) => set("room", e.target.value)} /></Field>
          <Field id="edFloor" label="ወለል"><input id="edFloor" list="floorList" value={form.floor} onChange={(e) => set("floor", e.target.value)} /></Field>
          {floorList}
          <Field id="edPhone" label="ስልክ"><input id="edPhone" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field id="edCStart" label="ውል የጀመረበት"><input id="edCStart" value={form.contractStart} onChange={(e) => set("contractStart", e.target.value)} /></Field>
          <Field id="edCEnd" label="ውል የሚያበቃበት"><input id="edCEnd" value={form.contractEnd} onChange={(e) => set("contractEnd", e.target.value)} /></Field>
          <Field id="edPStart" label="ክፍያ የጀመረበት"><input id="edPStart" value={form.payStartRaw} onChange={(e) => set("payStartRaw", e.target.value)} /></Field>
          <Field id="edAmt3" label="ክፍያ (3 ወር)"><input id="edAmt3" type="number" min="0" value={form.amt3} onChange={(e) => set("amt3", e.target.value)} /></Field>
          <Field id="edAmt6" label="ክፍያ (6 ወር)"><input id="edAmt6" type="number" min="0" value={form.amt6} onChange={(e) => set("amt6", e.target.value)} /></Field>
          <button className="btn btn-primary" disabled={busy} onClick={saveInfo}>መረጃ አስቀምጥ</button>

          <div className="field" style={{ marginTop: 12 }}><label>ክፍያ የሚያበቃበት</label>
            <EthDateInputs form={form} set={set} monthOptions={monthOptions}>
              <button className="btn" disabled={busy} onClick={saveDate}>አስቀምጥ</button>
            </EthDateInputs>
          </div>

          <div className="pay drawer-actions" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {!movedOut && (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="paybtn" disabled={busy} onClick={() => recordPayment(3)}>3 ወር ተከፈለ</button>
                <button className="paybtn" disabled={busy} onClick={() => recordPayment(6)}>6 ወር ተከፈለ</button>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => extendContract(6)}>📅 የስድስት ወር ውል</button>
              <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => extendContract(12)}>📅 የአንድ አመት ውል</button>
            </div>

            {t.prevContractEnd && (
              <button className="btn" style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #f87171" }}
                disabled={busy} onClick={revertContract}>↩ የመጨረሻውን ውል ሰርዝ</button>
            )}

            {!movedOut && (
              <button className="btn" style={{ background: "#ef4444", color: "#fff", border: "none" }}
                disabled={busy} onClick={() => setShowMoveOut(true)}>ወጥቷል (Move Out)</button>
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

      {showMoveOut && (
        <div style={{ background: "var(--bg-secondary)", padding: 12, borderRadius: 8, marginTop: 12, border: "1px solid var(--border)" }}>
          <h4 style={{ margin: "0 0 8px 0", color: "var(--late)" }}>ተከራይ ውል አቋርጦ መውጣቱን ያረጋግጡ</h4>
          <div className="field">
            <label htmlFor="checkout">የወጡበት ቀን (የኢትዮጵያ አቆጣጠር)</label>
            <input id="checkout" placeholder="e.g. መጋቢት 12/2018" value={checkoutDate} onChange={(e) => setCheckoutDate(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" disabled={busy} onClick={handleMoveOut}>አዎ፣ ውል ጨርሶ ወጥቷል</button>
            <button className="btn" onClick={() => setShowMoveOut(false)}>ይቅር</button>
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
// Pay button (table row)
// ----------------------------------------------------------------------
function PayButton({ tenant, cycle, onFlash, onSaved, onPaid }) {
  const [busy, setBusy] = useState(false);
  const amt = cycle === 3 ? tenant.amt3 : tenant.amt6;

  async function click() {
    setBusy(true);
    const { data, error } = await supabase.rpc("record_payment", { p_tenant_id: tenant.id, p_cycle: cycle });
    setBusy(false);
    if (error) { onFlash(errText(error), false); return; }
    onFlash(`${tenant.name} · ${cycle} ወር ተመዝግቧል። አዲስ ማብቂያ ${fmtEth({ y: data.pay_end_y, m: data.pay_end_m, d: data.pay_end_d })}`, true, tenant.id);
    onSaved();
    onPaid(tenant);
  }

  return (
    <button className="paybtn" disabled={busy} onClick={click} title={amt != null ? money(amt) : "መጠን አልተመዘገበም"}>
      {cycle} ወር ተከፈለ
    </button>
  );
}

// ----------------------------------------------------------------------
// Main App
// ----------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(undefined);
  const [owner, setOwner] = useState(false);
  const { tenants, loading, error, reload } = useTenants();
  const [filters, setFilters] = useState({ floor: "all", status: "all", viewMode: "active", q: "" });
  const [drawer, setDrawer] = useState(null);
  const [toast, setToast] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [theme, setTheme] = useState("auto");
  const toastTimer = useRef(null);

  // Auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Owner = logged in AND listed in the `owners` table (RLS still enforces this server-side).
  useEffect(() => {
    if (!session) { setOwner(false); return; }
    let cancelled = false;
    supabase.from("owners").select("user_id").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setOwner(!!data); });
    return () => { cancelled = true; };
  }, [session]);

  // Theme
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "auto") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function flash(msg, undoable, tenantId) {
    setToast({ msg, undoable, tenantId });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  async function openReceipt(tenant) {
    const { data: latest, error } = await supabase
      .from("payments").select("*").eq("tenant_id", tenant.id)
      .order("recorded_at", { ascending: false }).limit(1).single();
    if (error || !latest) { flash("ደረሰኝ ማዘጋጀት አልተቻለም።", false); return; }
    setReceipt({
      tenant,
      payment: { total: latest.amount, receipt_no: "RCT-" + latest.id.slice(0, 8).toUpperCase() },
    });
  }

  const floors = useMemo(() => ["all", ...[...new Set(tenants.map((t) => t.floor))].sort()], [tenants]);

  const inFloorScope = useMemo(() => {
    const archive = filters.viewMode === "archive";
    return tenants.filter((t) =>
      (archive ? t.status === "moved_out" : t.status !== "moved_out") &&
      (filters.floor === "all" || t.floor === filters.floor));
  }, [tenants, filters.viewMode, filters.floor]);

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return inFloorScope.filter((t) => {
      if (filters.status !== "all" && statusOf(t.payEnd).key !== filters.status) return false;
      if (q && !`${t.name} ${t.room} ${t.phone}`.toLowerCase().includes(q)) return false;
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
      visible.map((t, i) => [i + 1, t.name, t.room, t.floor, t.phone, t.contractEnd, fmtEth(t.payEnd),
        statusOf(t.payEnd).label, t.amt3 || "", t.amt6 || ""]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    );
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "bereka-tenants.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function undoToast() {
    if (!toast?.undoable || !toast.tenantId) return;
    const { error } = await supabase.rpc("revert_last_payment", { p_tenant_id: toast.tenantId });
    if (error) flash(errText(error), false);
    else { setToast(null); reload(); }
  }

  const drawerTenant = drawer?.mode === "view" ? tenants.find((t) => t.id === drawer.tenantId) : null;
  useEffect(() => {
    if (!loading && drawer?.mode === "view" && !tenants.find((t) => t.id === drawer.tenantId)) setDrawer(null);
  }, [tenants, drawer, loading]);

  const today = todayEth();
  const showPayCol = owner && filters.viewMode === "active";

  if (session === undefined) return null;

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
                {owner ? "የባለቤት ሁነታ" : "የተመልካች ሁነታ"}
              </span>
            </div>
          </div>
          <div className="toolbtns">
            <button className="btn" onClick={exportCsv}>📥 CSV አውርድ</button>
            <button className="btn btn-ghost" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>🌓 ገጽታ</button>
            {session
              ? <button className="btn" onClick={() => supabase.auth.signOut()}>🚪 ውጣ</button>
              : <button className="btn btn-primary" onClick={() => setDrawer({ mode: "login" })}>🔐 የባለቤት መግቢያ</button>}
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

        <div className="controls" style={{ display: "flex", flexDirection: "column", gap: 12, background: "var(--panel)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div className="tabs" style={{ display: "flex", gap: 4 }}>
              {[["active", "🏢 ንቁ ተከራዮች (Active)"], ["archive", "📂 የቀድሞ ተከራዮች (Archive / Moved Out)"]].map(([k, label]) => (
                <button key={k} className="tab" aria-pressed={filters.viewMode === k}
                  onClick={() => setFilters((s) => ({ ...s, viewMode: k }))}
                  style={{ fontWeight: filters.viewMode === k ? "bold" : "normal" }}>
                  {label}
                </button>
              ))}
            </div>
            {owner && filters.viewMode === "active" && (
              <button className="btn btn-primary" onClick={() => setDrawer({ mode: "add" })}>+ አዲስ ተከራይ ጨምር</button>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
            <div className="tabs">
              {floors.map((f) => (
                <button key={f} className="tab" aria-pressed={filters.floor === f}
                  onClick={() => setFilters((s) => ({ ...s, floor: f }))}>
                  {f === "all" ? "ሁሉም ወለል" : f}
                </button>
              ))}
            </div>

            {filters.viewMode === "active" && (
              <div className="tabs">
                {[["all", "ሁሉም ሁኔታ"], ["late", "ያልተከፈለ"], ["soon", "ሊያልቅ የቀረበ"], ["paid", "የተከፈለ"]].map(([k, label]) => (
                  <button key={k} className="tab" aria-pressed={filters.status === k}
                    onClick={() => setFilters((s) => ({ ...s, status: k }))}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            <input className="search" type="search" placeholder="🔍 በስም፣ በክፍል ቁጥር ወይም በስልክ ፈልግ..."
              value={filters.q} onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))} style={{ minWidth: 260 }} />
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
                <th scope="col">{filters.viewMode === "archive" ? "የወጡበት ቀን" : "ክፍያ የሚያበቃበት ቀን"}</th>
                <th scope="col">ሁኔታ</th>
                <th scope="col">ውል የሚያበቃበት</th>
                {showPayCol && <th scope="col" style={{ textAlign: "left" }}>ክፍያ መዝግብ</th>}
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
                    </td>
                    <td data-label="ክፍል">{t.room || "—"}</td>
                    <td data-label="ወለል">{t.floor}</td>
                    <td className="money" data-label="ስልክ">
                      {t.phone ? <a className="link" href={`tel:0${t.phone}`}>0{t.phone}</a> : "—"}
                    </td>
                    <td data-label={filters.viewMode === "archive" ? "የወጡበት ቀን" : "ክፍያ የሚያበቃበት"}>
                      {filters.viewMode === "archive" ? (t.movedOutAt || "—") : fmtEth(t.payEnd)}
                    </td>
                    <td data-label="ሁኔታ"><span className={`pill ${s.cls}`}>{s.label}</span></td>
                    <td data-label="ውል የሚያበቃበት">{t.contractEnd || "—"}</td>
                    {showPayCol && (
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
          {!loading && visible.length === 0 && <div className="empty">በዚህ ማጣሪያ የተከራይ መዝገብ አልተገኘም።</div>}
        </div>

        <footer>ቀኖች በኢትዮጵያ ዘመን አቆጣጠር ናቸው። ወር = 30 ቀን ሆኖ ይሰላል።</footer>
      </div>

      {drawer && (
        <>
          <div className="scrim open" onClick={() => setDrawer(null)} />
          <aside className={`drawer open${drawer.mode === "login" ? " drawer-login" : ""}`} role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
            <button className="btn close" aria-label="ዝጋ" onClick={() => setDrawer(null)}>✕</button>
            <div>
              {drawer.mode === "login" && <Login onDone={() => setDrawer(null)} />}
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

      {receipt && <ReceiptModal tenant={receipt.tenant} payment={receipt.payment} onClose={() => setReceipt(null)} />}
    </div>
  );
}