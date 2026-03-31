import { useState, useEffect, useMemo, useRef } from "react";

const font = `'DM Sans', 'Noto Sans TC', sans-serif`;
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const extractTags = (text) => {
  const m = (text||"").match(/#[\w\u4e00-\u9fff\u3400-\u4dbf]+/g);
  return m ? [...new Set(m.map(t => t.slice(1)))] : [];
};
const fmt = (d) => d ? new Date(d).toLocaleDateString("zh-TW", { year:"numeric", month:"2-digit", day:"2-digit" }) : "";
const fmtDate = (d) => d || "";
const money = (n) => n == null ? "—" : n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
const pctFmt = (n) => n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

/* ── Shared Styles (subset from App.jsx) ── */
const S = {
  card: { background: "#FFF", borderRadius: 10, border: "1px solid #E8ECF1", padding: 20, marginBottom: 14 },
  cardSm: { background: "#FFF", borderRadius: 8, border: "1px solid #E8ECF1", padding: 14 },
  h1: { fontSize: 20, fontWeight: 700, marginBottom: 4, color: "#1E293B" },
  h2: { fontSize: 16, fontWeight: 600, marginBottom: 14, color: "#334155" },
  h3: { fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 },
  sub: { fontSize: 12.5, color: "#94A3B8", marginBottom: 18 },
  btn: (color = "#4F46E5") => ({
    padding: "7px 16px", borderRadius: 7, border: "none", background: color, color: "#FFF",
    cursor: "pointer", fontWeight: 600, fontSize: 12.5, fontFamily: font, transition: "opacity .15s"
  }),
  btnOutline: { padding: "7px 16px", borderRadius: 7, border: "1px solid #CBD5E1", background: "transparent", color: "#475569", cursor: "pointer", fontWeight: 500, fontSize: 12.5, fontFamily: font },
  input: { width: "100%", padding: "8px 11px", borderRadius: 7, border: "1px solid #D1D5DB", fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box", color: "#1E293B" },
  textarea: { width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid #D1D5DB", fontSize: 13, fontFamily: font, outline: "none", resize: "vertical", boxSizing: "border-box", minHeight: 70, color: "#1E293B", lineHeight: 1.6 },
  label: { display: "block", fontSize: 11.5, fontWeight: 600, color: "#64748B", marginBottom: 4 },
  select: { width: "100%", padding: "8px 11px", borderRadius: 7, border: "1px solid #D1D5DB", fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box", color: "#1E293B", background: "#FFF" },
  tag: (bg = "#EEF2FF", fg = "#4F46E5") => ({
    display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11,
    fontWeight: 600, background: bg, color: fg, marginRight: 4, marginBottom: 3
  }),
  flexBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  flexGap: (g = 8) => ({ display: "flex", gap: g, alignItems: "center" }),
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 },
  modal: { background: "#FFF", borderRadius: 12, padding: 24, maxWidth: 720, width: "95%", maxHeight: "85vh", overflow: "auto" },
  img: { width: "100%", borderRadius: 7, objectFit: "cover", border: "1px solid #E2E8F0", cursor: "pointer" },
  stat: { textAlign: "center", padding: "16px 12px" },
  statNum: { fontSize: 26, fontWeight: 700, color: "#4F46E5" },
  statLabel: { fontSize: 11.5, color: "#94A3B8", marginTop: 3 },
};

/* ══════════════════════════════════════════════════════════════
   TLG PARSER + TRADE GROUPING
   ══════════════════════════════════════════════════════════════ */
function parseTLG(text) {
  const lines = text.split("\n").filter(l => l.startsWith("STK_TRD"));
  return lines.map(line => {
    const f = line.split("|");
    const qty = parseFloat(f[10]) || 0;
    return {
      txId: f[1],
      ticker: f[2],
      name: f[3],
      exchange: f[4],
      action: f[5],       // BUYTOOPEN, SELLTOCLOSE, SELLTOOPEN, BUYTOCLOSE
      openClose: f[6],    // O or C
      date: `${f[7].slice(0,4)}-${f[7].slice(4,6)}-${f[7].slice(6,8)}`,
      time: f[8],
      currency: f[9],
      shares: Math.abs(qty),
      price: parseFloat(f[12]) || 0,
      amount: parseFloat(f[13]) || 0,
      commission: Math.abs(parseFloat(f[14]) || 0),
    };
  });
}

function groupTransactions(txs) {
  // Group by ticker
  const byTicker = {};
  txs.forEach(tx => {
    if (!byTicker[tx.ticker]) byTicker[tx.ticker] = [];
    byTicker[tx.ticker].push(tx);
  });

  const trades = [];
  Object.entries(byTicker).forEach(([ticker, tickerTxs]) => {
    const opens = tickerTxs.filter(t => t.openClose === "O");
    const closes = tickerTxs.filter(t => t.openClose === "C");

    // Determine side
    let side = "long";
    if (opens.length > 0 && opens[0].action.includes("SELL")) side = "short";
    if (opens.length === 0 && closes.length > 0 && closes[0].action.includes("BUY")) side = "short";

    // Calculate weighted averages
    const totalEntryShares = opens.reduce((s, t) => s + t.shares, 0);
    const totalExitShares = closes.reduce((s, t) => s + t.shares, 0);
    const avgEntry = totalEntryShares > 0 ? opens.reduce((s, t) => s + t.price * t.shares, 0) / totalEntryShares : 0;
    const avgExit = totalExitShares > 0 ? closes.reduce((s, t) => s + t.price * t.shares, 0) / totalExitShares : 0;
    const totalShares = Math.max(totalEntryShares, totalExitShares);

    // P&L
    const entryAmount = Math.abs(opens.reduce((s, t) => s + t.amount, 0));
    const exitAmount = Math.abs(closes.reduce((s, t) => s + t.amount, 0));
    const totalComm = opens.reduce((s, t) => s + t.commission, 0) + closes.reduce((s, t) => s + t.commission, 0);

    let pnl;
    if (side === "long") {
      pnl = exitAmount - entryAmount;
    } else {
      pnl = entryAmount - exitAmount;
    }
    const pnlWithComm = pnl - totalComm;
    const returnPct = entryAmount > 0 ? (pnl / entryAmount) * 100 : 0;

    // Dates
    const allDates = tickerTxs.map(t => t.date).sort();
    const entryDate = opens.length > 0 ? opens.map(t => t.date).sort()[0] : allDates[0];
    const exitDate = closes.length > 0 ? closes.map(t => t.date).sort().pop() : null;

    // Holding days
    let holdingDays = 0;
    if (entryDate && exitDate) {
      holdingDays = Math.ceil((new Date(exitDate) - new Date(entryDate)) / 86400000);
    }

    // Status
    const status = (totalEntryShares === totalExitShares && totalEntryShares > 0) ? "closed" :
                   (totalExitShares < totalEntryShares) ? "open" : "closed";

    // Collect txIds for dedup
    const txIds = tickerTxs.map(t => t.txId);

    trades.push({
      id: genId(),
      ticker, name: tickerTxs[0].name, side, status, currency: tickerTxs[0].currency,
      entries: opens.map(t => ({ txId: t.txId, date: t.date, time: t.time, price: t.price, shares: t.shares, amount: t.amount, commission: t.commission })),
      exits: closes.map(t => ({ txId: t.txId, date: t.date, time: t.time, price: t.price, shares: t.shares, amount: t.amount, commission: t.commission })),
      avgEntry: +avgEntry.toFixed(4), avgExit: +avgExit.toFixed(4),
      totalShares, pnl: +pnl.toFixed(2), pnlWithComm: +pnlWithComm.toFixed(2),
      returnPct: +returnPct.toFixed(2), holdingDays, entryDate, exitDate,
      patternId: null, marketTags: [], notes: "", images: [], tags: [],
      txIds,
    });
  });

  return trades.sort((a, b) => (b.entryDate || "").localeCompare(a.entryDate || ""));
}

/* ══════════════════════════════════════════════════════════════
   TRADE IMPORT MODAL
   ══════════════════════════════════════════════════════════════ */
export function TradeImport({ existingTxIds, onImport, onClose }) {
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const txs = parseTLG(ev.target.result);
      // Filter out already-imported transactions
      const newTxs = txs.filter(t => !existingTxIds.has(t.txId));
      const grouped = groupTransactions(newTxs);
      setParsed(grouped);
      setSelected(new Set(grouped.map(t => t.id)));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleImport = () => {
    const trades = parsed.filter(t => selected.has(t.id));
    onImport(trades);
    onClose();
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 800 }} onClick={e => e.stopPropagation()}>
        <div style={S.flexBetween}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>匯入 IBKR 交易紀錄</div>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 18 }} onClick={onClose}>✕</button>
        </div>

        {!parsed ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ border: "2px dashed #D1D5DB", borderRadius: 8, padding: 36, textAlign: "center", cursor: "pointer", color: "#94A3B8" }}
              onClick={() => fileRef.current?.click()}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#4F46E5"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#D1D5DB"}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>點擊選擇 .tlg 檔案</div>
              <div style={{ fontSize: 12 }}>支援 IBKR 交易對帳單格式</div>
              <input ref={fileRef} type="file" accept=".tlg,.csv,.txt" style={{ display: "none" }} onChange={handleFile} />
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>
              解析到 <strong>{parsed.length}</strong> 筆交易，已選取 <strong>{selected.size}</strong> 筆
            </div>

            {parsed.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>
                沒有新交易（可能已全部匯入過）
              </div>
            ) : (
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #E2E8F0", color: "#94A3B8", fontSize: 11 }}>
                      <th style={{ padding: "6px", textAlign: "left" }}>
                        <input type="checkbox" checked={selected.size === parsed.length}
                          onChange={() => setSelected(selected.size === parsed.length ? new Set() : new Set(parsed.map(t => t.id)))} />
                      </th>
                      <th style={{ padding: "6px", textAlign: "left" }}>代碼</th>
                      <th style={{ padding: "6px", textAlign: "left" }}>方向</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>股數</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>進場均價</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>出場均價</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>P&L</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>報酬%</th>
                      <th style={{ padding: "6px", textAlign: "left" }}>期間</th>
                      <th style={{ padding: "6px", textAlign: "center" }}>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map(t => (
                      <tr key={t.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "8px 6px" }}>
                          <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                        </td>
                        <td style={{ padding: "8px 6px", fontWeight: 600 }}>{t.ticker}</td>
                        <td style={{ padding: "8px 6px" }}>
                          <span style={S.tag(t.side === "long" ? "#ECFDF5" : "#FEF2F2", t.side === "long" ? "#059669" : "#DC2626")}>
                            {t.side === "long" ? "做多" : "做空"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "right" }}>{t.totalShares}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right" }}>{t.avgEntry > 0 ? `$${t.avgEntry.toFixed(2)}` : "—"}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right" }}>{t.avgExit > 0 ? `$${t.avgExit.toFixed(2)}` : "—"}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600, color: t.pnl >= 0 ? "#059669" : "#DC2626" }}>
                          {money(t.pnl)}
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "right", color: t.returnPct >= 0 ? "#059669" : "#DC2626" }}>
                          {pctFmt(t.returnPct)}
                        </td>
                        <td style={{ padding: "8px 6px", fontSize: 11, color: "#64748B" }}>
                          {t.entryDate} → {t.exitDate || "持倉中"}
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "center" }}>
                          <span style={S.tag(t.status === "closed" ? "#F1F5F9" : "#FFFBEB", t.status === "closed" ? "#64748B" : "#D97706")}>
                            {t.status === "closed" ? "已平倉" : "持倉中"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ ...S.flexGap(8), justifyContent: "flex-end", marginTop: 16 }}>
              <button style={S.btnOutline} onClick={() => setParsed(null)}>重新選擇</button>
              <button style={S.btn()} onClick={handleImport} disabled={selected.size === 0}>
                匯入 {selected.size} 筆交易
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TRADE LIST VIEW
   ══════════════════════════════════════════════════════════════ */
export function TradeListView({ trades, patterns, topPatterns, getChildren, getPattern, allMktTags, onImport, onAdd, onSelect, onDelete }) {
  const [sideFilter, setSideFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [patFilter, setPatFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const patternOptions = useMemo(() => {
    const opts = [];
    topPatterns.forEach(p => {
      opts.push({ id: p.id, label: p.name });
      getChildren(p.id).forEach(c => opts.push({ id: c.id, label: `  └ ${c.name}` }));
    });
    return opts;
  }, [topPatterns, getChildren]);

  const filtered = useMemo(() => {
    let list = trades;
    if (sideFilter !== "all") list = list.filter(t => t.side === sideFilter);
    if (statusFilter !== "all") list = list.filter(t => t.status === statusFilter);
    if (patFilter) list = list.filter(t => t.patternId === patFilter);
    list = [...list].sort((a, b) => {
      if (sortBy === "newest") return (b.entryDate || "").localeCompare(a.entryDate || "");
      if (sortBy === "oldest") return (a.entryDate || "").localeCompare(b.entryDate || "");
      if (sortBy === "pnl_high") return (b.pnl || 0) - (a.pnl || 0);
      if (sortBy === "pnl_low") return (a.pnl || 0) - (b.pnl || 0);
      return 0;
    });
    return list;
  }, [trades, sideFilter, statusFilter, patFilter, sortBy]);

  // Summary
  const totalPnl = filtered.reduce((s, t) => s + (t.pnl || 0), 0);
  const closed = filtered.filter(t => t.status === "closed");
  const wins = closed.filter(t => t.pnl > 0).length;
  const losses = closed.filter(t => t.pnl < 0).length;
  const winRate = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) : "—";

  return (
    <div>
      <div style={S.flexBetween}>
        <div><div style={S.h1}>交易紀錄</div><div style={S.sub}>{trades.length} 筆交易</div></div>
        <div style={S.flexGap(8)}>
          <button style={S.btnOutline} onClick={onImport}>📂 匯入 TLG</button>
          <button style={S.btn()} onClick={onAdd}>+ 手動新增</button>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div style={{ ...S.cardSm, ...S.stat }}>
          <div style={S.statNum}>{filtered.length}</div>
          <div style={S.statLabel}>篩選後交易</div>
        </div>
        <div style={{ ...S.cardSm, ...S.stat }}>
          <div style={{ ...S.statNum, color: totalPnl >= 0 ? "#059669" : "#DC2626" }}>{money(totalPnl)}</div>
          <div style={S.statLabel}>總 P&L</div>
        </div>
        <div style={{ ...S.cardSm, ...S.stat }}>
          <div style={{ ...S.statNum, color: "#059669" }}>{winRate}{winRate !== "—" ? "%" : ""}</div>
          <div style={S.statLabel}>勝率 ({wins}W / {losses}L)</div>
        </div>
        <div style={{ ...S.cardSm, ...S.stat }}>
          <div style={{ ...S.statNum, color: "#7C3AED" }}>{closed.length}</div>
          <div style={S.statLabel}>已平倉</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...S.flexGap(8), flexWrap: "wrap", marginBottom: 14 }}>
        <select style={{ ...S.select, width: "auto", minWidth: 90 }} value={sideFilter} onChange={e => setSideFilter(e.target.value)}>
          <option value="all">全部方向</option>
          <option value="long">做多</option>
          <option value="short">做空</option>
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 90 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">全部狀態</option>
          <option value="closed">已平倉</option>
          <option value="open">持倉中</option>
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 120 }} value={patFilter} onChange={e => setPatFilter(e.target.value)}>
          <option value="">全部型態</option>
          {patternOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 100 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="newest">最新優先</option>
          <option value="oldest">最舊優先</option>
          <option value="pnl_high">P&L 高→低</option>
          <option value="pnl_low">P&L 低→高</option>
        </select>
      </div>

      {/* Trade table */}
      {filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 36, color: "#94A3B8" }}>
          {trades.length === 0 ? (
            <div>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📈</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>尚無交易紀錄</div>
              <div style={{ fontSize: 12.5 }}>點擊「匯入 TLG」或「手動新增」開始記錄</div>
            </div>
          ) : "沒有符合條件的交易"}
        </div>
      ) : (
        <div style={S.card}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E2E8F0", color: "#94A3B8", fontSize: 11, fontWeight: 500 }}>
                <th style={{ padding: "7px 6px", textAlign: "left" }}>代碼</th>
                <th style={{ padding: "7px 6px", textAlign: "left" }}>方向</th>
                <th style={{ padding: "7px 6px", textAlign: "right" }}>股數</th>
                <th style={{ padding: "7px 6px", textAlign: "right" }}>進場</th>
                <th style={{ padding: "7px 6px", textAlign: "right" }}>出場</th>
                <th style={{ padding: "7px 6px", textAlign: "right" }}>P&L</th>
                <th style={{ padding: "7px 6px", textAlign: "right" }}>報酬%</th>
                <th style={{ padding: "7px 6px", textAlign: "center" }}>持有</th>
                <th style={{ padding: "7px 6px", textAlign: "left" }}>型態</th>
                <th style={{ padding: "7px 6px", textAlign: "center" }}>狀態</th>
                <th style={{ padding: "7px 6px" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const pat = t.patternId ? getPattern(t.patternId) : null;
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid #F1F5F9", cursor: "pointer" }}
                    onClick={() => onSelect(t)}
                    onMouseEnter={e => e.currentTarget.style.background = "#FAFBFD"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "10px 6px", fontWeight: 700 }}>{t.ticker}</td>
                    <td style={{ padding: "10px 6px" }}>
                      <span style={S.tag(t.side === "long" ? "#ECFDF5" : "#FEF2F2", t.side === "long" ? "#059669" : "#DC2626")}>
                        {t.side === "long" ? "L" : "S"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "right" }}>{t.totalShares}</td>
                    <td style={{ padding: "10px 6px", textAlign: "right" }}>${t.avgEntry.toFixed(2)}</td>
                    <td style={{ padding: "10px 6px", textAlign: "right" }}>{t.avgExit > 0 ? `$${t.avgExit.toFixed(2)}` : "—"}</td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 700, color: t.pnl >= 0 ? "#059669" : "#DC2626" }}>
                      {money(t.pnl)}
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "right", color: t.returnPct >= 0 ? "#059669" : "#DC2626" }}>
                      {pctFmt(t.returnPct)}
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "center", fontSize: 11, color: "#94A3B8" }}>{t.holdingDays}天</td>
                    <td style={{ padding: "10px 6px" }}>
                      {pat ? <span style={S.tag(pat.color + "22", pat.color)}>{pat.name}</span> : <span style={{ color: "#CBD5E1" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "center" }}>
                      <span style={S.tag(t.status === "closed" ? "#F1F5F9" : "#FFFBEB", t.status === "closed" ? "#64748B" : "#D97706")}>
                        {t.status === "closed" ? "平倉" : "持倉"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      <button style={{ ...S.btnOutline, padding: "3px 8px", fontSize: 11, color: "#EF4444", borderColor: "#FECACA" }}
                        onClick={e => { e.stopPropagation(); onDelete(t.id); }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TRADE DETAIL VIEW
   ══════════════════════════════════════════════════════════════ */
export function TradeDetailView({ trade, getPattern, patterns, setLightbox, onEdit, onBack, onDelete }) {
  const pat = trade.patternId ? getPattern(trade.patternId) : null;

  const getPatternLabel = (p) => {
    if (!p) return "—";
    if (p.parentId) {
      const parent = patterns.find(x => x.id === p.parentId);
      return parent ? `${parent.name} › ${p.name}` : p.name;
    }
    return p.name;
  };

  return (
    <div>
      <div style={S.flexBetween}>
        <div style={S.flexGap(12)}>
          <button style={S.btnOutline} onClick={onBack}>← 返回</button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{trade.ticker} <span style={{ fontSize: 13, fontWeight: 400, color: "#94A3B8" }}>{trade.name}</span></div>
            <div style={S.flexGap(8)}>
              <span style={S.tag(trade.side === "long" ? "#ECFDF5" : "#FEF2F2", trade.side === "long" ? "#059669" : "#DC2626")}>
                {trade.side === "long" ? "做多 Long" : "做空 Short"}
              </span>
              <span style={S.tag(trade.status === "closed" ? "#F1F5F9" : "#FFFBEB", trade.status === "closed" ? "#64748B" : "#D97706")}>
                {trade.status === "closed" ? "已平倉" : "持倉中"}
              </span>
            </div>
          </div>
        </div>
        <div style={S.flexGap(6)}>
          <button style={S.btnOutline} onClick={onEdit}>✏️ 編輯</button>
          <button style={{ ...S.btnOutline, color: "#EF4444", borderColor: "#FECACA" }} onClick={() => onDelete(trade.id)}>🗑 刪除</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16, marginBottom: 16 }}>
        <div style={{ ...S.cardSm, ...S.stat }}>
          <div style={{ ...S.statNum, color: trade.pnl >= 0 ? "#059669" : "#DC2626" }}>{money(trade.pnl)}</div>
          <div style={S.statLabel}>P&L</div>
        </div>
        <div style={{ ...S.cardSm, ...S.stat }}>
          <div style={{ ...S.statNum, color: trade.returnPct >= 0 ? "#059669" : "#DC2626" }}>{pctFmt(trade.returnPct)}</div>
          <div style={S.statLabel}>報酬率</div>
        </div>
        <div style={{ ...S.cardSm, ...S.stat }}>
          <div style={S.statNum}>{trade.holdingDays}</div>
          <div style={S.statLabel}>持有天數</div>
        </div>
        <div style={{ ...S.cardSm, ...S.stat }}>
          <div style={S.statNum}>{trade.totalShares}</div>
          <div style={S.statLabel}>總股數</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Entry/Exit details */}
        <div style={S.card}>
          <div style={S.h3}>進場明細 (均價 ${trade.avgEntry.toFixed(2)})</div>
          {trade.entries && trade.entries.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ borderBottom: "1px solid #E2E8F0", color: "#94A3B8", fontSize: 11 }}>
                <th style={{ padding: "5px 4px", textAlign: "left" }}>日期</th>
                <th style={{ padding: "5px 4px", textAlign: "right" }}>價格</th>
                <th style={{ padding: "5px 4px", textAlign: "right" }}>股數</th>
                <th style={{ padding: "5px 4px", textAlign: "right" }}>金額</th>
              </tr></thead>
              <tbody>
                {trade.entries.map((e, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "6px 4px" }}>{e.date} {e.time?.slice(0,5)}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}>${e.price.toFixed(2)}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}>{e.shares}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}>{money(Math.abs(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div style={{ color: "#CBD5E1", fontSize: 12 }}>無進場紀錄</div>}
        </div>

        <div style={S.card}>
          <div style={S.h3}>出場明細 (均價 ${trade.avgExit > 0 ? trade.avgExit.toFixed(2) : "—"})</div>
          {trade.exits && trade.exits.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ borderBottom: "1px solid #E2E8F0", color: "#94A3B8", fontSize: 11 }}>
                <th style={{ padding: "5px 4px", textAlign: "left" }}>日期</th>
                <th style={{ padding: "5px 4px", textAlign: "right" }}>價格</th>
                <th style={{ padding: "5px 4px", textAlign: "right" }}>股數</th>
                <th style={{ padding: "5px 4px", textAlign: "right" }}>金額</th>
              </tr></thead>
              <tbody>
                {trade.exits.map((e, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "6px 4px" }}>{e.date} {e.time?.slice(0,5)}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}>${e.price.toFixed(2)}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}>{e.shares}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}>{money(Math.abs(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div style={{ color: "#CBD5E1", fontSize: 12 }}>尚未出場</div>}
        </div>
      </div>

      {/* Pattern & Market tags */}
      {(pat || (trade.marketTags || []).length > 0) && (
        <div style={S.card}>
          <div style={S.h3}>分類標記</div>
          <div style={S.flexGap(8)}>
            {pat && <span style={S.tag(pat.color + "22", pat.color)}>📊 {getPatternLabel(pat)}</span>}
            {(trade.marketTags || []).map(t => <span key={t} style={S.tag("#FEF3C7", "#92400E")}>📌 {t}</span>)}
          </div>
        </div>
      )}

      {/* Notes */}
      {trade.notes && (
        <div style={S.card}>
          <div style={S.h3}>交易筆記</div>
          <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#334155" }}>
            {trade.notes.split(/(#[\w\u4e00-\u9fff\u3400-\u4dbf]+)/g).map((part, i) =>
              part.match(/^#[\w\u4e00-\u9fff\u3400-\u4dbf]+$/) ?
                <span key={i} style={{ color: "#4F46E5", fontWeight: 600, background: "#EEF2FF", padding: "1px 4px", borderRadius: 3 }}>{part}</span> :
                <span key={i}>{part}</span>
            )}
          </div>
        </div>
      )}

      {/* Images */}
      {(trade.images || []).length > 0 && (
        <div style={S.card}>
          <div style={S.h3}>截圖</div>
          <div style={{ display: "grid", gridTemplateColumns: trade.images.length > 1 ? "1fr 1fr" : "1fr", gap: 10 }}>
            {trade.images.map((img, i) => (
              <img key={i} src={img} alt="" style={{ ...S.img, maxHeight: 300 }} onClick={() => setLightbox(img)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TRADE FORM (Add / Edit)
   ══════════════════════════════════════════════════════════════ */
export function TradeForm({ existing, patterns, topPatterns, getChildren, allMktTags, onSave, onCancel }) {
  const isEdit = !!existing;
  const [formError, setFormError] = useState(null);
  const [form, setForm] = useState({
    id: existing?.id || genId(),
    ticker: existing?.ticker || "",
    name: existing?.name || "",
    side: existing?.side || "long",
    status: existing?.status || "closed",
    currency: existing?.currency || "USD",
    entryDate: existing?.entryDate || new Date().toISOString().slice(0, 10),
    exitDate: existing?.exitDate || "",
    avgEntry: existing?.avgEntry || "",
    avgExit: existing?.avgExit || "",
    totalShares: existing?.totalShares || "",
    entries: existing?.entries || [],
    exits: existing?.exits || [],
    patternId: existing?.patternId || "",
    marketTags: existing?.marketTags || [],
    notes: existing?.notes || "",
    images: existing?.images || [],
    tags: existing?.tags || [],
    txIds: existing?.txIds || [],
  });
  const [mktTagInput, setMktTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const fileRef = useRef();
  const sugRef = useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const patternOptions = useMemo(() => {
    const opts = [];
    topPatterns.forEach(p => {
      opts.push({ id: p.id, label: p.name });
      getChildren(p.id).forEach(c => opts.push({ id: c.id, label: `  └ ${c.name}` }));
    });
    return opts;
  }, [topPatterns, getChildren]);

  // Calculate P&L from form
  const calcPnl = () => {
    const entry = parseFloat(form.avgEntry) || 0;
    const exit = parseFloat(form.avgExit) || 0;
    const shares = parseFloat(form.totalShares) || 0;
    if (!entry || !shares) return { pnl: 0, returnPct: 0, holdingDays: 0 };
    const pnl = form.side === "long" ? (exit - entry) * shares : (entry - exit) * shares;
    const returnPct = entry > 0 ? ((form.side === "long" ? exit - entry : entry - exit) / entry * 100) : 0;
    let holdingDays = 0;
    if (form.entryDate && form.exitDate) holdingDays = Math.ceil((new Date(form.exitDate) - new Date(form.entryDate)) / 86400000);
    return { pnl: +pnl.toFixed(2), returnPct: +returnPct.toFixed(2), holdingDays };
  };
  const calc = calcPnl();

  const handleImage = (e) => {
    const files = Array.from(e.target.files).slice(0, 2 - form.images.length);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => setForm(f => ({ ...f, images: [...f.images, ev.target.result].slice(0, 2) }));
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const addMarketTag = (t) => {
    const tag = (t || mktTagInput).trim();
    if (tag && !form.marketTags.includes(tag)) set("marketTags", [...form.marketTags, tag]);
    setMktTagInput("");
    setShowSuggestions(false);
  };

  const mktSuggestions = useMemo(() => {
    if (!mktTagInput.trim()) return allMktTags.filter(t => !form.marketTags.includes(t));
    return allMktTags.filter(t => t.toLowerCase().includes(mktTagInput.toLowerCase()) && !form.marketTags.includes(t));
  }, [mktTagInput, allMktTags, form.marketTags]);

  useEffect(() => {
    const handler = (e) => { if (sugRef.current && !sugRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSubmit = () => {
    if (!form.ticker.trim()) { setFormError("請輸入股票代碼"); return; }
    if (!form.avgEntry) { setFormError("請輸入進場價格"); return; }
    setFormError(null);
    const tags = extractTags(form.notes);
    onSave({
      ...form,
      ticker: form.ticker.trim().toUpperCase(),
      avgEntry: parseFloat(form.avgEntry) || 0,
      avgExit: parseFloat(form.avgExit) || 0,
      totalShares: parseFloat(form.totalShares) || 0,
      pnl: calc.pnl,
      pnlWithComm: calc.pnl,
      returnPct: calc.returnPct,
      holdingDays: calc.holdingDays,
      tags,
    });
  };

  return (
    <div>
      <div style={S.h1}>{isEdit ? "編輯交易" : "手動新增交易"}</div>
      <div style={S.sub}>{isEdit ? `${form.ticker} — ${form.entryDate}` : "記錄一筆新交易"}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
        <div>
          {/* Basic info */}
          <div style={S.card}>
            <div style={S.h3}>交易資訊</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={S.label}>股票代碼 *</label>
                <input style={S.input} value={form.ticker} onChange={e => set("ticker", e.target.value)} placeholder="AAPL" />
              </div>
              <div>
                <label style={S.label}>方向</label>
                <select style={S.select} value={form.side} onChange={e => set("side", e.target.value)}>
                  <option value="long">做多 Long</option>
                  <option value="short">做空 Short</option>
                </select>
              </div>
              <div>
                <label style={S.label}>狀態</label>
                <select style={S.select} value={form.status} onChange={e => set("status", e.target.value)}>
                  <option value="closed">已平倉</option>
                  <option value="open">持倉中</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={S.label}>進場日期</label>
                <input type="date" style={S.input} value={form.entryDate} onChange={e => set("entryDate", e.target.value)} />
              </div>
              <div>
                <label style={S.label}>出場日期</label>
                <input type="date" style={S.input} value={form.exitDate} onChange={e => set("exitDate", e.target.value)} />
              </div>
              <div>
                <label style={S.label}>進場均價 *</label>
                <input type="number" step="0.01" style={S.input} value={form.avgEntry} onChange={e => set("avgEntry", e.target.value)} />
              </div>
              <div>
                <label style={S.label}>出場均價</label>
                <input type="number" step="0.01" style={S.input} value={form.avgExit} onChange={e => set("avgExit", e.target.value)} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
              <div>
                <label style={S.label}>股數</label>
                <input type="number" style={S.input} value={form.totalShares} onChange={e => set("totalShares", e.target.value)} />
              </div>
              <div>
                <label style={S.label}>P&L (自動計算)</label>
                <div style={{ padding: "8px 11px", fontWeight: 700, fontSize: 14, color: calc.pnl >= 0 ? "#059669" : "#DC2626" }}>{money(calc.pnl)}</div>
              </div>
              <div>
                <label style={S.label}>報酬率 (自動計算)</label>
                <div style={{ padding: "8px 11px", fontWeight: 700, fontSize: 14, color: calc.returnPct >= 0 ? "#059669" : "#DC2626" }}>{pctFmt(calc.returnPct)}</div>
              </div>
            </div>
          </div>

          {/* Pattern & Market tags */}
          <div style={S.card}>
            <div style={S.h3}>分類標記</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={S.label}>型態分類</label>
                <select style={S.select} value={form.patternId} onChange={e => set("patternId", e.target.value)}>
                  <option value="">— 不指定 —</option>
                  {patternOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div ref={sugRef}>
              <label style={S.label}>市場標籤</label>
              <div style={{ position: "relative" }}>
                <div style={S.flexGap(6)}>
                  <input style={{ ...S.input, flex: 1 }} value={mktTagInput}
                    onChange={e => { setMktTagInput(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="輸入標籤..."
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMarketTag(); } }} />
                  <button style={S.btn()} onClick={() => addMarketTag()}>加入</button>
                </div>
                {showSuggestions && mktSuggestions.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 70, marginTop: 2, background: "#FFF", border: "1px solid #E2E8F0", borderRadius: 7, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", zIndex: 10, maxHeight: 150, overflowY: "auto" }}>
                    {mktSuggestions.map(t => (
                      <div key={t} style={{ padding: "6px 12px", cursor: "pointer", fontSize: 12.5, color: "#334155" }}
                        onMouseDown={e => { e.preventDefault(); addMarketTag(t); }}
                        onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        📌 {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {form.marketTags.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {form.marketTags.map(t => (
                    <span key={t} style={{ ...S.tag("#FEF3C7", "#92400E"), cursor: "pointer" }} onClick={() => set("marketTags", form.marketTags.filter(x => x !== t))}>
                      📌 {t} ✕
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div style={S.card}>
            <div style={S.h3}>交易筆記</div>
            <textarea style={{ ...S.textarea, minHeight: 100 }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="記錄你的交易想法...&#10;#進場理由 #停損設定" />
            {extractTags(form.notes).length > 0 && (
              <div style={{ marginTop: 6 }}>
                {extractTags(form.notes).map(t => <span key={t} style={S.tag()}>#{t}</span>)}
              </div>
            )}
          </div>
        </div>

        <div>
          {/* Images */}
          <div style={S.card}>
            <div style={S.h3}>截圖（最多 2 張）</div>
            {form.images.map((img, i) => (
              <div key={i} style={{ position: "relative", marginBottom: 10 }}>
                <img src={img} alt="" style={{ ...S.img, maxHeight: 240 }} />
                <button onClick={() => setForm(f => ({ ...f, images: f.images.filter((_, j) => j !== i) }))}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", color: "#FFF", border: "none", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
            ))}
            {form.images.length < 2 && (
              <div onClick={() => fileRef.current?.click()}
                style={{ border: "2px dashed #D1D5DB", borderRadius: 8, padding: 28, textAlign: "center", cursor: "pointer", color: "#94A3B8" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#4F46E5"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#D1D5DB"}>
                <div style={{ fontSize: 24 }}>📷</div>
                <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 500 }}>點擊上傳圖片</div>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImage} />
              </div>
            )}
          </div>

          <div style={{ ...S.flexGap(8), justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
            {formError && <div style={{ width: "100%", textAlign: "right", color: "#DC2626", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>⚠ {formError}</div>}
            <button style={S.btnOutline} onClick={onCancel}>取消</button>
            <button style={S.btn()} onClick={handleSubmit}>{isEdit ? "更新" : "儲存交易"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
