import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { auth, googleProvider, db } from "./firebase.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const extractTags = (text) => {
  const m = (text||"").match(/#[\w\u4e00-\u9fff\u3400-\u4dbf]+/g);
  return m ? [...new Set(m.map(t => t.slice(1)))] : [];
};
const fmt = (d) => d ? new Date(d).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
const pct = (n, d) => d === 0 ? "—" : Math.round((n / d) * 100) + "%";

const COLORS = ["#7C8CF8","#60A5FA","#34D399","#FBBF24","#F87171","#A78BFA","#F472B6","#38BDF8","#4ADE80","#FB923C"];
const VIEWS = { DASH:"dash", PATTERNS:"patterns", CASES:"cases", ADD:"add", EDIT:"edit", STATS:"stats", SEARCH:"search", JOURNAL:"journal", JOURNAL_EDIT:"journal_edit" };

/* ── Firestore Storage Helpers ── */
async function fsLoadPatterns(uid) {
  try { const snap = await getDoc(doc(db, "users", uid, "data", "patterns")); return snap.exists() ? snap.data().items || [] : []; } catch(e) { console.error("load patterns err", e); return []; }
}
async function fsSavePatterns(uid, p) {
  try { await setDoc(doc(db, "users", uid, "data", "patterns"), { items: p }); } catch(e) { console.error("save patterns err", e); }
}
async function fsLoadCasesIndex(uid) {
  try { const snap = await getDoc(doc(db, "users", uid, "data", "casesIndex")); return snap.exists() ? snap.data().items || [] : []; } catch(e) { console.error("load index err", e); return []; }
}
async function fsSaveCasesIndex(uid, idx) {
  try { await setDoc(doc(db, "users", uid, "data", "casesIndex"), { items: idx }); } catch(e) { console.error("save index err", e); }
}
async function fsSaveCase(uid, c) {
  try { await setDoc(doc(db, "users", uid, "cases", c.id), c); } catch(e) { console.error("save case err", e); }
}
async function fsLoadCase(uid, id) {
  try { const snap = await getDoc(doc(db, "users", uid, "cases", id)); return snap.exists() ? snap.data() : null; } catch(e) { console.error("load case err", e); return null; }
}
async function fsDeleteCase(uid, id) {
  try { await deleteDoc(doc(db, "users", uid, "cases", id)); } catch(e) { console.error("delete case err", e); }
}
async function fsLoadAllCases(uid) {
  try { const snap = await getDocs(collection(db, "users", uid, "cases")); const store = {}; snap.forEach(d => { store[d.id] = d.data(); }); return store; } catch(e) { console.error("load all cases err", e); return {}; }
}

/* ── Journal Firestore Helpers ── */
async function fsLoadJournalsIndex(uid) {
  try { const snap = await getDoc(doc(db, "users", uid, "data", "journalsIndex")); return snap.exists() ? snap.data().items || [] : []; } catch(e) { console.error("load journals index err", e); return []; }
}
async function fsSaveJournalsIndex(uid, idx) {
  try { await setDoc(doc(db, "users", uid, "data", "journalsIndex"), { items: idx }); } catch(e) { console.error("save journals index err", e); }
}
async function fsSaveJournal(uid, j) {
  try { await setDoc(doc(db, "users", uid, "journals", j.date), j); } catch(e) { console.error("save journal err", e); }
}
async function fsLoadJournal(uid, date) {
  try { const snap = await getDoc(doc(db, "users", uid, "journals", date)); return snap.exists() ? snap.data() : null; } catch(e) { console.error("load journal err", e); return null; }
}
async function fsDeleteJournal(uid, date) {
  try { await deleteDoc(doc(db, "users", uid, "journals", date)); } catch(e) { console.error("delete journal err", e); }
}

/* ── Image Compression ── */
function compressImage(file, maxWidth = 1600, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Styles ── */
const font = `'DM Sans', 'Noto Sans TC', sans-serif`;
const S = {
  app: { display: "flex", height: "100vh", fontFamily: font, background: "#F4F6FA", color: "#1E293B", fontSize: 14, overflow: "hidden" },
  sidebar: { width: 200, minWidth: 200, background: "#FFFFFF", borderRight: "1px solid #E8ECF1", display: "flex", flexDirection: "column", padding: "20px 0" },
  logo: { padding: "0 18px", marginBottom: 28, fontWeight: 700, fontSize: 16, color: "#4F46E5", letterSpacing: "-0.02em" },
  nav: { display: "flex", flexDirection: "column", gap: 1, padding: "0 8px", flex: 1 },
  navItem: (active) => ({
    padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontWeight: active ? 600 : 400,
    background: active ? "#EEF2FF" : "transparent", color: active ? "#4F46E5" : "#64748B",
    display: "flex", alignItems: "center", gap: 9, transition: "all .15s", fontSize: 13
  }),
  main: { flex: 1, overflow: "auto", padding: "24px 32px" },
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
  tag: (bg = "#EEF2FF", fg = "#4F46E5") => ({
    display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11,
    fontWeight: 600, background: bg, color: fg, marginRight: 4, marginBottom: 3
  }),
  badge: (type) => {
    const m = { success: ["#ECFDF5", "#059669"], failure: ["#FEF2F2", "#DC2626"], pending: ["#FFFBEB", "#D97706"] };
    const [bg, fg] = m[type] || m.pending;
    return { display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color: fg };
  },
  flexBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  flexGap: (g = 8) => ({ display: "flex", gap: g, alignItems: "center" }),
  stat: { textAlign: "center", padding: "16px 12px" },
  statNum: { fontSize: 26, fontWeight: 700, color: "#4F46E5" },
  statLabel: { fontSize: 11.5, color: "#94A3B8", marginTop: 3 },
  img: { width: "100%", borderRadius: 7, objectFit: "cover", border: "1px solid #E2E8F0", cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 },
  modal: { background: "#FFF", borderRadius: 12, padding: 24, maxWidth: 480, width: "92%", maxHeight: "85vh", overflow: "auto" },
  select: { width: "100%", padding: "8px 11px", borderRadius: 7, border: "1px solid #D1D5DB", fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box", color: "#1E293B", background: "#FFF" },
};

/* ── Icons ── */
const Icon = ({ name, size = 17 }) => {
  const icons = {
    home: <path d="M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>,
    grid: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>,
    folder: <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    chart: <path d="M3 3v18h18M7 16l4-4 4 4 5-5"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></>,
    edit: <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>,
    trash: <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>,
    x: <path d="M18 6L6 18M6 6l12 12"/>,
    img: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></>,
    back: <path d="M19 12H5M12 19l-7-7 7-7"/>,
    subitem: <path d="M9 3v12a3 3 0 003 3h9"/>,
    journal: <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>,
    link: <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
};

const StatCard = ({ label, value, sub, color }) => (
  <div style={{ ...S.cardSm, ...S.stat }}>
    <div style={{ ...S.statNum, color: color || "#4F46E5" }}>{value}</div>
    <div style={S.statLabel}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
  </div>
);

const Dot = ({ color, size = 10 }) => (
  <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0 }} />
);

const Lightbox = ({ src, onClose }) => (
  <div style={S.overlay} onClick={onClose}>
    <img src={src} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: 8, objectFit: "contain" }} onClick={e => e.stopPropagation()} />
  </div>
);

function getPatternLabel(p, patterns) {
  if (!p) return "—";
  if (p.parentId) {
    const parent = patterns.find(x => x.id === p.parentId);
    return parent ? `${parent.name} › ${p.name}` : p.name;
  }
  return p.name;
}

function getDescendantIds(patternId, patterns) {
  const ids = [patternId];
  patterns.filter(p => p.parentId === patternId).forEach(c => ids.push(...getDescendantIds(c.id, patterns)));
  return ids;
}

/* ══════════════════════════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════════════════════════ */
function StockDatabook({ userId }) {
  const [view, setView] = useState(VIEWS.DASH);
  const [patterns, setPatterns] = useState([]);
  const [casesIndex, setCasesIndex] = useState([]);
  const [caseStore, setCaseStore] = useState({}); // id -> full case (with images)
  const [loading, setLoading] = useState(true);
  const [selectedPatternId, setSelectedPatternId] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [editingCase, setEditingCase] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [patternModal, setPatternModal] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [journalsIndex, setJournalsIndex] = useState([]);
  const [journalStore, setJournalStore] = useState({});
  const [editingJournal, setEditingJournal] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  };

  const allMktTags = useMemo(() => {
    const set = new Set();
    casesIndex.forEach(c => (c.marketTags || []).forEach(t => set.add(t)));
    journalsIndex.forEach(j => (j.marketTags || []).forEach(t => set.add(t)));
    return [...set].sort();
  }, [casesIndex, journalsIndex]);

  useEffect(() => {
    let done = false;
    (async () => {
      try {
        const p = await fsLoadPatterns(userId);
        const ci = await fsLoadCasesIndex(userId);
        const ji = await fsLoadJournalsIndex(userId);
        if (!done) { setPatterns(p); setCasesIndex(ci); setJournalsIndex(ji); }
        // No longer loading all cases upfront - they load on demand
      } catch (e) { console.error("Load error:", e); }
      done = true;
      setLoading(false);
    })();
    const t = setTimeout(() => { if (!done) { done = true; setLoading(false); } }, 6000);
    return () => clearTimeout(t);
  }, [userId]);

  const savePatternFn = (p) => {
    let next;
    if (patterns.find(x => x.id === p.id)) {
      next = patterns.map(x => x.id === p.id ? p : x);
    } else {
      next = [...patterns, p];
    }
    setPatterns(next);
    setPatternModal(null);
    showToast("型態已儲存");
    fsSavePatterns(userId, next); // fire and forget
  };

  const deletePatternFn = (id) => {
    const allIds = getDescendantIds(id, patterns);
    const related = casesIndex.filter(c => allIds.includes(c.patternId));
    if (related.length > 0 && !confirm(`此型態及子分類下共有 ${related.length} 筆案例，確定刪除？`)) return;
    const next = patterns.filter(x => !allIds.includes(x.id));
    setPatterns(next);
    fsSavePatterns(userId, next);
    const newIdx = casesIndex.filter(c => !allIds.includes(c.patternId));
    setCasesIndex(newIdx);
    fsSaveCasesIndex(userId, newIdx);
    for (const c of related) fsDeleteCase(userId, c.id);
    showToast("已刪除");
  };

  const saveCaseFn = (c) => {
    const { images, ...indexEntry } = c;
    indexEntry.tags = c.tags;
    indexEntry.marketTags = c.marketTags;
    indexEntry.notes = c.notes;
    indexEntry.marketContext = c.marketContext;
    let nextIdx;
    if (casesIndex.find(x => x.id === c.id)) {
      nextIdx = casesIndex.map(x => x.id === c.id ? indexEntry : x);
    } else {
      nextIdx = [...casesIndex, indexEntry];
    }
    setCasesIndex(nextIdx);
    // Store full case in memory for instant access
    setCaseStore(prev => ({ ...prev, [c.id]: c }));
    // Persist in background
    fsSaveCasesIndex(userId, nextIdx);
    fsSaveCase(userId, c);
  };

  const deleteCaseFn = (id) => {
    if (!confirm("確定刪除這筆案例？")) return;
    const nextIdx = casesIndex.filter(x => x.id !== id);
    setCasesIndex(nextIdx);
    setCaseStore(prev => { const n = { ...prev }; delete n[id]; return n; });
    fsSaveCasesIndex(userId, nextIdx);
    fsDeleteCase(userId, id);
    if (selectedCase?.id === id) setSelectedCase(null);
    showToast("已刪除");
  };

  // Tag management: delete a market tag from ALL cases
  const deleteMarketTag = (tagToDelete) => {
    const newIdx = casesIndex.map(c => {
      if ((c.marketTags || []).includes(tagToDelete)) {
        return { ...c, marketTags: c.marketTags.filter(t => t !== tagToDelete) };
      }
      return c;
    });
    setCasesIndex(newIdx);
    fsSaveCasesIndex(userId, newIdx);
    // Also update full case store
    const newStore = { ...caseStore };
    Object.keys(newStore).forEach(id => {
      const c = newStore[id];
      if ((c.marketTags || []).includes(tagToDelete)) {
        newStore[id] = { ...c, marketTags: c.marketTags.filter(t => t !== tagToDelete) };
        fsSaveCase(userId, newStore[id]);
      }
    });
    setCaseStore(newStore);
    showToast(`已刪除標籤「${tagToDelete}」`);
  };

  // Tag management: rename a market tag across ALL cases
  const renameMarketTag = (oldTag, newTag) => {
    if (!newTag.trim() || oldTag === newTag.trim()) return;
    const nt = newTag.trim();
    const newIdx = casesIndex.map(c => {
      if ((c.marketTags || []).includes(oldTag)) {
        const tags = c.marketTags.map(t => t === oldTag ? nt : t);
        return { ...c, marketTags: [...new Set(tags)] };
      }
      return c;
    });
    setCasesIndex(newIdx);
    fsSaveCasesIndex(userId, newIdx);
    const newStore = { ...caseStore };
    Object.keys(newStore).forEach(id => {
      const c = newStore[id];
      if ((c.marketTags || []).includes(oldTag)) {
        const tags = c.marketTags.map(t => t === oldTag ? nt : t);
        newStore[id] = { ...c, marketTags: [...new Set(tags)] };
        fsSaveCase(userId, newStore[id]);
      }
    });
    setCaseStore(newStore);
    showToast(`已將「${oldTag}」改為「${nt}」`);
  };

  const openCase = (id) => {
    const c = caseStore[id];
    if (c) {
      setSelectedCase(c);
    } else {
      fsLoadCase(userId, id).then(loaded => {
        if (loaded) {
          setCaseStore(prev => ({ ...prev, [id]: loaded }));
          setSelectedCase(loaded);
        }
      });
    }
  };

  // Load a case on demand and cache it
  const loadCaseOnDemand = useCallback((id) => {
    if (caseStore[id]) return; // already cached
    fsLoadCase(userId, id).then(loaded => {
      if (loaded) {
        setCaseStore(prev => ({ ...prev, [id]: loaded }));
      }
    });
  }, [caseStore, userId]);

  /* ── Journal CRUD ── */
  const saveJournalFn = (j) => {
    const indexEntry = { date: j.date, title: j.title, marketTags: j.marketTags || [], tags: j.tags || [], linkedCases: j.linkedCases || [] };
    let nextIdx;
    if (journalsIndex.find(x => x.date === j.date)) {
      nextIdx = journalsIndex.map(x => x.date === j.date ? indexEntry : x);
    } else {
      nextIdx = [...journalsIndex, indexEntry].sort((a, b) => b.date.localeCompare(a.date));
    }
    setJournalsIndex(nextIdx);
    setJournalStore(prev => ({ ...prev, [j.date]: j }));
    fsSaveJournalsIndex(userId, nextIdx);
    fsSaveJournal(userId, j);
  };

  const deleteJournalFn = (date) => {
    if (!confirm("確定刪除此日誌？")) return;
    const nextIdx = journalsIndex.filter(x => x.date !== date);
    setJournalsIndex(nextIdx);
    setJournalStore(prev => { const n = { ...prev }; delete n[date]; return n; });
    fsSaveJournalsIndex(userId, nextIdx);
    fsDeleteJournal(userId, date);
    showToast("已刪除日誌");
  };

  const loadJournalOnDemand = useCallback((date) => {
    if (journalStore[date]) return;
    fsLoadJournal(userId, date).then(loaded => {
      if (loaded) {
        setJournalStore(prev => ({ ...prev, [date]: loaded }));
      }
    });
  }, [journalStore, userId]);

  const getPattern = (id) => patterns.find(p => p.id === id);
  const topPatterns = useMemo(() => patterns.filter(p => !p.parentId), [patterns]);
  const getChildren = useCallback((pid) => patterns.filter(p => p.parentId === pid), [patterns]);

  if (loading) return (
    <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#94A3B8" }}>載入中...</div>
    </div>
  );

  return (
    <div style={S.app}>
      <div style={S.sidebar}>
        <div style={S.logo}>📊 Pattern Book</div>
        <nav style={S.nav}>
          {[
            [VIEWS.DASH, "home", "總覽"],
            [VIEWS.PATTERNS, "grid", "型態分類"],
            [VIEWS.CASES, "folder", "案例瀏覽"],
            [VIEWS.ADD, "plus", "新增案例"],
            [VIEWS.JOURNAL, "journal", "📝 盤勢日誌"],
            [VIEWS.STATS, "chart", "統計分析"],
            [VIEWS.SEARCH, "search", "搜尋"],
          ].map(([v, icon, label]) => (
            <div key={v} style={S.navItem(view === v || (v === VIEWS.JOURNAL && view === VIEWS.JOURNAL_EDIT))} onClick={() => { setView(v); if (v === VIEWS.CASES) { setSelectedPatternId(null); setSelectedCase(null); } }}>
              <Icon name={icon} size={16} /> {label}
            </div>
          ))}
        </nav>
        <div style={{ padding: "0 18px", fontSize: 11, color: "#CBD5E1" }}>
          {casesIndex.length} 筆案例 · {patterns.length} 個型態 · {journalsIndex.length} 篇日誌
        </div>
      </div>

      <div style={S.main}>
        {view === VIEWS.DASH && <Dashboard patterns={patterns} casesIndex={casesIndex} goToCases={(pid) => { setSelectedPatternId(pid); setSelectedCase(null); setView(VIEWS.CASES); }} openCase={(id) => { openCase(id); setView(VIEWS.CASES); }} getPattern={getPattern} getChildren={getChildren} />}
        {view === VIEWS.PATTERNS && <PatternsView patterns={patterns} casesIndex={casesIndex} topPatterns={topPatterns} getChildren={getChildren} goToCases={(pid) => { setSelectedPatternId(pid); setSelectedCase(null); setView(VIEWS.CASES); }} onAdd={(parentId) => setPatternModal({ mode: "add", parentId })} onEdit={(p) => setPatternModal({ mode: "edit", pattern: p })} onDelete={deletePatternFn} allMktTags={allMktTags} onDeleteTag={deleteMarketTag} onRenameTag={renameMarketTag} />}
        {view === VIEWS.CASES && <CasesView patterns={patterns} casesIndex={casesIndex} caseStore={caseStore} loadCase={loadCaseOnDemand} selectedPatternId={selectedPatternId} setSelectedPatternId={setSelectedPatternId} selectedCase={selectedCase} setSelectedCase={setSelectedCase} openCase={openCase} getPattern={getPattern} getChildren={getChildren} topPatterns={topPatterns} setLightbox={setLightboxSrc} onEdit={(c) => { setEditingCase(c); setView(VIEWS.EDIT); }} onDelete={deleteCaseFn} onUpdateResult={(c, result) => { const updated = { ...c, result }; setSelectedCase(updated); saveCaseFn(updated); showToast(result === "success" ? "已標記成功" : result === "failure" ? "已標記失敗" : "已設為待觀察"); }} onDeleteTag={(c, type, tag) => { let updated; if (type === "market") { updated = { ...c, marketTags: (c.marketTags || []).filter(t => t !== tag) }; } else { const newNotes = c.notes.replace(new RegExp("#" + tag + "(?=[\\s\\n]|$)", "g"), "").trim(); updated = { ...c, notes: newNotes, tags: extractTags(newNotes) }; } saveCaseFn(updated); setCaseStore(prev => ({ ...prev, [c.id]: updated })); showToast("已刪除標籤"); }} />}
        {view === VIEWS.ADD && <CaseForm patterns={patterns} topPatterns={topPatterns} getChildren={getChildren} allMktTags={allMktTags} onSave={(c) => { saveCaseFn(c); showToast("✓ 新增成功！"); }} onCancel={() => setView(VIEWS.DASH)} />}
        {view === VIEWS.EDIT && editingCase && <CaseForm patterns={patterns} topPatterns={topPatterns} getChildren={getChildren} allMktTags={allMktTags} existing={editingCase} onSave={(c) => { saveCaseFn(c); setSelectedCase(c); showToast("✓ 更新成功"); setView(VIEWS.CASES); }} onCancel={() => setView(VIEWS.CASES)} />}
        {view === VIEWS.STATS && <StatsView patterns={patterns} casesIndex={casesIndex} topPatterns={topPatterns} getChildren={getChildren} allMktTags={allMktTags} />}
        {view === VIEWS.SEARCH && <SearchView casesIndex={casesIndex} caseStore={caseStore} loadCase={loadCaseOnDemand} getPattern={getPattern} patterns={patterns} topPatterns={topPatterns} getChildren={getChildren} allMktTags={allMktTags} setLightbox={setLightboxSrc} />}
        {view === VIEWS.JOURNAL && <JournalView journalsIndex={journalsIndex} journalStore={journalStore} loadJournal={loadJournalOnDemand} casesIndex={casesIndex} caseStore={caseStore} loadCase={loadCaseOnDemand} getPattern={getPattern} patterns={patterns} setLightbox={setLightboxSrc} onNew={(date) => { setEditingJournal({ date: date || new Date().toISOString().slice(0,10) }); setView(VIEWS.JOURNAL_EDIT); }} onEdit={(j) => { setEditingJournal(j); setView(VIEWS.JOURNAL_EDIT); }} onDelete={deleteJournalFn} openCase={(id) => { openCase(id); setView(VIEWS.CASES); }} />}
        {view === VIEWS.JOURNAL_EDIT && <JournalForm existing={editingJournal?.content ? editingJournal : (editingJournal?.date && journalStore[editingJournal.date]) || null} defaultDate={editingJournal?.date} allMktTags={allMktTags} casesIndex={casesIndex} getPattern={getPattern} patterns={patterns} topPatterns={topPatterns} getChildren={getChildren} onSave={(j) => { saveJournalFn(j); showToast("✓ 日誌已儲存"); setView(VIEWS.JOURNAL); }} onCancel={() => setView(VIEWS.JOURNAL)} />}
      </div>

      {patternModal && <PatternModal existing={patternModal.mode === "edit" ? patternModal.pattern : null} parentId={patternModal.parentId || null} patterns={patterns} topPatterns={topPatterns} onSave={savePatternFn} onClose={() => setPatternModal(null)} />}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      {toastMsg && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#059669", color: "#FFF", padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 1000, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>{toastMsg}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════════ */
function Dashboard({ patterns, casesIndex, goToCases, openCase, getPattern, getChildren }) {
  const total = casesIndex.length;
  const success = casesIndex.filter(c => c.result === "success").length;
  const failure = casesIndex.filter(c => c.result === "failure").length;
  const pending = casesIndex.filter(c => c.result === "pending").length;
  const decided = success + failure;
  const recent = [...casesIndex].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 8);
  const topPatterns = patterns.filter(p => !p.parentId);

  return (
    <div>
      <div style={S.h1}>總覽</div>
      <div style={S.sub}>你的股價型態學習記錄</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="總案例數" value={total} />
        <StatCard label="整體勝率" value={decided > 0 ? pct(success, decided) : "—"} sub={decided > 0 ? `${success}勝 ${failure}負` : ""} color="#059669" />
        <StatCard label="待觀察" value={pending} color="#D97706" />
        <StatCard label="型態數" value={patterns.length} color="#7C3AED" />
      </div>
      {topPatterns.length > 0 && (
        <div style={S.card}>
          <div style={S.h3}>各型態概覽</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
            {topPatterns.map(p => {
              const allIds = getDescendantIds(p.id, patterns);
              const cases = casesIndex.filter(c => allIds.includes(c.patternId));
              const s = cases.filter(c => c.result === "success").length;
              const f = cases.filter(c => c.result === "failure").length;
              const d = s + f;
              const children = getChildren(p.id);
              return (
                <div key={p.id} style={{ ...S.cardSm, cursor: "pointer", transition: "box-shadow .15s" }}
                  onClick={() => goToCases(p.id)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.07)"}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                  <div style={S.flexGap(7)}>
                    <Dot color={p.color} size={11} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                  </div>
                  {children.length > 0 && <div style={{ marginTop: 4, fontSize: 11, color: "#94A3B8" }}>{children.map(c => c.name).join("、")}</div>}
                  <div style={{ marginTop: 6, fontSize: 11.5, color: "#94A3B8" }}>{cases.length} 筆 · 勝率 {d > 0 ? pct(s, d) : "—"}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <div style={S.card}>
          <div style={S.h3}>最近新增</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recent.map(c => {
              const p = getPattern(c.patternId);
              return (
                <div key={c.id} style={{ ...S.flexBetween, padding: "7px 10px", borderRadius: 7, background: "#F8FAFC", cursor: "pointer" }} onClick={() => openCase(c.id)}>
                  <div style={S.flexGap(8)}>
                    {p && <Dot color={p.color} />}
                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>{c.ticker}</span>
                    {p && <span style={S.tag()}>{getPatternLabel(p, patterns)}</span>}
                  </div>
                  <div style={S.flexGap(6)}>
                    <span style={S.badge(c.result)}>{c.result === "success" ? "成功" : c.result === "failure" ? "失敗" : "待觀察"}</span>
                    <span style={{ fontSize: 11, color: "#CBD5E1" }}>{fmt(c.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {patterns.length === 0 && casesIndex.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", padding: 44, color: "#94A3B8" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📈</div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>開始記錄你的第一個型態</div>
          <div style={{ fontSize: 12.5 }}>先到「型態分類」建立分類，再「新增案例」開始記錄</div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PATTERNS MANAGEMENT
   ══════════════════════════════════════════════════════════════ */
function PatternsView({ patterns, casesIndex, topPatterns, getChildren, goToCases, onAdd, onEdit, onDelete, allMktTags, onDeleteTag, onRenameTag }) {
  const [editingTag, setEditingTag] = useState(null);
  const [editTagValue, setEditTagValue] = useState("");

  return (
    <div>
      <div style={S.flexBetween}>
        <div><div style={S.h1}>型態分類</div><div style={S.sub}>管理你的股價型態分類（支援子分類）</div></div>
        <button style={S.btn()} onClick={() => onAdd(null)}>+ 新增型態</button>
      </div>
      {topPatterns.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 36, color: "#94A3B8" }}>尚無型態分類</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {topPatterns.map(p => {
            const allIds = getDescendantIds(p.id, patterns);
            const cases = casesIndex.filter(c => allIds.includes(c.patternId));
            const s = cases.filter(c => c.result === "success").length;
            const f = cases.filter(c => c.result === "failure").length;
            const d = s + f;
            const children = getChildren(p.id);
            return (
              <div key={p.id} style={S.card}>
                <div style={S.flexBetween}>
                  <div style={S.flexGap(10)}>
                    <Dot color={p.color} size={13} />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: "#94A3B8" }}>{cases.length} 筆 · 勝率 {d > 0 ? pct(s, d) : "—"}</span>
                  </div>
                  <div style={S.flexGap(4)}>
                    <button style={{ ...S.btnOutline, padding: "4px 8px", fontSize: 11 }} onClick={() => onAdd(p.id)}>+ 子分類</button>
                    <button style={{ ...S.btnOutline, padding: "4px 8px" }} onClick={() => onEdit(p)}><Icon name="edit" size={13} /></button>
                    <button style={{ ...S.btnOutline, padding: "4px 8px", color: "#EF4444", borderColor: "#FECACA" }} onClick={() => onDelete(p.id)}><Icon name="trash" size={13} /></button>
                    <button style={{ ...S.btnOutline, padding: "4px 8px", fontSize: 11 }} onClick={() => goToCases(p.id)}>查看 →</button>
                  </div>
                </div>
                {p.description && <div style={{ marginTop: 6, fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>{p.description}</div>}
                {children.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #F1F5F9", display: "flex", flexDirection: "column", gap: 6 }}>
                    {children.map(child => {
                      const cc = casesIndex.filter(c => c.patternId === child.id);
                      const cs = cc.filter(c => c.result === "success").length;
                      const cf = cc.filter(c => c.result === "failure").length;
                      const cd = cs + cf;
                      return (
                        <div key={child.id} style={{ ...S.flexBetween, padding: "6px 10px 6px 24px", borderRadius: 6, background: "#FAFBFD" }}>
                          <div style={S.flexGap(8)}>
                            <Icon name="subitem" size={14} />
                            <Dot color={child.color || p.color} size={9} />
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{child.name}</span>
                            <span style={{ fontSize: 11, color: "#94A3B8" }}>{cc.length} 筆 · {cd > 0 ? pct(cs, cd) : "—"}</span>
                          </div>
                          <div style={S.flexGap(4)}>
                            <button style={{ ...S.btnOutline, padding: "3px 6px" }} onClick={() => onEdit(child)}><Icon name="edit" size={12} /></button>
                            <button style={{ ...S.btnOutline, padding: "3px 6px", color: "#EF4444", borderColor: "#FECACA" }} onClick={() => onDelete(child.id)}><Icon name="trash" size={12} /></button>
                            <button style={{ ...S.btnOutline, padding: "3px 6px", fontSize: 11 }} onClick={() => goToCases(child.id)}>查看</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Market Tag Management */}
      {allMktTags.length > 0 && (
        <div style={{ ...S.card, marginTop: 20 }}>
          <div style={S.h3}>市場標籤管理</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>刪除或重新命名標籤，會套用到所有使用該標籤的案例</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {allMktTags.map(tag => (
              <div key={tag} style={{ ...S.flexBetween, padding: "8px 12px", borderRadius: 7, background: "#FAFBFD" }}>
                {editingTag === tag ? (
                  <div style={S.flexGap(6)}>
                    <input style={{ ...S.input, width: 200, padding: "4px 8px" }} value={editTagValue} onChange={e => setEditTagValue(e.target.value)} autoFocus onKeyDown={e => { if (e.key === "Enter") { onRenameTag(tag, editTagValue); setEditingTag(null); } }} />
                    <button style={{ ...S.btn(), padding: "4px 10px", fontSize: 11 }} onClick={() => { onRenameTag(tag, editTagValue); setEditingTag(null); }}>確認</button>
                    <button style={{ ...S.btnOutline, padding: "4px 10px", fontSize: 11 }} onClick={() => setEditingTag(null)}>取消</button>
                  </div>
                ) : (
                  <span style={S.tag("#FEF3C7", "#92400E")}>📌 {tag}</span>
                )}
                {editingTag !== tag && (
                  <div style={S.flexGap(4)}>
                    <button style={{ ...S.btnOutline, padding: "3px 8px", fontSize: 11 }} onClick={() => { setEditingTag(tag); setEditTagValue(tag); }}>重新命名</button>
                    <button style={{ ...S.btnOutline, padding: "3px 8px", fontSize: 11, color: "#EF4444", borderColor: "#FECACA" }} onClick={() => onDeleteTag(tag)}>刪除</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Pattern Modal ── */
function PatternModal({ existing, parentId, patterns, topPatterns, onSave, onClose }) {
  const [name, setName] = useState(existing?.name || "");
  const [desc, setDesc] = useState(existing?.description || "");
  const [color, setColor] = useState(existing?.color || COLORS[0]);
  const [pid, setPid] = useState(existing?.parentId || parentId || "");
  const [err, setErr] = useState(null);
  const parent = pid ? patterns.find(p => p.id === pid) : null;

  const handleSave = () => {
    if (!name.trim()) { setErr("請輸入型態名稱"); return; }
    setErr(null);
    onSave({ id: existing?.id || genId(), name: name.trim(), description: desc.trim(), color, parentId: pid || null });
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.flexBetween, marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{existing ? "編輯型態" : (parentId ? "新增子分類" : "新增型態")}</div>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }} onClick={onClose}><Icon name="x" /></button>
        </div>
        {!existing && (
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>上層分類（留空為頂層）</label>
            <select style={S.select} value={pid} onChange={e => setPid(e.target.value)}>
              <option value="">— 無（頂層型態）—</option>
              {topPatterns.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {parent && <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10 }}>隸屬於：<strong>{parent.name}</strong></div>}
        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>型態名稱 *</label>
          <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder={pid ? "例：早期、晚期" : "例：杯柄型態、VCP"} autoFocus />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>描述</label>
          <textarea style={{ ...S.textarea, minHeight: 50 }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="特徵描述..." />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>標記顏色</label>
          <div style={S.flexGap(5)}>
            {COLORS.map(c => (
              <div key={c} onClick={() => setColor(c)} style={{
                width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
                border: color === c ? "3px solid #1E293B" : "3px solid transparent"
              }} />
            ))}
          </div>
        </div>
        {err && <div style={{ color: "#DC2626", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>⚠ {err}</div>}
        <div style={{ ...S.flexGap(8), justifyContent: "flex-end" }}>
          <button style={S.btnOutline} onClick={onClose}>取消</button>
          <button style={S.btn()} onClick={handleSave}>儲存</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   CASES BROWSE — Split View
   ══════════════════════════════════════════════════════════════ */
function CasesView({ patterns, casesIndex, caseStore, loadCase, selectedPatternId, setSelectedPatternId, selectedCase, setSelectedCase, openCase, getPattern, getChildren, topPatterns, setLightbox, onEdit, onDelete, onUpdateResult, onDeleteTag }) {
  const [resultFilter, setResultFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [viewIdx, setViewIdx] = useState(0); // current slide index

  const allTags = useMemo(() => {
    const set = new Set();
    casesIndex.forEach(c => { (c.tags || []).forEach(t => set.add(t)); (c.marketTags || []).forEach(t => set.add(t)); });
    return [...set].sort();
  }, [casesIndex]);

  const patternOptions = useMemo(() => {
    const opts = [];
    topPatterns.forEach(p => {
      opts.push({ id: p.id, label: p.name });
      getChildren(p.id).forEach(c => opts.push({ id: c.id, label: `  └ ${c.name}` }));
    });
    return opts;
  }, [topPatterns, getChildren]);

  const filtered = useMemo(() => {
    let list = casesIndex;
    if (selectedPatternId) {
      const allIds = getDescendantIds(selectedPatternId, patterns);
      list = list.filter(c => allIds.includes(c.patternId));
    }
    if (resultFilter !== "all") list = list.filter(c => c.result === resultFilter);
    if (tagFilter) list = list.filter(c => (c.tags || []).includes(tagFilter) || (c.marketTags || []).includes(tagFilter));
    list = [...list].sort((a, b) => sortBy === "newest" ? (b.createdAt || "").localeCompare(a.createdAt || "") : (a.createdAt || "").localeCompare(b.createdAt || ""));
    return list;
  }, [casesIndex, selectedPatternId, resultFilter, tagFilter, sortBy, patterns]);

  const pat = selectedPatternId ? getPattern(selectedPatternId) : null;

  // Current case in slideshow
  const safeIdx = Math.min(viewIdx, Math.max(0, filtered.length - 1));
  const currentEntry = filtered[safeIdx];
  const currentFull = currentEntry ? caseStore[currentEntry.id] : null;
  const currentPat = currentEntry ? getPattern(currentEntry.patternId) : null;

  // Lazy load current case when slideshow index changes
  useEffect(() => {
    if (currentEntry && !caseStore[currentEntry.id]) {
      loadCase(currentEntry.id);
    }
  }, [currentEntry?.id]);

  const goSlide = (dir) => {
    const next = safeIdx + dir;
    if (next >= 0 && next < filtered.length) setViewIdx(next);
  };

  const jumpTo = (idx) => {
    setViewIdx(idx);
  };

  // When clicking into detail mode
  const openDetail = (id) => {
    openCase(id);
    const idx = filtered.findIndex(c => c.id === id);
    if (idx >= 0) setViewIdx(idx);
  };

  return (
    <div>
      <div style={S.h1}>{pat ? getPatternLabel(pat, patterns) : "所有案例"}</div>
      <div style={S.sub}>{filtered.length} 筆案例{filtered.length > 0 ? ` · 第 ${safeIdx + 1} / ${filtered.length} 筆` : ""}</div>

      {/* Filters */}
      <div style={{ ...S.flexGap(8), flexWrap: "wrap", marginBottom: 14 }}>
        <select style={{ ...S.select, width: "auto", minWidth: 120 }} value={selectedPatternId || ""} onChange={e => { setSelectedPatternId(e.target.value || null); setSelectedCase(null); setViewIdx(0); }}>
          <option value="">所有型態</option>
          {patternOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 90 }} value={resultFilter} onChange={e => { setResultFilter(e.target.value); setViewIdx(0); }}>
          <option value="all">全部結果</option>
          <option value="success">成功</option>
          <option value="failure">失敗</option>
          <option value="pending">待觀察</option>
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 90 }} value={tagFilter} onChange={e => { setTagFilter(e.target.value); setViewIdx(0); }}>
          <option value="">所有標籤</option>
          {allTags.map(t => <option key={t} value={t}>#{t}</option>)}
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 90 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="newest">最新優先</option>
          <option value="oldest">最舊優先</option>
        </select>
        {selectedCase && (
          <button style={{ ...S.btnOutline, padding: "5px 10px", fontSize: 11 }} onClick={() => setSelectedCase(null)}>✕ 關閉詳情</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 36, color: "#94A3B8" }}>沒有符合條件的案例</div>
      ) : (
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* Left: compact card list for quick jump */}
          <div style={{ width: 200, minWidth: 200, maxHeight: "calc(100vh - 220px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((c, idx) => {
              const p = getPattern(c.patternId);
              const isActive = idx === safeIdx;
              return (
                <div key={c.id} style={{
                  padding: "8px 10px", borderRadius: 7, cursor: "pointer",
                  background: isActive ? "#EEF2FF" : "#FFF",
                  border: isActive ? "2px solid #4F46E5" : "1px solid #E8ECF1",
                  transition: "all .1s"
                }} onClick={() => jumpTo(idx)}>
                  <div style={S.flexBetween}>
                    <div style={S.flexGap(5)}>
                      {p && <Dot color={p.color} size={8} />}
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{c.ticker}</span>
                    </div>
                    <span style={S.badge(c.result)}>{c.result === "success" ? "成功" : c.result === "failure" ? "失敗" : "觀察"}</span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 10, color: "#CBD5E1" }}>{fmt(c.patternDate || c.createdAt)}</div>
                </div>
              );
            })}
          </div>

          {/* Right: slideshow - full chart + notes */}
          <div style={{ flex: 1, maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
            {currentEntry && (
              <div>
                {/* Header with nav arrows */}
                <div style={{ ...S.card, padding: 14 }}>
                  <div style={S.flexBetween}>
                    <div style={S.flexGap(10)}>
                      {currentPat && <Dot color={currentPat.color} size={12} />}
                      <span style={{ fontWeight: 700, fontSize: 18 }}>{currentEntry.ticker}</span>
                      {currentPat && <span style={S.tag(currentPat.color + "22", currentPat.color)}>{getPatternLabel(currentPat, patterns)}</span>}
                      <span style={S.badge(currentEntry.result)}>{currentEntry.result === "success" ? "✓ 成功" : currentEntry.result === "failure" ? "✗ 失敗" : "⏳ 待觀察"}</span>
                    </div>
                    <div style={S.flexGap(6)}>
                      <button style={{ ...S.btnOutline, padding: "6px 12px", fontSize: 16, fontWeight: 700 }} onClick={() => goSlide(-1)} disabled={safeIdx === 0}>←</button>
                      <span style={{ fontSize: 12, color: "#94A3B8", minWidth: 50, textAlign: "center" }}>{safeIdx + 1} / {filtered.length}</span>
                      <button style={{ ...S.btnOutline, padding: "6px 12px", fontSize: 16, fontWeight: 700 }} onClick={() => goSlide(1)} disabled={safeIdx === filtered.length - 1}>→</button>
                    </div>
                  </div>
                  <div style={{ marginTop: 6, ...S.flexGap(12), fontSize: 12, color: "#94A3B8" }}>
                    <span>型態日期：{fmt(currentEntry.patternDate)}</span>
                    <span>記錄：{fmt(currentEntry.createdAt)}</span>
                    {currentEntry.returnPct !== undefined && currentEntry.returnPct !== "" && (
                      <span style={{ fontWeight: 700, color: Number(currentEntry.returnPct) >= 0 ? "#059669" : "#DC2626" }}>
                        {Number(currentEntry.returnPct) >= 0 ? "+" : ""}{currentEntry.returnPct}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Full-width chart images */}
                {!currentFull && (
                  <div style={{ ...S.card, padding: 30, textAlign: "center", color: "#94A3B8" }}>載入中...</div>
                )}
                {currentFull && currentFull.images && currentFull.images.length > 0 && (
                  <div style={{ ...S.card, padding: 14 }}>
                    {currentFull.images.map((img, i) => (
                      <img key={i} src={img} alt="" style={{
                        width: "100%", borderRadius: 7, objectFit: "contain",
                        border: "1px solid #E2E8F0", cursor: "pointer",
                        marginBottom: i < currentFull.images.length - 1 ? 10 : 0,
                        maxHeight: 400
                      }} onClick={() => setLightbox(img)} />
                    ))}
                  </div>
                )}

                {/* Notes below chart */}
                {currentFull && currentFull.notes && (
                  <div style={{ ...S.card, padding: 14 }}>
                    <div style={S.h3}>筆記</div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#334155" }}>
                      {currentFull.notes.split(/(#[\w\u4e00-\u9fff\u3400-\u4dbf]+)/g).map((part, i) =>
                        part.match(/^#[\w\u4e00-\u9fff\u3400-\u4dbf]+$/) ?
                          <span key={i} style={{ color: "#4F46E5", fontWeight: 600, background: "#EEF2FF", padding: "1px 4px", borderRadius: 3 }}>{part}</span> :
                          <span key={i}>{part}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Market context */}
                {currentFull && (currentFull.marketContext || (currentFull.marketTags || []).length > 0) && (
                  <div style={{ ...S.card, padding: 14 }}>
                    <div style={S.h3}>市場狀態</div>
                    {(currentFull.marketTags || []).length > 0 && (
                      <div style={{ marginBottom: 8 }}>{currentFull.marketTags.map(t =>
                        <span key={t} style={{ ...S.tag("#FEF3C7", "#92400E"), cursor: "pointer" }}
                          onClick={() => onDeleteTag(currentFull, "market", t)}
                          title="點擊刪除此標籤">📌 {t} ✕</span>
                      )}</div>
                    )}
                    {currentFull.marketContext && <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#475569" }}>{currentFull.marketContext}</div>}
                  </div>
                )}

                {/* Action bar */}
                <div style={{ ...S.card, padding: 14 }}>
                  <div style={S.flexBetween}>
                    <div style={S.flexGap(5)}>
                      <button style={S.btn("#059669")} onClick={() => onUpdateResult(currentFull || currentEntry, "success")}>成功</button>
                      <button style={S.btn("#DC2626")} onClick={() => onUpdateResult(currentFull || currentEntry, "failure")}>失敗</button>
                      <button style={S.btn("#D97706")} onClick={() => onUpdateResult(currentFull || currentEntry, "pending")}>待觀察</button>
                    </div>
                    <div style={S.flexGap(5)}>
                      <button style={S.btnOutline} onClick={() => onEdit(currentFull || currentEntry)}><Icon name="edit" size={13} /> 編輯</button>
                      <button style={{ ...S.btnOutline, color: "#EF4444", borderColor: "#FECACA" }} onClick={() => { onDelete(currentEntry.id); if (safeIdx > 0) setViewIdx(safeIdx - 1); }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Case Detail Panel ── */
function CaseDetailPanel({ c, pattern, patterns, setLightbox, onEdit, onDelete, onUpdateResult }) {
  const tags = c.tags || extractTags(c.notes || "");
  const marketTags = c.marketTags || [];

  return (
    <div>
      <div style={{ ...S.card, padding: 14 }}>
        <div style={S.flexBetween}>
          <div style={S.flexGap(10)}>
            {pattern && <Dot color={pattern.color} size={12} />}
            <span style={{ fontWeight: 700, fontSize: 17 }}>{c.ticker}</span>
            {pattern && <span style={S.tag(pattern.color + "22", pattern.color)}>{getPatternLabel(pattern, patterns)}</span>}
          </div>
          <div style={S.flexGap(5)}>
            <button style={{ ...S.btnOutline, padding: "5px 10px" }} onClick={onEdit}><Icon name="edit" size={13} /> 編輯</button>
            <button style={{ ...S.btnOutline, padding: "5px 10px", color: "#EF4444", borderColor: "#FECACA" }} onClick={onDelete}><Icon name="trash" size={13} /></button>
          </div>
        </div>
        <div style={{ marginTop: 8, ...S.flexGap(14), fontSize: 12, color: "#94A3B8" }}>
          <span>型態日期：{fmt(c.patternDate)}</span>
          <span>記錄：{fmt(c.createdAt)}</span>
          {tags.length > 0 && tags.map(t => <span key={t} style={S.tag()}>#{t}</span>)}
        </div>
      </div>

      {(c.images || []).length > 0 && (
        <div style={{ ...S.card, padding: 14 }}>
          <div style={S.h3}>走勢圖</div>
          <div style={{ display: "grid", gridTemplateColumns: c.images.length > 1 ? "1fr 1fr" : "1fr", gap: 10 }}>
            {c.images.map((img, i) => (
              <img key={i} src={img} alt="" style={{ ...S.img, maxHeight: 280 }} onClick={() => setLightbox(img)} />
            ))}
          </div>
        </div>
      )}

      {c.notes && (
        <div style={{ ...S.card, padding: 14 }}>
          <div style={S.h3}>筆記</div>
          <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#334155" }}>
            {c.notes.split(/(#[\w\u4e00-\u9fff\u3400-\u4dbf]+)/g).map((part, i) =>
              part.match(/^#[\w\u4e00-\u9fff\u3400-\u4dbf]+$/) ?
                <span key={i} style={{ color: "#4F46E5", fontWeight: 600, background: "#EEF2FF", padding: "1px 4px", borderRadius: 3 }}>{part}</span> :
                <span key={i}>{part}</span>
            )}
          </div>
        </div>
      )}

      {c.marketContext && (
        <div style={{ ...S.card, padding: 14 }}>
          <div style={S.h3}>市場狀態</div>
          {marketTags.length > 0 && <div style={{ marginBottom: 8 }}>{marketTags.map(t => <span key={t} style={S.tag("#FEF3C7", "#92400E")}>📌 {t}</span>)}</div>}
          <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#475569" }}>{c.marketContext}</div>
        </div>
      )}

      <div style={{ ...S.card, padding: 14 }}>
        <div style={S.h3}>結果追蹤</div>
        <div style={{ ...S.flexGap(8), marginBottom: 10 }}>
          <span style={{ ...S.badge(c.result), fontSize: 12, padding: "4px 12px" }}>
            {c.result === "success" ? "✓ 成功" : c.result === "failure" ? "✗ 失敗" : "⏳ 待觀察"}
          </span>
          {c.returnPct !== undefined && c.returnPct !== "" && (
            <span style={{ fontSize: 13, fontWeight: 700, color: Number(c.returnPct) >= 0 ? "#059669" : "#DC2626" }}>
              {Number(c.returnPct) >= 0 ? "+" : ""}{c.returnPct}%
            </span>
          )}
        </div>
        <div style={S.flexGap(5)}>
          <button style={S.btn("#059669")} onClick={() => onUpdateResult("success")}>成功</button>
          <button style={S.btn("#DC2626")} onClick={() => onUpdateResult("failure")}>失敗</button>
          <button style={S.btn("#D97706")} onClick={() => onUpdateResult("pending")}>待觀察</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   CASE FORM
   ══════════════════════════════════════════════════════════════ */
function CaseForm({ patterns, topPatterns, getChildren, allMktTags, existing, onSave, onCancel }) {
  const isEdit = !!existing;
  const [formError, setFormError] = useState(null);
  const [form, setForm] = useState({
    id: existing?.id || genId(),
    patternId: existing?.patternId || "",
    ticker: existing?.ticker || "",
    patternDate: existing?.patternDate || new Date().toISOString().slice(0, 10),
    createdAt: existing?.createdAt || new Date().toISOString(),
    notes: existing?.notes || "",
    marketContext: existing?.marketContext || "",
    marketTags: existing?.marketTags || [],
    result: existing?.result || "pending",
    returnPct: existing?.returnPct ?? "",
    images: existing?.images || [],
    tags: existing?.tags || [],
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

  const handleImage = (e) => {
    const files = Array.from(e.target.files).slice(0, 2 - form.images.length);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => setForm(f => ({ ...f, images: [...f.images, ev.target.result].slice(0, 2) }));
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeImage = (idx) => setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));

  const addMarketTag = (t) => {
    const tag = (t || mktTagInput).trim();
    if (tag && !form.marketTags.includes(tag)) set("marketTags", [...form.marketTags, tag]);
    setMktTagInput("");
    setShowSuggestions(false);
  };

  const mktSuggestions = useMemo(() => {
    if (!mktTagInput.trim()) return allMktTags.filter(t => !form.marketTags.includes(t));
    const lower = mktTagInput.toLowerCase();
    return allMktTags.filter(t => t.toLowerCase().includes(lower) && !form.marketTags.includes(t));
  }, [mktTagInput, allMktTags, form.marketTags]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => { if (sugRef.current && !sugRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSubmit = () => {
    if (!form.ticker.trim()) { setFormError("請輸入股票代碼"); return; }
    if (!form.patternId) { setFormError("請選擇型態分類"); return; }
    setFormError(null);
    const tags = extractTags(form.notes);
    onSave({ ...form, ticker: form.ticker.trim(), tags });
    if (!isEdit) {
      // Clear form but keep pattern, date, market tags for next entry
      setForm({
        id: genId(),
        patternId: form.patternId,
        ticker: "",
        patternDate: form.patternDate,
        createdAt: new Date().toISOString(),
        notes: "",
        marketContext: form.marketContext,
        marketTags: [...form.marketTags],
        result: "pending",
        returnPct: "",
        images: [],
        tags: [],
      });
    }
  };

  return (
    <div>
      <div style={S.h1}>{isEdit ? "編輯案例" : "新增案例"}</div>
      <div style={S.sub}>{isEdit ? "修改案例資料" : "記錄一個新的股價型態案例"}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
        <div>
          <div style={S.card}>
            <div style={S.h3}>基本資訊</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={S.label}>股票代碼 *</label>
                <input style={S.input} value={form.ticker} onChange={e => set("ticker", e.target.value)} placeholder="例：AAPL, 2330.TW, NVDA US" />
              </div>
              <div>
                <label style={S.label}>型態分類 *</label>
                <select style={S.select} value={form.patternId} onChange={e => set("patternId", e.target.value)}>
                  <option value="">選擇型態</option>
                  {patternOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={S.label}>型態辨識日期</label>
                <input type="date" style={S.input} value={form.patternDate} onChange={e => set("patternDate", e.target.value)} />
              </div>
              <div>
                <label style={S.label}>結果</label>
                <select style={S.select} value={form.result} onChange={e => set("result", e.target.value)}>
                  <option value="pending">待觀察</option>
                  <option value="success">成功</option>
                  <option value="failure">失敗</option>
                </select>
              </div>
              <div>
                <label style={S.label}>報酬率 (%)</label>
                <input type="number" style={S.input} value={form.returnPct} onChange={e => set("returnPct", e.target.value)} placeholder="選填" />
              </div>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.h3}>筆記</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>使用 #標籤 格式，系統自動解析</div>
            <textarea style={{ ...S.textarea, minHeight: 100 }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="記錄你的觀察...&#10;例：#突破量大 #均線多頭排列" />
            {extractTags(form.notes).length > 0 && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "#94A3B8", marginRight: 4 }}>標籤：</span>
                {extractTags(form.notes).map(t => <span key={t} style={S.tag()}>#{t}</span>)}
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={S.h3}>市場狀態</div>
            <div style={{ marginBottom: 10 }} ref={sugRef}>
              <label style={S.label}>市場標籤</label>
              <div style={{ position: "relative" }}>
                <div style={S.flexGap(6)}>
                  <input style={{ ...S.input, flex: 1 }} value={mktTagInput}
                    onChange={e => { setMktTagInput(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="輸入或選擇已有標籤..."
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMarketTag(); } }} />
                  <button style={S.btn()} onClick={() => addMarketTag()}>加入</button>
                </div>
                {showSuggestions && mktSuggestions.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 70, marginTop: 2,
                    background: "#FFF", border: "1px solid #E2E8F0", borderRadius: 7,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)", zIndex: 10, maxHeight: 150, overflowY: "auto"
                  }}>
                    <div style={{ padding: "4px 10px", fontSize: 10, color: "#94A3B8", borderBottom: "1px solid #F1F5F9" }}>曾用過的標籤</div>
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
            <textarea style={{ ...S.textarea, minHeight: 80 }} value={form.marketContext} onChange={e => set("marketContext", e.target.value)} placeholder="描述當時整體市場的狀況..." />
          </div>
        </div>

        <div>
          <div style={S.card}>
            <div style={S.h3}>股價截圖（最多2張）</div>
            {form.images.map((img, i) => (
              <div key={i} style={{ position: "relative", marginBottom: 10 }}>
                <img src={img} alt="" style={{ ...S.img, maxHeight: 240 }} />
                <button onClick={() => removeImage(i)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", color: "#FFF", border: "none", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
            {form.images.length < 2 && (
              <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #D1D5DB", borderRadius: 8, padding: 28, textAlign: "center", cursor: "pointer", color: "#94A3B8", transition: "border-color .15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#4F46E5"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#D1D5DB"}>
                <Icon name="img" size={28} />
                <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 500 }}>點擊上傳圖片</div>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImage} />
              </div>
            )}
          </div>
          <div style={{ ...S.flexGap(8), justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
            {formError && <div style={{ width: "100%", textAlign: "right", color: "#DC2626", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>⚠ {formError}</div>}
            <button style={S.btnOutline} onClick={onCancel}>取消</button>
            <button style={S.btn()} onClick={handleSubmit}>{isEdit ? "更新" : "儲存案例"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STATS VIEW
   ══════════════════════════════════════════════════════════════ */
function StatsView({ patterns, casesIndex, topPatterns, getChildren, allMktTags }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mktTagFilter, setMktTagFilter] = useState("");
  const [statLevel, setStatLevel] = useState("all");

  const filtered = useMemo(() => {
    let list = casesIndex;
    if (dateFrom) list = list.filter(c => (c.patternDate || c.createdAt || "") >= dateFrom);
    if (dateTo) list = list.filter(c => (c.patternDate || c.createdAt || "") <= dateTo);
    if (mktTagFilter) list = list.filter(c => (c.marketTags || []).includes(mktTagFilter));
    return list;
  }, [casesIndex, dateFrom, dateTo, mktTagFilter]);

  const decided = filtered.filter(c => c.result === "success" || c.result === "failure");
  const overallWin = decided.filter(c => c.result === "success").length;

  const byPattern = useMemo(() => {
    if (statLevel === "top") {
      return topPatterns.map(p => {
        const allIds = getDescendantIds(p.id, patterns);
        const cases = filtered.filter(c => allIds.includes(c.patternId));
        const d = cases.filter(c => c.result === "success" || c.result === "failure");
        const s = d.filter(c => c.result === "success").length;
        return { id: p.id, name: p.name, color: p.color, total: cases.length, decided: d.length, success: s };
      }).filter(p => p.total > 0);
    } else {
      return patterns.map(p => {
        const cases = filtered.filter(c => c.patternId === p.id);
        const d = cases.filter(c => c.result === "success" || c.result === "failure");
        const s = d.filter(c => c.result === "success").length;
        return { id: p.id, name: getPatternLabel(p, patterns), color: p.color, total: cases.length, decided: d.length, success: s };
      }).filter(p => p.total > 0);
    }
  }, [patterns, filtered, statLevel, topPatterns]);

  const byMktTag = useMemo(() => {
    const map = {};
    filtered.forEach(c => {
      (c.marketTags || []).forEach(t => {
        if (!map[t]) map[t] = { tag: t, total: 0, success: 0, failure: 0, byPattern: {} };
        map[t].total++;
        if (c.result === "success") map[t].success++;
        if (c.result === "failure") map[t].failure++;
        // Per-pattern breakdown
        const pId = c.patternId;
        if (!map[t].byPattern[pId]) map[t].byPattern[pId] = { total: 0, success: 0, failure: 0 };
        map[t].byPattern[pId].total++;
        if (c.result === "success") map[t].byPattern[pId].success++;
        if (c.result === "failure") map[t].byPattern[pId].failure++;
      });
    });
    return Object.values(map).sort((a, b) => {
      const aD = a.success + a.failure, bD = b.success + b.failure;
      return (bD > 0 ? b.success / bD : -1) - (aD > 0 ? a.success / aD : -1);
    });
  }, [filtered]);

  const crossData = useMemo(() => {
    if (!mktTagFilter) return null;
    const source = statLevel === "top" ? topPatterns : patterns;
    return source.map(p => {
      const ids = statLevel === "top" ? getDescendantIds(p.id, patterns) : [p.id];
      const cases = filtered.filter(c => ids.includes(c.patternId));
      const d = cases.filter(c => c.result === "success" || c.result === "failure");
      const s = d.filter(c => c.result === "success").length;
      return { name: statLevel === "top" ? p.name : getPatternLabel(p, patterns), color: p.color, total: cases.length, decided: d.length, success: s };
    }).filter(p => p.total > 0);
  }, [mktTagFilter, patterns, filtered, statLevel, topPatterns]);

  const WinBar = ({ s, f }) => {
    const total = s + f;
    if (total === 0) return <span style={{ color: "#CBD5E1", fontSize: 12 }}>—</span>;
    const pctVal = (s / total * 100);
    return (
      <div style={S.flexGap(8)}>
        <div style={{ flex: 1, height: 7, borderRadius: 4, background: "#FEE2E2", overflow: "hidden" }}>
          <div style={{ width: pctVal + "%", height: "100%", borderRadius: 4, background: "#34D399", transition: "width .3s" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#334155", minWidth: 38 }}>{pctVal.toFixed(0)}%</span>
      </div>
    );
  };

  const TH = ({ children, align }) => <th style={{ textAlign: align || "left", padding: "7px 6px", color: "#94A3B8", fontWeight: 500, fontSize: 11 }}>{children}</th>;

  return (
    <div>
      <div style={S.h1}>統計分析</div>
      <div style={S.sub}>分析你的型態辨識表現</div>

      <div style={{ ...S.card, ...S.flexGap(12), flexWrap: "wrap", padding: 14 }}>
        <div>
          <label style={S.label}>起始日期</label>
          <input type="date" style={{ ...S.input, width: 140 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>結束日期</label>
          <input type="date" style={{ ...S.input, width: 140 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>市場標籤</label>
          <select style={{ ...S.select, width: 150 }} value={mktTagFilter} onChange={e => setMktTagFilter(e.target.value)}>
            <option value="">全部市況</option>
            {allMktTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>統計層級</label>
          <select style={{ ...S.select, width: 130 }} value={statLevel} onChange={e => setStatLevel(e.target.value)}>
            <option value="all">全部型態</option>
            <option value="top">僅大分類</option>
          </select>
        </div>
        <div style={{ alignSelf: "flex-end" }}>
          <button style={S.btnOutline} onClick={() => { setDateFrom(""); setDateTo(""); setMktTagFilter(""); }}>清除</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="篩選後案例" value={filtered.length} />
        <StatCard label="已決定" value={decided.length} sub={`${overallWin}勝 ${decided.length - overallWin}負`} />
        <StatCard label="整體勝率" value={decided.length > 0 ? pct(overallWin, decided.length) : "—"} color="#059669" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={S.card}>
          <div style={S.h3}>各型態勝率</div>
          {byPattern.length === 0 ? <div style={{ color: "#CBD5E1", fontSize: 12 }}>無資料</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr style={{ borderBottom: "1px solid #E2E8F0" }}><TH>型態</TH><TH align="center">案例</TH><TH align="center">勝/負</TH><TH>勝率</TH></tr></thead>
              <tbody>
                {byPattern.map(p => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "8px 6px" }}><div style={S.flexGap(5)}><Dot color={p.color} size={8} />{p.name}</div></td>
                    <td style={{ textAlign: "center", padding: "8px 6px" }}>{p.total}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px" }}>{p.success}/{p.decided - p.success}</td>
                    <td style={{ padding: "8px 6px" }}><WinBar s={p.success} f={p.decided - p.success} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={S.card}>
          <div style={S.h3}>各市場狀態下，各型態的勝率</div>
          {byMktTag.length === 0 ? <div style={{ color: "#CBD5E1", fontSize: 12 }}>無資料</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {byMktTag.map(m => {
                const mDec = m.success + m.failure;
                const patEntries = Object.entries(m.byPattern).map(([pId, data]) => {
                  const p = patterns.find(x => x.id === pId);
                  return { pId, name: p ? getPatternLabel(p, patterns) : "—", color: p ? p.color : "#CBD5E1", ...data };
                }).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
                return (
                  <div key={m.tag} style={{ background: "#FAFBFD", borderRadius: 8, padding: 12 }}>
                    <div style={S.flexBetween}>
                      <span style={S.tag("#FEF3C7", "#92400E")}>📌 {m.tag}</span>
                      <span style={{ fontSize: 12, color: "#94A3B8" }}>{m.total} 筆 · {mDec > 0 ? `${m.success}勝${m.failure}負 · 勝率 ${pct(m.success, mDec)}` : "—"}</span>
                    </div>
                    {patEntries.length > 0 && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 }}>
                        <thead><tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                          <th style={{ textAlign: "left", padding: "5px 6px", color: "#94A3B8", fontWeight: 500, fontSize: 11 }}>型態</th>
                          <th style={{ textAlign: "center", padding: "5px 6px", color: "#94A3B8", fontWeight: 500, fontSize: 11 }}>案例</th>
                          <th style={{ textAlign: "center", padding: "5px 6px", color: "#94A3B8", fontWeight: 500, fontSize: 11 }}>勝/負</th>
                          <th style={{ padding: "5px 6px", color: "#94A3B8", fontWeight: 500, fontSize: 11, minWidth: 80 }}>勝率</th>
                        </tr></thead>
                        <tbody>
                          {patEntries.map(pe => {
                            const d = pe.success + pe.failure;
                            return (
                              <tr key={pe.pId} style={{ borderBottom: "1px solid #F1F5F9" }}>
                                <td style={{ padding: "6px" }}><div style={S.flexGap(5)}><Dot color={pe.color} size={7} />{pe.name}</div></td>
                                <td style={{ textAlign: "center", padding: "6px" }}>{pe.total}</td>
                                <td style={{ textAlign: "center", padding: "6px" }}>{pe.success}/{pe.failure}</td>
                                <td style={{ padding: "6px" }}>{d > 0 ? <WinBar s={pe.success} f={pe.failure} /> : <span style={{ color: "#CBD5E1" }}>—</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {crossData && crossData.length > 0 && (
        <div style={{ ...S.card, marginTop: 14 }}>
          <div style={S.h3}>「{mktTagFilter}」市況下各型態表現</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ borderBottom: "1px solid #E2E8F0" }}><TH>型態</TH><TH align="center">案例</TH><TH align="center">勝/負</TH><TH>勝率</TH></tr></thead>
            <tbody>
              {crossData.map(p => (
                <tr key={p.name} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "8px 6px" }}><div style={S.flexGap(5)}><Dot color={p.color} size={8} />{p.name}</div></td>
                  <td style={{ textAlign: "center", padding: "8px 6px" }}>{p.total}</td>
                  <td style={{ textAlign: "center", padding: "8px 6px" }}>{p.success}/{p.decided - p.success}</td>
                  <td style={{ padding: "8px 6px" }}>{p.decided > 0 ? <WinBar s={p.success} f={p.decided - p.success} /> : <span style={{ color: "#CBD5E1", fontSize: 12 }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SEARCH
   ══════════════════════════════════════════════════════════════ */
function SearchView({ casesIndex, caseStore, loadCase, getPattern, patterns, topPatterns, getChildren, allMktTags, setLightbox }) {
  const [q, setQ] = useState("");
  const [patFilter, setPatFilter] = useState("");
  const [mktFilter, setMktFilter] = useState("");
  const [viewIdx, setViewIdx] = useState(0);

  const patternOptions = useMemo(() => {
    const opts = [];
    topPatterns.forEach(p => {
      opts.push({ id: p.id, label: p.name });
      getChildren(p.id).forEach(c => opts.push({ id: c.id, label: `  └ ${c.name}` }));
    });
    return opts;
  }, [topPatterns, getChildren]);

  const results = useMemo(() => {
    let list = casesIndex;
    if (patFilter) {
      const allIds = getDescendantIds(patFilter, patterns);
      list = list.filter(c => allIds.includes(c.patternId));
    }
    if (mktFilter) {
      list = list.filter(c => (c.marketTags || []).includes(mktFilter));
    }
    if (q.trim()) {
      const lower = q.toLowerCase();
      list = list.filter(c => {
        const fields = [c.ticker, c.notes, c.marketContext, ...(c.tags || []), ...(c.marketTags || [])].join(" ").toLowerCase();
        return fields.includes(lower);
      });
    }
    return list;
  }, [q, patFilter, mktFilter, casesIndex, patterns]);

  const hasAnyFilter = q.trim() || patFilter || mktFilter;
  const safeIdx = Math.min(viewIdx, Math.max(0, results.length - 1));
  const currentEntry = results[safeIdx];
  const currentFull = currentEntry ? caseStore[currentEntry.id] : null;
  const currentPat = currentEntry ? getPattern(currentEntry.patternId) : null;

  // Lazy load current case
  useEffect(() => {
    if (currentEntry && !caseStore[currentEntry.id]) {
      loadCase(currentEntry.id);
    }
  }, [currentEntry?.id]);

  return (
    <div>
      <div style={S.h1}>搜尋</div>
      <div style={S.sub}>搜尋股票代碼、筆記內容、標籤</div>

      {/* Filter row */}
      <div style={{ ...S.flexGap(10), flexWrap: "wrap", marginBottom: 10 }}>
        <select style={{ ...S.select, width: "auto", minWidth: 140 }} value={patFilter} onChange={e => { setPatFilter(e.target.value); setViewIdx(0); }}>
          <option value="">所有型態</option>
          {patternOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 140 }} value={mktFilter} onChange={e => { setMktFilter(e.target.value); setViewIdx(0); }}>
          <option value="">所有市場狀態</option>
          {allMktTags.map(t => <option key={t} value={t}>📌 {t}</option>)}
        </select>
        {(patFilter || mktFilter) && (
          <button style={{ ...S.btnOutline, padding: "5px 10px", fontSize: 11 }} onClick={() => { setPatFilter(""); setMktFilter(""); }}>清除篩選</button>
        )}
      </div>

      <input style={{ ...S.input, fontSize: 14, padding: "11px 14px", marginBottom: 14 }} value={q} onChange={e => { setQ(e.target.value); setViewIdx(0); }} placeholder="輸入關鍵字搜尋代碼、筆記、標籤..." autoFocus />

      {hasAnyFilter && <div style={{ fontSize: 12.5, color: "#94A3B8", marginBottom: 10 }}>找到 {results.length} 筆結果{results.length > 0 ? ` · 第 ${safeIdx + 1} / ${results.length} 筆` : ""}</div>}

      {hasAnyFilter && results.length > 0 && (
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* Left: compact list */}
          <div style={{ width: 200, minWidth: 200, maxHeight: "calc(100vh - 300px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {results.map((c, idx) => {
              const p = getPattern(c.patternId);
              const isActive = idx === safeIdx;
              return (
                <div key={c.id} style={{
                  padding: "8px 10px", borderRadius: 7, cursor: "pointer",
                  background: isActive ? "#EEF2FF" : "#FFF",
                  border: isActive ? "2px solid #4F46E5" : "1px solid #E8ECF1"
                }} onClick={() => setViewIdx(idx)}>
                  <div style={S.flexBetween}>
                    <div style={S.flexGap(5)}>
                      {p && <Dot color={p.color} size={8} />}
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{c.ticker}</span>
                    </div>
                    <span style={S.badge(c.result)}>{c.result === "success" ? "成功" : c.result === "failure" ? "失敗" : "觀察"}</span>
                  </div>
                  {p && <div style={{ marginTop: 2, fontSize: 10, color: p.color }}>{getPatternLabel(p, patterns)}</div>}
                  <div style={{ marginTop: 2, fontSize: 10, color: "#CBD5E1" }}>{fmt(c.patternDate || c.createdAt)}</div>
                </div>
              );
            })}
          </div>

          {/* Right: slideshow */}
          <div style={{ flex: 1, maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
            {currentEntry && (
              <div>
                <div style={{ ...S.card, padding: 14 }}>
                  <div style={S.flexBetween}>
                    <div style={S.flexGap(10)}>
                      {currentPat && <Dot color={currentPat.color} size={12} />}
                      <span style={{ fontWeight: 700, fontSize: 18 }}>{currentEntry.ticker}</span>
                      {currentPat && <span style={S.tag(currentPat.color + "22", currentPat.color)}>{getPatternLabel(currentPat, patterns)}</span>}
                      <span style={S.badge(currentEntry.result)}>{currentEntry.result === "success" ? "✓ 成功" : currentEntry.result === "failure" ? "✗ 失敗" : "⏳ 待觀察"}</span>
                    </div>
                    <div style={S.flexGap(6)}>
                      <button style={{ ...S.btnOutline, padding: "6px 12px", fontSize: 16, fontWeight: 700 }} onClick={() => { if (safeIdx > 0) setViewIdx(safeIdx - 1); }} disabled={safeIdx === 0}>←</button>
                      <span style={{ fontSize: 12, color: "#94A3B8", minWidth: 50, textAlign: "center" }}>{safeIdx + 1} / {results.length}</span>
                      <button style={{ ...S.btnOutline, padding: "6px 12px", fontSize: 16, fontWeight: 700 }} onClick={() => { if (safeIdx < results.length - 1) setViewIdx(safeIdx + 1); }} disabled={safeIdx === results.length - 1}>→</button>
                    </div>
                  </div>
                  <div style={{ marginTop: 6, ...S.flexGap(12), fontSize: 12, color: "#94A3B8" }}>
                    <span>型態日期：{fmt(currentEntry.patternDate)}</span>
                    <span>記錄：{fmt(currentEntry.createdAt)}</span>
                  </div>
                </div>

                {!currentFull && (
                  <div style={{ ...S.card, padding: 30, textAlign: "center", color: "#94A3B8" }}>載入中...</div>
                )}
                {currentFull && currentFull.images && currentFull.images.length > 0 && (
                  <div style={{ ...S.card, padding: 14 }}>
                    {currentFull.images.map((img, i) => (
                      <img key={i} src={img} alt="" style={{ width: "100%", borderRadius: 7, objectFit: "contain", border: "1px solid #E2E8F0", cursor: "pointer", marginBottom: i < currentFull.images.length - 1 ? 10 : 0, maxHeight: 400 }} onClick={() => setLightbox(img)} />
                    ))}
                  </div>
                )}

                {currentFull && currentFull.notes && (
                  <div style={{ ...S.card, padding: 14 }}>
                    <div style={S.h3}>筆記</div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#334155" }}>
                      {currentFull.notes.split(/(#[\w\u4e00-\u9fff\u3400-\u4dbf]+)/g).map((part, i) =>
                        part.match(/^#[\w\u4e00-\u9fff\u3400-\u4dbf]+$/) ?
                          <span key={i} style={{ color: "#4F46E5", fontWeight: 600, background: "#EEF2FF", padding: "1px 4px", borderRadius: 3 }}>{part}</span> :
                          <span key={i}>{part}</span>
                      )}
                    </div>
                  </div>
                )}

                {currentFull && (currentFull.marketContext || (currentFull.marketTags || []).length > 0) && (
                  <div style={{ ...S.card, padding: 14 }}>
                    <div style={S.h3}>市場狀態</div>
                    {(currentFull.marketTags || []).length > 0 && (
                      <div style={{ marginBottom: 8 }}>{currentFull.marketTags.map(t => <span key={t} style={S.tag("#FEF3C7", "#92400E")}>📌 {t}</span>)}</div>
                    )}
                    {currentFull.marketContext && <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#475569" }}>{currentFull.marketContext}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   JOURNAL VIEW — Calendar + Daily Entry
   ══════════════════════════════════════════════════════════════ */
function JournalView({ journalsIndex, journalStore, loadJournal, casesIndex, caseStore, loadCase, getPattern, patterns, setLightbox, onNew, onEdit, onDelete, openCase }) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today.toISOString().slice(0, 10));

  const journalDates = useMemo(() => new Set(journalsIndex.map(j => j.date)), [journalsIndex]);

  // Calendar helpers
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const monthLabel = `${calYear} 年 ${calMonth + 1} 月`;

  const prevMonth = () => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else setCalMonth(m => m + 1); };

  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, date: dateStr, hasEntry: journalDates.has(dateStr) });
    }
    return days;
  }, [calYear, calMonth, daysInMonth, firstDay, journalDates]);

  // Load selected journal on demand
  useEffect(() => {
    if (selectedDate && journalDates.has(selectedDate) && !journalStore[selectedDate]) {
      loadJournal(selectedDate);
    }
  }, [selectedDate, journalDates]);

  const currentJournal = journalStore[selectedDate];
  const hasEntry = journalDates.has(selectedDate);

  // Navigate days with arrows
  const sortedDates = useMemo(() => [...journalsIndex].sort((a, b) => a.date.localeCompare(b.date)).map(j => j.date), [journalsIndex]);
  const currentIdx = sortedDates.indexOf(selectedDate);
  const goPrevEntry = () => { if (currentIdx > 0) { const d = sortedDates[currentIdx - 1]; setSelectedDate(d); const dt = new Date(d); setCalYear(dt.getFullYear()); setCalMonth(dt.getMonth()); } };
  const goNextEntry = () => { if (currentIdx < sortedDates.length - 1) { const d = sortedDates[currentIdx + 1]; setSelectedDate(d); const dt = new Date(d); setCalYear(dt.getFullYear()); setCalMonth(dt.getMonth()); } };

  // Render linked cases
  const renderLinkedCases = (linkedIds) => {
    if (!linkedIds || linkedIds.length === 0) return null;
    return (
      <div style={{ ...S.card, padding: 14 }}>
        <div style={S.h3}>🔗 連結案例</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {linkedIds.map(id => {
            const c = casesIndex.find(x => x.id === id);
            if (!c) return null;
            const p = getPattern(c.patternId);
            return (
              <div key={id} style={{ ...S.flexBetween, padding: "7px 10px", borderRadius: 7, background: "#F8FAFC", cursor: "pointer" }} onClick={() => openCase(id)}>
                <div style={S.flexGap(8)}>
                  {p && <Dot color={p.color} size={8} />}
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{c.ticker}</span>
                  {p && <span style={S.tag()}>{getPatternLabel(p, patterns)}</span>}
                </div>
                <div style={S.flexGap(6)}>
                  <span style={S.badge(c.result)}>{c.result === "success" ? "成功" : c.result === "failure" ? "失敗" : "觀察"}</span>
                  <span style={{ fontSize: 11, color: "#CBD5E1" }}>{fmt(c.patternDate)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={S.flexBetween}>
        <div><div style={S.h1}>📝 盤勢日誌</div><div style={S.sub}>每日市場觀察記錄</div></div>
        <button style={S.btn()} onClick={() => onNew(selectedDate)}>+ 新增日誌</button>
      </div>

      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        {/* Left: Calendar */}
        <div style={{ width: 280, minWidth: 280 }}>
          <div style={S.card}>
            <div style={{ ...S.flexBetween, marginBottom: 12 }}>
              <button style={{ ...S.btnOutline, padding: "4px 10px", fontSize: 14, fontWeight: 700 }} onClick={prevMonth}>←</button>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#334155" }}>{monthLabel}</span>
              <button style={{ ...S.btnOutline, padding: "4px 10px", fontSize: 14, fontWeight: 700 }} onClick={nextMonth}>→</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
              {["日", "一", "二", "三", "四", "五", "六"].map(d => (
                <div key={d} style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", padding: "4px 0" }}>{d}</div>
              ))}
              {calendarDays.map((item, i) => {
                if (!item) return <div key={`empty-${i}`} />;
                const isSelected = item.date === selectedDate;
                const isToday = item.date === today.toISOString().slice(0, 10);
                return (
                  <div key={item.date} onClick={() => setSelectedDate(item.date)}
                    style={{
                      padding: "6px 2px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: isSelected ? 700 : 400,
                      background: isSelected ? "#4F46E5" : isToday ? "#EEF2FF" : "transparent",
                      color: isSelected ? "#FFF" : isToday ? "#4F46E5" : "#334155",
                      position: "relative", transition: "all .1s",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#F1F5F9"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isToday ? "#EEF2FF" : "transparent"; }}>
                    {item.day}
                    {item.hasEntry && (
                      <div style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 5, height: 5, borderRadius: "50%", background: isSelected ? "#FFF" : "#4F46E5" }} />
                    )}
                  </div>
                );
              })}
            </div>
            {/* Quick jump to today */}
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <button style={{ ...S.btnOutline, padding: "4px 12px", fontSize: 11 }} onClick={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); setSelectedDate(today.toISOString().slice(0, 10)); }}>今天</button>
            </div>
          </div>

          {/* Recent journals list */}
          <div style={{ ...S.card, marginTop: 10 }}>
            <div style={S.h3}>最近日誌</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
              {journalsIndex.slice(0, 15).map(j => (
                <div key={j.date} style={{
                  padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                  background: j.date === selectedDate ? "#EEF2FF" : "transparent",
                  fontWeight: j.date === selectedDate ? 600 : 400,
                  color: j.date === selectedDate ? "#4F46E5" : "#475569",
                }}
                  onClick={() => { setSelectedDate(j.date); const dt = new Date(j.date); setCalYear(dt.getFullYear()); setCalMonth(dt.getMonth()); }}>
                  <div style={S.flexBetween}>
                    <span>{j.date}</span>
                    <span style={{ fontSize: 11, color: "#94A3B8", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title || ""}</span>
                  </div>
                </div>
              ))}
              {journalsIndex.length === 0 && <div style={{ color: "#CBD5E1", fontSize: 12, textAlign: "center", padding: 10 }}>尚無日誌</div>}
            </div>
          </div>
        </div>

        {/* Right: Journal Content */}
        <div style={{ flex: 1, maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
          {hasEntry && !currentJournal && (
            <div style={{ ...S.card, padding: 30, textAlign: "center", color: "#94A3B8" }}>載入中...</div>
          )}

          {hasEntry && currentJournal && (
            <div>
              {/* Header with nav */}
              <div style={{ ...S.card, padding: 14 }}>
                <div style={S.flexBetween}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: "#1E293B" }}>{currentJournal.title || selectedDate}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{selectedDate} · {new Date(selectedDate).toLocaleDateString("zh-TW", { weekday: "long" })}</div>
                  </div>
                  <div style={S.flexGap(6)}>
                    <button style={{ ...S.btnOutline, padding: "6px 12px", fontSize: 16, fontWeight: 700 }} onClick={goPrevEntry} disabled={currentIdx <= 0}>←</button>
                    <span style={{ fontSize: 12, color: "#94A3B8", minWidth: 50, textAlign: "center" }}>{currentIdx >= 0 ? `${currentIdx + 1}/${sortedDates.length}` : ""}</span>
                    <button style={{ ...S.btnOutline, padding: "6px 12px", fontSize: 16, fontWeight: 700 }} onClick={goNextEntry} disabled={currentIdx >= sortedDates.length - 1}>→</button>
                  </div>
                </div>
                {(currentJournal.marketTags || []).length > 0 && (
                  <div style={{ marginTop: 8 }}>{currentJournal.marketTags.map(t => <span key={t} style={S.tag("#FEF3C7", "#92400E")}>📌 {t}</span>)}</div>
                )}
              </div>

              {/* Images */}
              {currentJournal.images && currentJournal.images.length > 0 && (
                <div style={{ ...S.card, padding: 14 }}>
                  <div style={S.h3}>截圖 ({currentJournal.images.length})</div>
                  {currentJournal.images.map((img, i) => (
                    <img key={i} src={img} alt="" style={{ width: "100%", borderRadius: 7, objectFit: "contain", border: "1px solid #E2E8F0", cursor: "pointer", marginBottom: i < currentJournal.images.length - 1 ? 10 : 0, maxHeight: 400 }} onClick={() => setLightbox(img)} />
                  ))}
                </div>
              )}

              {/* Content */}
              {currentJournal.content && (
                <div style={{ ...S.card, padding: 14 }}>
                  <div style={S.h3}>內容</div>
                  <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "#334155" }}>
                    {currentJournal.content.split(/(#[\w\u4e00-\u9fff\u3400-\u4dbf]+)/g).map((part, i) =>
                      part.match(/^#[\w\u4e00-\u9fff\u3400-\u4dbf]+$/) ?
                        <span key={i} style={{ color: "#4F46E5", fontWeight: 600, background: "#EEF2FF", padding: "1px 4px", borderRadius: 3 }}>{part}</span> :
                        <span key={i}>{part}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Linked cases */}
              {renderLinkedCases(currentJournal.linkedCases)}

              {/* Actions */}
              <div style={{ ...S.card, padding: 14 }}>
                <div style={S.flexGap(8)}>
                  <button style={S.btnOutline} onClick={() => onEdit(currentJournal)}><Icon name="edit" size={13} /> 編輯</button>
                  <button style={{ ...S.btnOutline, color: "#EF4444", borderColor: "#FECACA" }} onClick={() => { onDelete(currentJournal.date); setSelectedDate(selectedDate); }}>
                    <Icon name="trash" size={13} /> 刪除
                  </button>
                </div>
              </div>
            </div>
          )}

          {!hasEntry && (
            <div style={{ ...S.card, textAlign: "center", padding: 44, color: "#94A3B8" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{selectedDate} 尚無日誌</div>
              <button style={S.btn()} onClick={() => onNew(selectedDate)}>撰寫今日日誌</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   JOURNAL FORM
   ══════════════════════════════════════════════════════════════ */
function JournalForm({ existing, defaultDate, allMktTags, casesIndex, getPattern, patterns, topPatterns, getChildren, onSave, onCancel }) {
  const isEdit = !!(existing && existing.content);
  const [form, setForm] = useState({
    date: existing?.date || defaultDate || new Date().toISOString().slice(0, 10),
    title: existing?.title || "",
    content: existing?.content || "",
    marketTags: existing?.marketTags || [],
    images: existing?.images || [],
    linkedCases: existing?.linkedCases || [],
    tags: existing?.tags || [],
  });
  const [mktTagInput, setMktTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [caseSearchQ, setCaseSearchQ] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [formError, setFormError] = useState(null);
  const fileRef = useRef();
  const sugRef = useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleImages = async (e) => {
    const files = Array.from(e.target.files).slice(0, 10 - form.images.length);
    if (files.length === 0) return;
    setCompressing(true);
    try {
      const results = await Promise.all(files.map(f => compressImage(f, 1600, 0.9)));
      setForm(f => ({ ...f, images: [...f.images, ...results].slice(0, 10) }));
    } catch (err) { console.error("compress err", err); }
    setCompressing(false);
    e.target.value = "";
  };

  const removeImage = (idx) => setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));

  const addMarketTag = (t) => {
    const tag = (t || mktTagInput).trim();
    if (tag && !form.marketTags.includes(tag)) set("marketTags", [...form.marketTags, tag]);
    setMktTagInput("");
    setShowSuggestions(false);
  };

  const mktSuggestions = useMemo(() => {
    if (!mktTagInput.trim()) return allMktTags.filter(t => !form.marketTags.includes(t));
    const lower = mktTagInput.toLowerCase();
    return allMktTags.filter(t => t.toLowerCase().includes(lower) && !form.marketTags.includes(t));
  }, [mktTagInput, allMktTags, form.marketTags]);

  // Case linking search
  const caseResults = useMemo(() => {
    if (!caseSearchQ.trim()) return [];
    const lower = caseSearchQ.toLowerCase();
    return casesIndex.filter(c =>
      !form.linkedCases.includes(c.id) &&
      [c.ticker, ...(c.tags || [])].join(" ").toLowerCase().includes(lower)
    ).slice(0, 8);
  }, [caseSearchQ, casesIndex, form.linkedCases]);

  useEffect(() => {
    const handler = (e) => { if (sugRef.current && !sugRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSubmit = () => {
    if (!form.date) { setFormError("請選擇日期"); return; }
    setFormError(null);
    const tags = extractTags(form.content);
    onSave({ ...form, tags });
  };

  return (
    <div>
      <div style={S.h1}>{isEdit ? "編輯日誌" : "新增盤勢日誌"}</div>
      <div style={S.sub}>{form.date} · {new Date(form.date).toLocaleDateString("zh-TW", { weekday: "long" })}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
        <div>
          {/* Basic info */}
          <div style={S.card}>
            <div style={S.h3}>基本資訊</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={S.label}>日期 *</label>
                <input type="date" style={S.input} value={form.date} onChange={e => set("date", e.target.value)} />
              </div>
              <div>
                <label style={S.label}>標題</label>
                <input style={S.input} value={form.title} onChange={e => set("title", e.target.value)} placeholder="例：大盤突破前高、Fed 利率決議" />
              </div>
            </div>
          </div>

          {/* Content */}
          <div style={S.card}>
            <div style={S.h3}>日誌內容</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>使用 #標籤 自動解析</div>
            <textarea style={{ ...S.textarea, minHeight: 160 }} value={form.content} onChange={e => set("content", e.target.value)} placeholder={"今日盤勢觀察...\n#大盤多頭 #量能萎縮 #外資買超"} />
            {extractTags(form.content).length > 0 && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "#94A3B8", marginRight: 4 }}>標籤：</span>
                {extractTags(form.content).map(t => <span key={t} style={S.tag()}>#{t}</span>)}
              </div>
            )}
          </div>

          {/* Market tags */}
          <div style={S.card}>
            <div style={S.h3}>市場標籤</div>
            <div ref={sugRef}>
              <div style={{ position: "relative" }}>
                <div style={S.flexGap(6)}>
                  <input style={{ ...S.input, flex: 1 }} value={mktTagInput}
                    onChange={e => { setMktTagInput(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="輸入或選擇已有標籤..."
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMarketTag(); } }} />
                  <button style={S.btn()} onClick={() => addMarketTag()}>加入</button>
                </div>
                {showSuggestions && mktSuggestions.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 70, marginTop: 2,
                    background: "#FFF", border: "1px solid #E2E8F0", borderRadius: 7,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)", zIndex: 10, maxHeight: 150, overflowY: "auto"
                  }}>
                    <div style={{ padding: "4px 10px", fontSize: 10, color: "#94A3B8", borderBottom: "1px solid #F1F5F9" }}>曾用過的標籤</div>
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

          {/* Link cases */}
          <div style={S.card}>
            <div style={S.h3}>🔗 連結案例</div>
            <input style={{ ...S.input, marginBottom: 8 }} value={caseSearchQ} onChange={e => setCaseSearchQ(e.target.value)} placeholder="搜尋股票代碼以連結案例..." />
            {caseResults.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                {caseResults.map(c => {
                  const p = getPattern(c.patternId);
                  return (
                    <div key={c.id} style={{ ...S.flexBetween, padding: "6px 10px", borderRadius: 6, background: "#F8FAFC", cursor: "pointer" }}
                      onClick={() => { set("linkedCases", [...form.linkedCases, c.id]); setCaseSearchQ(""); }}>
                      <div style={S.flexGap(6)}>
                        {p && <Dot color={p.color} size={7} />}
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{c.ticker}</span>
                        {p && <span style={{ fontSize: 10, color: "#94A3B8" }}>{getPatternLabel(p, patterns)}</span>}
                      </div>
                      <span style={{ fontSize: 11, color: "#4F46E5" }}>+ 連結</span>
                    </div>
                  );
                })}
              </div>
            )}
            {form.linkedCases.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {form.linkedCases.map(id => {
                  const c = casesIndex.find(x => x.id === id);
                  if (!c) return null;
                  const p = getPattern(c.patternId);
                  return (
                    <div key={id} style={{ ...S.flexBetween, padding: "6px 10px", borderRadius: 6, background: "#EEF2FF" }}>
                      <div style={S.flexGap(6)}>
                        {p && <Dot color={p.color} size={7} />}
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{c.ticker}</span>
                        {p && <span style={{ fontSize: 10, color: p.color }}>{getPatternLabel(p, patterns)}</span>}
                        <span style={S.badge(c.result)}>{c.result === "success" ? "成功" : c.result === "failure" ? "失敗" : "觀察"}</span>
                      </div>
                      <button style={{ ...S.btnOutline, padding: "2px 8px", fontSize: 11, color: "#EF4444", borderColor: "#FECACA" }}
                        onClick={() => set("linkedCases", form.linkedCases.filter(x => x !== id))}>移除</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          {/* Images */}
          <div style={S.card}>
            <div style={S.h3}>截圖（最多 10 張，自動壓縮）</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8 }}>已上傳 {form.images.length} / 10 張</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {form.images.map((img, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={img} alt="" style={{ width: "100%", borderRadius: 7, objectFit: "cover", border: "1px solid #E2E8F0", maxHeight: 160 }} />
                  <button onClick={() => removeImage(i)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.5)", color: "#FFF", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>✕</button>
                </div>
              ))}
            </div>
            {form.images.length < 10 && (
              <div onClick={() => !compressing && fileRef.current?.click()} style={{ border: "2px dashed #D1D5DB", borderRadius: 8, padding: 24, textAlign: "center", cursor: compressing ? "wait" : "pointer", color: "#94A3B8", transition: "border-color .15s", marginTop: form.images.length > 0 ? 8 : 0 }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#4F46E5"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#D1D5DB"}>
                <Icon name="img" size={24} />
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 500 }}>{compressing ? "壓縮中..." : "點擊上傳圖片"}</div>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImages} />
              </div>
            )}
          </div>

          <div style={{ ...S.flexGap(8), justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
            {formError && <div style={{ width: "100%", textAlign: "right", color: "#DC2626", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>⚠ {formError}</div>}
            <button style={S.btnOutline} onClick={onCancel}>取消</button>
            <button style={S.btn()} onClick={handleSubmit}>{isEdit ? "更新日誌" : "儲存日誌"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   AUTH WRAPPER - Google Login
   ══════════════════════════════════════════════════════════════ */
const loginStyles = {
  container: {
    display: "flex", alignItems: "center", justifyContent: "center",
    height: "100vh", background: "#F4F6FA", fontFamily: "'DM Sans','Noto Sans TC',sans-serif"
  },
  card: {
    background: "#FFF", borderRadius: 16, padding: "48px 40px", textAlign: "center",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)", maxWidth: 400, width: "90%"
  },
  logo: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 700, color: "#1E293B", marginBottom: 8 },
  sub: { fontSize: 14, color: "#94A3B8", marginBottom: 32, lineHeight: 1.5 },
  btn: {
    display: "inline-flex", alignItems: "center", gap: 10,
    padding: "12px 28px", borderRadius: 8, border: "1px solid #D1D5DB",
    background: "#FFF", color: "#334155", fontSize: 15, fontWeight: 600,
    cursor: "pointer", fontFamily: "'DM Sans','Noto Sans TC',sans-serif",
    transition: "box-shadow .15s"
  },
  avatar: { width: 32, height: 32, borderRadius: "50%", marginRight: 8 },
  userBar: {
    display: "flex", alignItems: "center", justifyContent: "flex-end",
    padding: "8px 16px", background: "#FFF", borderBottom: "1px solid #E8ECF1", fontSize: 13
  },
  logoutBtn: {
    padding: "4px 12px", borderRadius: 6, border: "1px solid #CBD5E1",
    background: "transparent", color: "#64748B", cursor: "pointer", fontSize: 12,
    fontFamily: "'DM Sans','Noto Sans TC',sans-serif", marginLeft: 10
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Login error:", e);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout error:", e);
    }
  };

  if (authLoading) {
    return (
      <div style={loginStyles.container}>
        <div style={{ color: "#94A3B8", fontSize: 15 }}>載入中...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={loginStyles.container}>
        <div style={loginStyles.card}>
          <div style={loginStyles.logo}>📊</div>
          <div style={loginStyles.title}>Pattern Book</div>
          <div style={loginStyles.sub}>股價型態學習記錄工具<br />登入後開始記錄你的型態觀察</div>
          <button style={loginStyles.btn} onClick={handleLogin}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.1)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            使用 Google 帳號登入
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={loginStyles.userBar}>
        <img src={user.photoURL} alt="" style={loginStyles.avatar} referrerPolicy="no-referrer" />
        <span style={{ color: "#475569", fontWeight: 500 }}>{user.displayName}</span>
        <button style={loginStyles.logoutBtn} onClick={handleLogout}>登出</button>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <StockDatabook userId={user.uid} />
      </div>
    </div>
  );
}
