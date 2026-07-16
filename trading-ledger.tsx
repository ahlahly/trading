import React, { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, X, Target, ShieldAlert, RefreshCw, Settings, Check, AlertCircle, LineChart } from "lucide-react";

const uid = () => Math.random().toString(36).slice(2, 10);

const emptyForm = {
  symbol: "",
  side: "شراء",
  entry: "",
  qty: "",
  stopLoss: "",
  takeProfit: "",
  current: "",
  status: "مفتوحة",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
};

export default function TradingLedger() {
  const [trades, setTrades] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalSec, setIntervalSec] = useState(30);
  const [openChart, setOpenChart] = useState(null);
  const tradesRef = useRef(trades);
  const apiKeyRef = useRef(apiKey);

  useEffect(() => { tradesRef.current = trades; }, [trades]);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("trades");
        if (res && res.value) setTrades(JSON.parse(res.value));
      } catch (e) {
        // no data yet
      }
      try {
        const keyRes = await window.storage.get("finnhub_key");
        if (keyRes && keyRes.value) setApiKey(keyRes.value);
        else setShowSettings(true);
      } catch (e) {
        setShowSettings(true);
      }
      setLoaded(true);
    })();
  }, []);

  const saveApiKey = async (val) => {
    setApiKey(val);
    try {
      await window.storage.set("finnhub_key", val);
    } catch (e) {
      console.error("تعذر حفظ المفتاح", e);
    }
  };

  const refreshPrices = async () => {
    const key = apiKeyRef.current;
    if (!key) {
      setShowSettings(true);
      setRefreshMsg({ type: "error", text: "أدخل مفتاح Finnhub أولًا" });
      return;
    }
    const openTrades = tradesRef.current.filter((t) => t.status === "مفتوحة" && t.symbol);
    if (openTrades.length === 0) {
      setRefreshMsg({ type: "error", text: "لا توجد صفقات مفتوحة لتحديثها" });
      return;
    }
    setRefreshing(true);
    setRefreshMsg(null);
    const symbols = [...new Set(openTrades.map((t) => t.symbol))];
    const prices = {};
    let failed = 0;
    for (const sym of symbols) {
      try {
        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`
        );
        const data = await r.json();
        if (data && typeof data.c === "number" && data.c > 0) {
          prices[sym] = data.c;
        } else {
          failed += 1;
        }
      } catch (e) {
        failed += 1;
      }
    }
    setTrades((prev) =>
      prev.map((t) =>
        prices[t.symbol] !== undefined ? { ...t, current: String(prices[t.symbol]) } : t
      )
    );
    setRefreshing(false);
    const now = new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    if (failed === 0) {
      setRefreshMsg({ type: "ok", text: `تم تحديث ${symbols.length - failed} سهم — ${now}` });
    } else {
      setRefreshMsg({
        type: "error",
        text: `تحديث جزئي: ${symbols.length - failed}/${symbols.length} — ${now}`,
      });
    }
  };

  useEffect(() => {
    if (!autoRefresh) return;
    refreshPrices();
    const id = setInterval(refreshPrices, intervalSec * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, intervalSec]);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await window.storage.set("trades", JSON.stringify(trades));
      } catch (e) {
        console.error("تعذر الحفظ", e);
      }
    })();
  }, [trades, loaded]);

  const calc = (t) => {
    const entry = parseFloat(t.entry) || 0;
    const qty = parseFloat(t.qty) || 0;
    const cur = parseFloat(t.current) || entry;
    const dir = t.side === "شراء" ? 1 : -1;
    const pnl = (cur - entry) * qty * dir;
    const pnlPct = entry ? ((cur - entry) / entry) * 100 * dir : 0;
    return { pnl, pnlPct, entry, qty, cur };
  };

  const summary = useMemo(() => {
    let total = 0, open = 0, wins = 0, closed = 0;
    trades.forEach((t) => {
      const { pnl } = calc(t);
      total += pnl;
      if (t.status === "مفتوحة") open += 1;
      else {
        closed += 1;
        if (pnl > 0) wins += 1;
      }
    });
    const winRate = closed ? Math.round((wins / closed) * 100) : 0;
    return { total, open, closed, winRate };
  }, [trades]);

  const addTrade = async () => {
    if (!form.symbol || !form.entry || !form.qty) return;
    const newTrade = { ...form, id: uid() };
    setTrades((prev) => [newTrade, ...prev]);
    setForm(emptyForm);
    setShowForm(false);

    // اجلب السعر الحالي تلقائيًا من Finnhub فور الحفظ إن وُجد مفتاح API
    if (apiKeyRef.current) {
      try {
        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(newTrade.symbol)}&token=${apiKeyRef.current}`
        );
        const data = await r.json();
        if (data && typeof data.c === "number" && data.c > 0) {
          setTrades((prev) =>
            prev.map((t) => (t.id === newTrade.id ? { ...t, current: String(data.c) } : t))
          );
        }
      } catch (e) {
        // تجاهل الخطأ، يقدر يستخدم زر التحديث لاحقًا
      }
    }
  };

  const removeTrade = (id) => setTrades((prev) => prev.filter((t) => t.id !== id));

  const updateField = (id, field, value) =>
    setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));

  return (
    <div dir="rtl" style={styles.page}>
      <style>{fontImports}</style>

      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>دفتر الصفقات</div>
          <h1 style={styles.title}>سجلّ الأرباح</h1>
        </div>
        <div style={styles.headerBtns}>
          <button style={styles.iconBtn} onClick={() => setShowSettings((s) => !s)} title="إعدادات API">
            <Settings size={17} />
          </button>
          <div style={styles.autoWrap}>
            <label style={styles.autoToggle}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={styles.checkbox}
              />
              تحديث تلقائي
            </label>
            {autoRefresh && (
              <select
                style={styles.intervalSelect}
                value={intervalSec}
                onChange={(e) => setIntervalSec(Number(e.target.value))}
              >
                <option value={10}>كل 10 ثواني</option>
                <option value={30}>كل 30 ثانية</option>
                <option value={60}>كل دقيقة</option>
                <option value={300}>كل 5 دقائق</option>
              </select>
            )}
          </div>
          <button style={styles.refreshBtn} onClick={refreshPrices} disabled={refreshing}>
            <RefreshCw size={16} style={refreshing ? styles.spin : undefined} />
            {refreshing ? "يحدّث..." : "تحديث الآن"}
          </button>
          <button style={styles.addBtn} onClick={() => setShowForm((s) => !s)}>
            {showForm ? <X size={18} /> : <Plus size={18} />}
            {showForm ? "إلغاء" : "صفقة جديدة"}
          </button>
        </div>
      </header>

      {showSettings && (
        <div style={styles.settingsCard}>
          <div style={styles.settingsRow}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>مفتاح Finnhub API</label>
              <input
                style={styles.input}
                placeholder="الصق مفتاح Finnhub هنا"
                value={apiKey}
                onChange={(e) => saveApiKey(e.target.value)}
              />
            </div>
            <button style={styles.closeSettingsBtn} onClick={() => setShowSettings(false)}>
              <Check size={16} />
            </button>
          </div>
          <p style={styles.settingsHint}>
            احصل على مفتاح مجاني من finnhub.io — يُستخدم فقط لجلب سعر السهم عند الضغط على "تحديث الأسعار"، ويُحفظ محليًا في متصفحك فقط.
          </p>
        </div>
      )}

      {refreshMsg && (
        <div style={{ ...styles.toast, color: refreshMsg.type === "ok" ? colors.profit : colors.loss }}>
          <AlertCircle size={14} /> {refreshMsg.text}
        </div>
      )}

      {/* شريط الملخص */}
      <div style={styles.summaryStrip}>
        <SummaryCell
          label="صافي الربح/الخسارة"
          value={`${summary.total >= 0 ? "+" : ""}${summary.total.toFixed(2)}`}
          accent={summary.total >= 0 ? colors.profit : colors.loss}
        />
        <SummaryCell label="صفقات مفتوحة" value={summary.open} accent={colors.gold} />
        <SummaryCell label="صفقات مغلقة" value={summary.closed} accent={colors.textMuted} />
        <SummaryCell label="نسبة النجاح" value={`${summary.winRate}%`} accent={colors.gold} />
      </div>

      {/* نموذج الإضافة */}
      {showForm && (
        <div style={styles.formCard}>
          <div style={styles.formGrid}>
            <Field label="اسم السهم">
              <input
                style={styles.input}
                placeholder="مثال: AAPL"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="نوع الصفقة">
              <select
                style={styles.input}
                value={form.side}
                onChange={(e) => setForm({ ...form, side: e.target.value })}
              >
                <option>شراء</option>
                <option>بيع</option>
              </select>
            </Field>
            <Field label="سعر الدخول">
              <input style={styles.input} type="number" value={form.entry}
                onChange={(e) => setForm({ ...form, entry: e.target.value })} />
            </Field>
            <Field label="الكمية">
              <input style={styles.input} type="number" value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </Field>
            <Field label="وقف الخسارة">
              <input style={styles.input} type="number" value={form.stopLoss}
                onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} />
            </Field>
            <Field label="جني الأرباح">
              <input style={styles.input} type="number" value={form.takeProfit}
                onChange={(e) => setForm({ ...form, takeProfit: e.target.value })} />
            </Field>
            <Field label="السعر الحالي (اختياري - يُملأ تلقائيًا)">
              <input style={styles.input} type="number" placeholder="سيُجلب تلقائيًا من Finnhub" value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })} />
            </Field>
            <Field label="التاريخ">
              <input style={styles.input} type="date" value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="ملاحظات" full>
              <input style={styles.input} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          <button style={styles.saveBtn} onClick={addTrade}>حفظ الصفقة</button>
        </div>
      )}

      {/* قائمة الصفقات */}
      <div style={styles.list}>
        {trades.length === 0 && (
          <div style={styles.empty}>لا توجد صفقات مسجّلة بعد. ابدأ بإضافة أول صفقة.</div>
        )}
        {trades.map((t) => {
          const { pnl, pnlPct, entry, cur } = calc(t);
          const profit = pnl >= 0;
          return (
            <div key={t.id} style={styles.row}>
              <div style={styles.rowTop}>
                <div style={styles.rowSymbolWrap}>
                  <span style={styles.rowSymbol}>{t.symbol}</span>
                  <span style={styles.rowSide}>{t.side}</span>
                  <span style={t.status === "مفتوحة" ? styles.badgeOpen : styles.badgeClosed}>
                    {t.status}
                  </span>
                </div>
                <div style={{ ...styles.rowPnl, color: profit ? colors.profit : colors.loss }}>
                  {profit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {pnl.toFixed(2)} ({pnlPct.toFixed(1)}%)
                </div>
              </div>

              <RiskGauge entry={entry} current={cur} stop={parseFloat(t.stopLoss)} target={parseFloat(t.takeProfit)} side={t.side} />

              <div style={styles.rowMeta}>
                <MetaItem icon={<ShieldAlert size={13} />} label="وقف الخسارة" value={t.stopLoss || "—"} color={colors.loss} />
                <MetaItem icon={<Target size={13} />} label="جني الأرباح" value={t.takeProfit || "—"} color={colors.profit} />
                <MetaField label="السعر الحالي" value={t.current}
                  onChange={(v) => updateField(t.id, "current", v)} />
                <select
                  style={styles.statusSelect}
                  value={t.status}
                  onChange={(e) => updateField(t.id, "status", e.target.value)}
                >
                  <option>مفتوحة</option>
                  <option>مغلقة</option>
                </select>
                <span style={styles.rowDate}>{t.date}</span>
                <button
                  style={styles.chartBtn}
                  onClick={() => setOpenChart(openChart === t.id ? null : t.id)}
                  title="عرض شارت TradingView"
                >
                  <LineChart size={15} />
                </button>
                <button style={styles.deleteBtn} onClick={() => removeTrade(t.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
              {openChart === t.id && t.symbol && (
                <TradingViewMiniWidget symbol={t.symbol} />
              )}
              {t.notes && <div style={styles.notes}>{t.notes}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TradingViewMiniWidget({ symbol }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    containerRef.current.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: "100%",
      height: 120,
      locale: "ar_AE",
      dateRange: "1M",
      colorTheme: "dark",
      isTransparent: true,
      autosize: true,
      largeChartUrl: "",
    });
    containerRef.current.appendChild(script);
  }, [symbol]);

  return (
    <div style={styles.tvWrap}>
      <div className="tradingview-widget-container" ref={containerRef} />
    </div>
  );
}

function SummaryCell({ label, value, accent }) {
  return (
    <div style={styles.summaryCell}>
      <div style={{ ...styles.summaryValue, color: accent }}>{value}</div>
      <div style={styles.summaryLabel}>{label}</div>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function MetaItem({ icon, label, value, color }) {
  return (
    <div style={styles.metaItem}>
      <span style={{ color }}>{icon}</span>
      <span style={styles.metaLabel}>{label}:</span>
      <span style={{ ...styles.metaValue, color }}>{value}</span>
    </div>
  );
}

function MetaField({ label, value, onChange }) {
  return (
    <div style={styles.metaItem}>
      <span style={styles.metaLabel}>{label}:</span>
      <input
        style={styles.metaInput}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function RiskGauge({ entry, current, stop, target, side }) {
  const isBuy = side === "شراء";
  const low = isBuy ? (isFinite(stop) ? stop : entry * 0.95) : entry;
  const high = isBuy ? entry : (isFinite(stop) ? stop : entry * 1.05);
  const lowBound = Math.min(low, isFinite(target) ? target : low, entry, current);
  const highBound = Math.max(high, isFinite(target) ? target : high, entry, current);
  const range = highBound - lowBound || 1;
  const pos = (v) => Math.min(100, Math.max(0, ((v - lowBound) / range) * 100));

  return (
    <div style={styles.gaugeWrap}>
      <div style={styles.gaugeTrack}>
        {isFinite(stop) && (
          <div style={{ ...styles.gaugeMark, left: `${pos(stop)}%`, background: colors.loss }} title="وقف الخسارة" />
        )}
        {isFinite(target) && (
          <div style={{ ...styles.gaugeMark, left: `${pos(target)}%`, background: colors.profit }} title="جني الأرباح" />
        )}
        <div style={{ ...styles.gaugeMark, left: `${pos(entry)}%`, background: colors.gold, height: "70%" }} title="سعر الدخول" />
        <div style={{ ...styles.gaugeDot, left: `${pos(current)}%` }} title="السعر الحالي" />
      </div>
    </div>
  );
}

const colors = {
  bg: "#0E1420",
  card: "#161D2B",
  cardBorder: "#26304350",
  paper: "#EDE6D6",
  textMuted: "#8A93A6",
  gold: "#C9A227",
  profit: "#2FA876",
  loss: "#C6544A",
};

const fontImports = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=IBM+Plex+Mono:wght@500;600&family=Inter:wght@400;500;600&display=swap');
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const styles = {
  page: {
    minHeight: "100vh",
    background: `radial-gradient(1200px 600px at 20% -10%, #17213280, transparent), ${colors.bg}`,
    color: colors.paper,
    fontFamily: "'Inter', sans-serif",
    padding: "28px 20px 60px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 22,
  },
  eyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    letterSpacing: "0.14em",
    color: colors.gold,
    marginBottom: 4,
  },
  title: {
    fontFamily: "'Fraunces', serif",
    fontSize: 32,
    fontWeight: 700,
    margin: 0,
  },
  addBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: colors.gold,
    color: "#1B1506",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  headerBtns: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  autoWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  autoToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: colors.textMuted,
    cursor: "pointer",
    userSelect: "none",
  },
  checkbox: {
    accentColor: colors.gold,
    width: 15,
    height: 15,
    cursor: "pointer",
  },
  intervalSelect: {
    background: colors.card,
    border: `1px solid ${colors.cardBorder}`,
    color: colors.paper,
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 12,
  },
  iconBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: colors.card,
    border: `1px solid ${colors.cardBorder}`,
    color: colors.paper,
    borderRadius: 8,
    width: 38,
    height: 38,
    cursor: "pointer",
  },
  refreshBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: colors.card,
    border: `1px solid ${colors.cardBorder}`,
    color: colors.paper,
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    cursor: "pointer",
  },
  spin: {
    animation: "spin 1s linear infinite",
  },
  settingsCard: {
    background: colors.card,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
  },
  settingsRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
  },
  closeSettingsBtn: {
    background: colors.profit,
    border: "none",
    color: "#06231A",
    borderRadius: 8,
    width: 38,
    height: 38,
    cursor: "pointer",
  },
  settingsHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 0,
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    marginBottom: 14,
  },
  summaryStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 22,
  },
  summaryCell: {
    background: colors.card,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 12,
    padding: "16px 18px",
  },
  summaryValue: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 24,
    fontWeight: 600,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  formCard: {
    background: colors.card,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 14,
    padding: 20,
    marginBottom: 22,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 14,
  },
  label: {
    display: "block",
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 6,
  },
  input: {
    width: "100%",
    background: "#0E1420",
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 8,
    padding: "9px 10px",
    color: colors.paper,
    fontSize: 14,
    boxSizing: "border-box",
    fontFamily: "'Inter', sans-serif",
  },
  saveBtn: {
    marginTop: 16,
    background: colors.profit,
    color: "#06231A",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontWeight: 600,
    cursor: "pointer",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  empty: {
    textAlign: "center",
    color: colors.textMuted,
    padding: "40px 0",
  },
  row: {
    background: colors.card,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 14,
    padding: "16px 18px",
  },
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  rowSymbolWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  rowSymbol: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 18,
    fontWeight: 600,
  },
  rowSide: {
    fontSize: 12,
    color: colors.textMuted,
  },
  badgeOpen: {
    fontSize: 11,
    background: "#C9A22722",
    color: colors.gold,
    padding: "3px 8px",
    borderRadius: 20,
  },
  badgeClosed: {
    fontSize: 11,
    background: "#8A93A622",
    color: colors.textMuted,
    padding: "3px 8px",
    borderRadius: 20,
  },
  rowPnl: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    fontSize: 15,
  },
  gaugeWrap: {
    margin: "12px 0",
  },
  gaugeTrack: {
    position: "relative",
    height: 6,
    background: "#26304380",
    borderRadius: 4,
  },
  gaugeMark: {
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 3,
    height: "140%",
    borderRadius: 2,
  },
  gaugeDot: {
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: colors.paper,
    border: `2px solid ${colors.bg}`,
  },
  rowMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
    fontSize: 13,
  },
  metaItem: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  metaLabel: {
    color: colors.textMuted,
  },
  metaValue: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
  },
  metaInput: {
    width: 80,
    background: "#0E1420",
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 6,
    padding: "4px 6px",
    color: colors.paper,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
  },
  statusSelect: {
    background: "#0E1420",
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 6,
    padding: "4px 8px",
    color: colors.paper,
    fontSize: 12,
  },
  rowDate: {
    color: colors.textMuted,
    fontSize: 12,
    marginRight: "auto",
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: colors.loss,
    cursor: "pointer",
    padding: 4,
  },
  chartBtn: {
    background: "transparent",
    border: "none",
    color: colors.gold,
    cursor: "pointer",
    padding: 4,
  },
  tvWrap: {
    marginTop: 10,
    borderRadius: 8,
    overflow: "hidden",
    border: `1px solid ${colors.cardBorder}`,
  },
  notes: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textMuted,
    borderTop: `1px solid ${colors.cardBorder}`,
    paddingTop: 8,
  },
};
