import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { MONTHS, fmtEth, statusOf, todayEth } from "./ethiopianCalendar";

function money(n) {
  return n == null ? "—" : Number(n).toLocaleString("en-US") + " ብር";
}

function errText(err) {
  return err?.message || "ስህተት ተፈጥሯል፤ እንደገና ሞክር።";
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
    const merged = tRows.map((t) => ({
      id: t.id,
      name: t.name,
      room: t.room,
      floor: t.floor,
      phone: t.phone,
      contractStart: t.contract_start,
      contractEnd: t.contract_end,
      payStartRaw: t.pay_start_raw,
      amt3: t.amt3 == null ? null : Number(t.amt3),
      amt6: t.amt6 == null ? null : Number(t.amt6),
      payEnd: t.pay_end_y == null ? null : { y: t.pay_end_y, m: t.pay_end_m, d: t.pay_end_d },
      payments: byTenant[t.id] || [],
    }));
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
// Login
// ----------------------------------------------------------------------
function Login({ onDone }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError("የተሳሳተ ኢሜይል ወይም የይለፍ ቃል።");
    else onDone();
  }

  return (
    <div className="loginwrap">
      <form className="loginbox" onSubmit={submit} noValidate>
        <h1>በረካ ህንፃ</h1>
        <p className="sub">የተከራዮች መዝገብ ለማስተዳደር ግባ</p>
        <label htmlFor="email">ኢሜይል</label>
        <input id="email" type="email" autoComplete="username" required autoFocus
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">የይለፍ ቃል</label>
        <input id="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "..." : "ግባ"}
        </button>
        {error && <div className="err" role="alert">{error}</div>}
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------
// Drawer: view (everyone) / edit (owner) / add new tenant (owner)
// ----------------------------------------------------------------------
function Drawer({ tenant, mode, owner, floors, defaultFloor, onClose, onSaved, onFlash }) {
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
  const firstFieldRef = useRef(null);
  useEffect(() => { firstFieldRef.current?.focus(); }, []);

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function saveInfo() {
    setBusy(true);
    const payload = {
      name: form.name.trim(), floor: form.floor.trim(), room: form.room.trim(),
      phone: form.phone.replace(/\D/g, ""),
      contract_start: form.contractStart.trim(), contract_end: form.contractEnd.trim(),
      pay_start_raw: form.payStartRaw?.trim() ?? "",
      amt3: form.amt3 === "" ? null : Number(form.amt3),
      amt6: form.amt6 === "" ? null : Number(form.amt6),
    };
    const { error } = await supabase.from("tenants").update(payload).eq("id", t.id);
    setBusy(false);
    if (error) onFlash(errText(error), false);
    else { onFlash("መረጃው ተስተካክሏል።", false); onSaved(); }
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
    };
    const { error } = await supabase.from("tenants").insert([payload]);
    setBusy(false);
    if (error) onFlash(errText(error), false);
    else { onFlash(`${name} ተጨምሯል።`, false); onSaved(); onClose(); }
  }

  async function deleteTenant() {
    if (!window.confirm(`${t.name} ከመዝገብ ይጥፋ?`)) return;
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
        <div className="field"><label htmlFor="nRoom">ክፍል ቁጥር</label>
          <input id="nRoom" value={form.room} onChange={(e) => set("room", e.target.value)} /></div>
        <div className="field"><label htmlFor="nPhone">ስልክ</label>
          <input id="nPhone" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div className="field"><label htmlFor="nCStart">ውል የጀመረበት</label>
          <input id="nCStart" placeholder="ለምሳሌ፦ መስከረም 01/2018" value={form.contractStart} onChange={(e) => set("contractStart", e.target.value)} /></div>
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
      <p><span className={`pill ${s.cls}`}>{s.label}</span></p>

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

          <div className="pay" style={{ marginTop: 12, gap: 8 }}>
            <button className="paybtn" disabled={busy} onClick={() => recordPayment(3)}>3 ወር ተከፈለ</button>
            <button className="paybtn" disabled={busy} onClick={() => recordPayment(6)}>6 ወር ተከፈለ</button>
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

      <div className="hist">
        <b>የክፍያ ታሪክ</b>
        {t.payments.length === 0 ? (
          <p className="muted small">እስካሁን የተመዘገበ ክፍያ የለም።</p>
        ) : (
          <ul>
            {[...t.payments].reverse().map((p) => (
              <li key={p.id}>
                <b>{p.cycle} ወር</b> · {money(p.amount)}
                <br />
                <span className="muted small">
                  {fmtEth({ y: p.from_y, m: p.from_m, d: p.from_d })} → {fmtEth({ y: p.to_y, m: p.to_m, d: p.to_d })}
                  {" · የተመዘገበው "}{new Date(p.recorded_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {owner && (
        <button className="btn" style={{ marginTop: 16, color: "var(--late)" }} disabled={busy} onClick={deleteTenant}>
          ተከራይ አጥፋ
        </button>
      )}
    </>
  );
}

// ----------------------------------------------------------------------
// Main app
// ----------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(undefined);
  const { tenants, loading, error, reload } = useTenants();
  const [filters, setFilters] = useState({ floor: "all", status: "all", q: "" });
  const [drawer, setDrawer] = useState(null);
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState("auto");
  const toastTimer = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const owner = !!session;

  function flash(msg, undoable, tenantId) {
    setToast({ msg, undoable, tenantId });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  const floors = useMemo(() => {
    const set = new Set(tenants.map((t) => t.floor));
    return ["all", ...[...set].sort()];
  }, [tenants]);

  const inFloorScope = useMemo(
    () => tenants.filter((t) => filters.floor === "all" || t.floor === filters.floor),
    [tenants, filters.floor]
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

  return (
    <div data-theme={theme === "auto" ? undefined : theme}>
      <div className="wrap">
        <header className="top">
          <div>
            <h1>በረካ ህንፃ — የተከራዮች መዝገብ</h1>
            <div className="sub">
              ዛሬ <b>{fmtEth(today)} ዓ.ም</b> · ክፍያ ሲከፈል ቀኑ በራሱ 3 ወር ወይም 6 ወር ወደፊት ይራዘማል።
              <span className={`pill ${owner ? "ok" : "none"}`} style={{ marginInlineStart: 6 }}>
                {owner ? "የባለቤት ሁነታ" : "የተመልካች ሁነታ (ለውጥ ማድረግ አይቻልም)"}
              </span>
            </div>
          </div>
          <div className="toolbtns">
            <button className="btn" onClick={exportCsv}>CSV አውርድ</button>
            <button className="btn" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>ገጽታ</button>
            {owner
              ? <button className="btn" onClick={() => supabase.auth.signOut()}>ውጣ</button>
              : <button className="btn" onClick={() => setDrawer({ mode: "login" })}>የባለቤት መግቢያ</button>}
          </div>
        </header>

        {error && <div className="err" role="alert">መረጃ መጫን አልተቻለም፦ {errText(error)}</div>}

        <section className="stats">
          <div className="stat"><b>{stats.count}</b><span>ተከራዮች</span></div>
          <div className="stat"><b>{stats.late}</b><span>ያልተከፈለ</span></div>
          <div className="stat"><b>{stats.soon}</b><span>በ30 ቀን ውስጥ ያልቃል</span></div>
          <div className="stat"><b>{stats.paid}</b><span>የተከፈለ</span></div>
          <div className="stat"><b>{money(stats.expected)}</b><span>በአንድ ዙር የሚጠበቅ</span></div>
        </section>

        <div className="controls">
          <div className="tabs">
            {floors.map((f) => (
              <button key={f} className="tab" aria-pressed={filters.floor === f}
                onClick={() => setFilters((s) => ({ ...s, floor: f }))}>
                {f === "all" ? "ሁሉም ወለል" : f}
              </button>
            ))}
          </div>
          {owner && (
            <button className="btn btn-primary" onClick={() => setDrawer({ mode: "add" })}>+ ተከራይ ጨምር</button>
          )}
          <div className="tabs">
            {[["all", "ሁሉም"], ["late", "ያልተከፈለ"], ["soon", "ሊያልቅ የቀረበ"], ["paid", "የተከፈለ"]].map(([k, label]) => (
              <button key={k} className="tab" aria-pressed={filters.status === k}
                onClick={() => setFilters((s) => ({ ...s, status: k }))}>
                {label}
              </button>
            ))}
          </div>
          <input className="search" type="search" placeholder="በስም፣ በክፍል ቁጥር ወይም በስልክ ፈልግ"
            value={filters.q} onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))} />
        </div>

        <div className="tablecard">
          <table>
            <thead>
              <tr>
                <th scope="col">ተ.ቁ</th><th scope="col">ስም</th><th scope="col">ክፍል</th><th scope="col">ወለል</th>
                <th scope="col">ስልክ</th><th scope="col">ክፍያ የሚያበቃበት ቀን</th><th scope="col">ሁኔታ</th>
                <th scope="col">ውል የሚያበቃበት</th>
                {owner && <th scope="col" style={{ textAlign: "left" }}>ክፍያ መዝግብ</th>}
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
                    <td data-label="ክፍያ የሚያበቃበት">{fmtEth(t.payEnd)}</td>
                    <td data-label="ሁኔታ"><span className={`pill ${s.cls}`}>{s.label}</span></td>
                    <td data-label="ውል የሚያበቃበት">{t.contractEnd || "—"}</td>
                    {owner && (
                      <td>
                        <div className="pay">
                          <PayButton tenant={t} cycle={3} onFlash={flash} onSaved={reload} />
                          <PayButton tenant={t} cycle={6} onFlash={flash} onSaved={reload} />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && visible.length === 0 && (
            <div className="empty">በዚህ ማጣሪያ ተከራይ የለም። ማጣሪያውን ቀይር።</div>
          )}
        </div>

        <footer>ቀኖች በኢትዮጵያ ዘመን አቆጣጠር ናቸው። ወር = 30 ቀን ሆኖ ይሰላል።</footer>
      </div>

      {drawer && (
        <>
          <div className="scrim open" onClick={() => setDrawer(null)} />
          <aside className="drawer open" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
            <button className="btn" style={{ float: "left" }} aria-label="ዝጋ" onClick={() => setDrawer(null)}>ዝጋ</button>
            <div>
              {drawer.mode === "login" && <Login onDone={() => setDrawer(null)} />}
              {drawer.mode === "add" && (
                <Drawer mode="add" owner={owner} floors={floors}
                  defaultFloor={filters.floor !== "all" ? filters.floor : floors[1]}
                  onClose={() => setDrawer(null)} onSaved={reload} onFlash={flash} />
              )}
              {drawer.mode === "view" && drawerTenant && (
                <Drawer mode="view" tenant={drawerTenant} owner={owner} floors={floors}
                  onClose={() => setDrawer(null)} onSaved={reload} onFlash={flash} />
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
    </div>
  );
}

function PayButton({ tenant, cycle, onFlash, onSaved }) {
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
    }
  }
  return (
    <button className="paybtn" disabled={busy} onClick={click} title={amt != null ? money(amt) : "መጠን አልተመዘገበም"}>
      {cycle} ወር ተከፈለ
    </button>
  );
}
