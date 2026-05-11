import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./RankingsPage.module.css";
import Pagination from "../components/Pagination";
import { apiUrl, useAuthFetch } from "../lib/api";

// ---------------------------------------------------------------------------
// Momentum factor definitions
// ---------------------------------------------------------------------------
const FACTORS = [
  {
    key: "wml",
    label: "WML",
    name: "12-1 Month",
    description: "Winners Minus Losers — 12-month return excluding the last month. The classic Carhart momentum factor.",
    dataKey: "ret_12_1m",
    higherIsBetter: true,
  },
  {
    key: "m6",
    label: "6M",
    name: "6-Month",
    description: "6-month price return. Medium-term momentum signal.",
    dataKey: "ret_6m",
    higherIsBetter: true,
  },
  {
    key: "m3",
    label: "3M",
    name: "3-Month",
    description: "3-month price return. Short-to-medium term momentum.",
    dataKey: "ret_3m",
    higherIsBetter: true,
  },
  {
    key: "m1",
    label: "1M",
    name: "1-Month",
    description: "1-month price return. Short-term momentum (note: can exhibit reversal).",
    dataKey: "ret_1m",
    higherIsBetter: true,
  },
  {
    key: "trend",
    label: "Trend",
    name: "vs 200MA",
    description: "Price relative to 200-day moving average. Positive = above trend.",
    dataKey: "vs_200ma",
    higherIsBetter: true,
  },
  {
    key: "rsi",
    label: "RSI",
    name: "RSI-14",
    description: "14-day Relative Strength Index. Higher = stronger recent momentum.",
    dataKey: "rsi_14",
    higherIsBetter: true,
  },
];

const COLUMNS = [
  { key: "rank",      label: "#",       title: "Composite momentum rank" },
  { key: "ticker",    label: "Ticker",  title: "Ticker symbol" },
  { key: "company",   label: "Company", title: "Company name" },
  { key: "composite", label: "Score",   title: "Weighted composite score" },
  ...FACTORS.map((f) => ({ key: `score_${f.key}`, label: f.label, title: f.description })),
  { key: "ret_12_1m", label: "12-1M",   title: "12-1 month return" },
  { key: "ret_6m",    label: "6M Ret",  title: "6-month return" },
  { key: "ret_3m",    label: "3M Ret",  title: "3-month return" },
  { key: "ret_1m",    label: "1M Ret",  title: "1-month return" },
  { key: "vs_200ma",  label: "vs 200MA",title: "Price vs 200-day MA" },
  { key: "rsi_14",    label: "RSI",     title: "14-day RSI" },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function computePercentiles(items, dataKey, higherIsBetter) {
  const valid = items
    .map((s) => ({ ticker: s.ticker, val: s[dataKey] }))
    .filter((x) => x.val != null && !Number.isNaN(x.val));

  const neutral = Object.fromEntries(items.map((s) => [s.ticker, 50]));
  if (valid.length < 2) return neutral;

  const vals  = valid.map((x) => x.val);
  const scores = { ...neutral };

  valid.forEach(({ ticker, val }) => {
    const below = vals.filter((v) => v < val).length;
    const equal = vals.filter((v) => v === val).length;
    const raw   = ((below + 0.5 * equal) / vals.length) * 100;
    scores[ticker] = higherIsBetter ? raw : 100 - raw;
  });

  return scores;
}

function computeRankings(stocks, weights) {
  const factorScores = {};
  FACTORS.forEach(({ key, dataKey, higherIsBetter }) => {
    factorScores[key] = computePercentiles(stocks, dataKey, higherIsBetter);
  });

  const totalWeight = FACTORS.reduce((sum, f) => sum + (weights[f.key] ?? 0), 0) || 1;

  const ranked = stocks.map((s) => {
    const scores = {};
    FACTORS.forEach(({ key }) => { scores[key] = factorScores[key][s.ticker] ?? 50; });
    const composite =
      FACTORS.reduce((sum, { key }) => sum + scores[key] * (weights[key] ?? 0), 0) / totalWeight;
    return { ...s, scores, composite };
  });

  ranked.sort((a, b) => b.composite - a.composite);
  return ranked.map((s, i) => ({ ...s, rank: i + 1 }));
}

function getSortValue(row, key) {
  if (key.startsWith("score_")) return row.scores[key.slice(6)] ?? -1;
  if (key === "composite") return row.composite;
  return row[key] ?? null;
}

function sortRows(rows, col, dir) {
  return [...rows].sort((a, b) => {
    const av = getSortValue(a, col);
    const bv = getSortValue(b, col);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number")
      return dir === "asc" ? av - bv : bv - av;
    const as = String(av).toLowerCase();
    const bs = String(bv).toLowerCase();
    return dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
  });
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
function scoreColor(score) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#65a30d";
  if (score >= 40) return "#ca8a04";
  if (score >= 20) return "#ea580c";
  return "#dc2626";
}

function ScoreBadge({ score }) {
  const color = scoreColor(score);
  return (
    <span className={styles.badge} style={{ color, borderColor: color }}>
      {score.toFixed(1)}
    </span>
  );
}

function ReturnCell({ val }) {
  if (val == null) return <span className={styles.raw}>—</span>;
  const pct   = (val * 100).toFixed(1);
  const color = val >= 0 ? "#16a34a" : "#dc2626";
  return <span style={{ color, fontWeight: 500 }}>{val >= 0 ? "+" : ""}{pct}%</span>;
}

function SortTh({ col, label, title, sortCol, sortDir, onSort, className = "", style = {} }) {
  const active = sortCol === col;
  return (
    <th
      className={`${styles.sortable} ${className}`}
      title={title}
      style={style}
      onClick={() => onSort(col)}
      aria-sort={active ? sortDir : "none"}
    >
      {label}
      <span className={styles.arrow}>
        {active ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅"}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function MomentumPage() {
  const navigate = useNavigate();
  const authFetch = useAuthFetch();
  const [stocks, setStocks]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [weights, setWeights] = useState({ wml: 3, m6: 2, m3: 1, m1: 0, trend: 2, rsi: 1 });
  const [sortCol, setSortCol] = useState("composite");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(15);

  function handleSort(col) {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      const defaultAsc = ["ticker", "company"];
      setSortDir(defaultAsc.includes(col) ? "asc" : "desc");
    }
    setPage(1);
  }

  async function fetchMomentum() {
    setLoading(true);
    setError("");
    try {
      const res  = await authFetch(apiUrl("/api/momentum"));
      if (!res.ok) throw new Error("Failed to load momentum data");
      const data = await res.json();
      setStocks(data);
      const dates = data.map((d) => d.last_updated).filter(Boolean).sort();
      if (dates.length) setLastUpdated(new Date(dates[dates.length - 1]));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError("");
    try {
      const res  = await authFetch(apiUrl("/api/momentum/refresh"), { method: "POST" });
      const data = await res.json();
      if (data.errors?.length) console.warn("Some tickers failed:", data.errors);
      await fetchMomentum();
    } catch (err) {
      setError("Refresh failed: " + err.message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchMomentum(); }, []);

  const ranked     = useMemo(() => computeRankings(stocks, weights), [stocks, weights]);
  const sorted     = useMemo(() => sortRows(ranked, sortCol, sortDir), [ranked, sortCol, sortDir]);
  const paginated  = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize]
  );
  const hasData = stocks.some((s) => s.ret_1m != null);
  const totalWeight = FACTORS.reduce((s, f) => s + (weights[f.key] ?? 0), 0);
  const thProps = { sortCol, sortDir, onSort: handleSort };

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Momentum Rankings</h1>
          {lastUpdated && (
            <p className={styles.updated}>Data as of {lastUpdated.toLocaleString()}</p>
          )}
        </div>
        <button className={styles.refreshBtn} onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? "Fetching data…" : "↻ Refresh Data"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {/* Factor weight controls */}
      <div className={styles.controls}>
        <h2 className={styles.controlsTitle}>
          Factor Weights
          <span className={styles.totalWeight}>Total: {totalWeight.toFixed(1)}</span>
        </h2>
        <div className={styles.factorGrid}>
          {FACTORS.map((f) => {
            const pct = totalWeight > 0 ? ((weights[f.key] / totalWeight) * 100).toFixed(0) : 0;
            return (
              <div key={f.key} className={styles.factorCard}>
                <div className={styles.factorHeader}>
                  <span className={styles.factorLabel}>{f.label}</span>
                  <span className={styles.factorName}>{f.name}</span>
                  <span className={styles.factorPct}>{pct}%</span>
                </div>
                <p className={styles.factorDesc}>{f.description}</p>
                <div className={styles.sliderRow}>
                  <span className={styles.sliderVal}>0</span>
                  <input
                    type="range" min={0} max={10} step={0.5}
                    value={weights[f.key]}
                    onChange={(e) =>
                      setWeights((w) => ({ ...w, [f.key]: Number(e.target.value) }))
                    }
                    className={styles.slider}
                  />
                  <span className={styles.sliderVal}>{weights[f.key]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && <p className={styles.loading}>Loading…</p>}

      {!loading && !hasData && (
        <div className={styles.emptyState}>
          <p>No momentum data yet.</p>
          <p>Click <strong>↻ Refresh Data</strong> to pull price history from Yahoo Finance.</p>
          <p className={styles.emptyNote}>
            Calculates 1M, 3M, 6M, 12-1M returns, RSI-14, and 200-day MA for all your stocks.
          </p>
        </div>
      )}

      {!loading && hasData && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              {/* Group header row */}
              <tr className={styles.groupHeader}>
                <th colSpan={4} className={styles.groupIdentity}>Stock</th>
                <th colSpan={FACTORS.length} className={`${styles.groupScores} ${styles.groupDivider}`}>Factor Scores</th>
                <th colSpan={6} className={`${styles.groupRaw} ${styles.groupDivider}`}>Raw Data</th>
              </tr>
              {/* Column header row */}
              <tr>
                <SortTh col="rank"      label="#"       title="Composite momentum rank"   className={styles.stickyTh} style={{ left: 0 }}   {...thProps} />
                <SortTh col="ticker"    label="Ticker"  title="Ticker symbol"             className={styles.stickyTh} style={{ left: 48 }}  {...thProps} />
                <SortTh col="company"   label="Company" title="Company name"              className={styles.stickyTh} style={{ left: 112 }} {...thProps} />
                <SortTh col="composite" label="Score"   title="Weighted composite score"  className={`${styles.stickyTh} ${styles.stickyLast}`} style={{ left: 282 }} {...thProps} />
                {FACTORS.map((f, i) => (
                  <SortTh key={f.key} col={`score_${f.key}`} label={f.label} title={f.description}
                    className={i === 0 ? styles.groupDivider : ""} {...thProps} />
                ))}
                <SortTh col="ret_12_1m" label="12-1M"    title="12-1 month return"  className={styles.groupDivider} {...thProps} />
                <SortTh col="ret_6m"    label="6M Ret"   title="6-month return"     {...thProps} />
                <SortTh col="ret_3m"    label="3M Ret"   title="3-month return"     {...thProps} />
                <SortTh col="ret_1m"    label="1M Ret"   title="1-month return"     {...thProps} />
                <SortTh col="vs_200ma"  label="vs 200MA" title="Price vs 200-day MA" {...thProps} />
                <SortTh col="rsi_14"    label="RSI"      title="14-day RSI"         {...thProps} />
              </tr>
            </thead>
            <tbody>
              {paginated.map((s) => (
                <tr key={s.ticker}>
                  <td className={`${styles.rank} ${styles.stickyTd}`}         style={{ left: 0 }}>  {s.rank}</td>
                  <td className={styles.stickyTd}                              style={{ left: 48 }}>
                    <button className={styles.tickerLink} onClick={() => navigate(`/stocks/${s.ticker}`)}>{s.ticker}</button>
                  </td>
                  <td className={styles.stickyTd}                              style={{ left: 112 }}>{s.company}</td>
                  <td className={`${styles.stickyTd} ${styles.stickyLast}`}    style={{ left: 282 }}><ScoreBadge score={s.composite} /></td>
                  {FACTORS.map((f, i) => (
                    <td key={f.key} className={i === 0 ? styles.groupDivider : ""}><ScoreBadge score={s.scores[f.key]} /></td>
                  ))}
                  <td className={`${styles.groupDivider}`}><ReturnCell val={s.ret_12_1m} /></td>
                  <td><ReturnCell val={s.ret_6m} /></td>
                  <td><ReturnCell val={s.ret_3m} /></td>
                  <td><ReturnCell val={s.ret_1m} /></td>
                  <td><ReturnCell val={s.vs_200ma} /></td>
                  <td className={styles.raw}>{s.rsi_14 != null ? s.rsi_14.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={sorted.length}
            onPage={setPage}
            onPageSize={(s) => { setPageSize(s); setPage(1); }}
          />
        </div>
      )}
    </div>
  );
}
