import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./RankingsPage.module.css";
import Pagination from "../components/Pagination";

// ---------------------------------------------------------------------------
// Factor definitions
// ---------------------------------------------------------------------------
const FACTORS = [
  {
    key: "smb",
    label: "SMB",
    name: "Size",
    description: "Small Minus Big — favours smaller companies by market cap.",
    dataKey: "market_cap",
    higherIsBetter: false,
  },
  {
    key: "hml",
    label: "HML",
    name: "Value",
    description: "High Minus Low — favours value stocks with a low P/B ratio.",
    dataKey: "pb_ratio",
    higherIsBetter: false,
  },
  {
    key: "rmw",
    label: "RMW",
    name: "Profitability",
    description: "Robust Minus Weak — favours highly profitable companies by ROE.",
    dataKey: "roe",
    higherIsBetter: true,
  },
  {
    key: "cma",
    label: "CMA",
    name: "Investment",
    description: "Conservative Minus Aggressive — favours low asset-growth companies.",
    dataKey: "asset_growth",
    higherIsBetter: false,
  },
  {
    key: "mkt",
    label: "MKT",
    name: "Market",
    description: "Market Beta — favours stocks with higher systematic market exposure.",
    dataKey: "beta",
    higherIsBetter: true,
  },
];

// Column definitions for the table header
const COLUMNS = [
  { key: "rank",         label: "#",         title: "Composite rank"         },
  { key: "ticker",       label: "Ticker",    title: "Ticker symbol"          },
  { key: "company",      label: "Company",   title: "Company name"           },
  { key: "composite",    label: "Score",     title: "Weighted composite score" },
  ...FACTORS.map((f) => ({
    key:   `score_${f.key}`,
    label: f.label,
    title: f.description,
  })),
  { key: "market_cap",   label: "Mkt Cap",   title: "Market capitalisation"  },
  { key: "pb_ratio",     label: "P/B",       title: "Price-to-book ratio"    },
  { key: "roe",          label: "ROE",       title: "Return on equity"       },
  { key: "beta",         label: "β",         title: "Market beta"            },
  { key: "asset_growth", label: "Asset Gr.", title: "Annual asset growth"    },
];

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------
function computePercentiles(items, dataKey, higherIsBetter) {
  const valid = items
    .map((s) => ({ ticker: s.ticker, val: s[dataKey] }))
    .filter((x) => x.val != null && !Number.isNaN(x.val));

  const neutral = Object.fromEntries(items.map((s) => [s.ticker, 50]));
  if (valid.length < 2) return neutral;

  const vals = valid.map((x) => x.val);
  const scores = { ...neutral };

  valid.forEach(({ ticker, val }) => {
    const below = vals.filter((v) => v < val).length;
    const equal = vals.filter((v) => v === val).length;
    const raw = ((below + 0.5 * equal) / vals.length) * 100;
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
    FACTORS.forEach(({ key }) => {
      scores[key] = factorScores[key][s.ticker] ?? 50;
    });
    const composite =
      FACTORS.reduce((sum, { key }) => sum + scores[key] * (weights[key] ?? 0), 0) / totalWeight;
    return { ...s, scores, composite };
  });

  ranked.sort((a, b) => b.composite - a.composite);
  return ranked.map((s, i) => ({ ...s, rank: i + 1 }));
}

// Get the sort value for a row given a column key
function getSortValue(row, key) {
  if (key.startsWith("score_")) return row.scores[key.slice(6)] ?? -1;
  if (key === "composite") return row.composite;
  return row[key] ?? null;
}

function sortRows(rows, col, dir) {
  return [...rows].sort((a, b) => {
    const av = getSortValue(a, col);
    const bv = getSortValue(b, col);
    // nulls always last
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av;
    }
    const as = String(av).toLowerCase();
    const bs = String(bv).toLowerCase();
    if (as < bs) return dir === "asc" ? -1 : 1;
    if (as > bs) return dir === "asc" ? 1 : -1;
    return 0;
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

function fmtMarketCap(val) {
  if (!val) return "—";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
  if (val >= 1e9)  return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6)  return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toLocaleString()}`;
}

function fmtPct(val) { return val != null ? `${(val * 100).toFixed(1)}%` : "—"; }
function fmtNum(val, dp = 2) { return val != null ? val.toFixed(dp) : "—"; }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function RankingsPage() {
  const navigate = useNavigate();
  const [stocks, setStocks]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [weights, setWeights]     = useState({ smb: 1, hml: 1, rmw: 1, cma: 1, mkt: 0 });
  const [sortCol, setSortCol]     = useState("composite");
  const [sortDir, setSortDir]     = useState("desc");
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(15);

  function handleSort(col) {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      const defaultDesc = ["rank", "composite", ...FACTORS.map((f) => `score_${f.key}`),
                           "market_cap", "pb_ratio", "roe", "beta", "asset_growth"];
      setSortDir(defaultDesc.includes(col) ? "desc" : "asc");
    }
    setPage(1);
  }

  async function fetchFactors() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/factors");
      if (!res.ok) throw new Error("Failed to load factor data");
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
      const res = await fetch("/api/factors/refresh", { method: "POST" });
      const data = await res.json();
      if (data.errors?.length) console.warn("Some tickers failed:", data.errors);
      await fetchFactors();
    } catch (err) {
      setError("Refresh failed: " + err.message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchFactors(); }, []);

  const ranked   = useMemo(() => computeRankings(stocks, weights), [stocks, weights]);
  const sorted   = useMemo(() => sortRows(ranked, sortCol, sortDir), [ranked, sortCol, sortDir]);
  const paginated = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize]
  );

  const hasData    = stocks.some((s) => s.market_cap != null);
  const totalWeight = FACTORS.reduce((s, f) => s + (weights[f.key] ?? 0), 0);

  const thProps = { sortCol, sortDir, onSort: handleSort };

  return (
    <div>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Value Rankings</h1>
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

      {/* Rankings table */}
      {loading && <p className={styles.loading}>Loading…</p>}

      {!loading && !hasData && (
        <div className={styles.emptyState}>
          <p>No factor data yet.</p>
          <p>Click <strong>↻ Refresh Data</strong> to pull live data from Yahoo Finance.</p>
          <p className={styles.emptyNote}>
            This fetches market cap, beta, P/B, ROE, and asset growth for all your stocks.
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
                <th colSpan={5} className={`${styles.groupRaw} ${styles.groupDivider}`}>Raw Data</th>
              </tr>
              {/* Column header row */}
              <tr>
                <SortTh col="rank"    label="#"       title="Composite rank"          className={`${styles.stickyTh}`} style={{ left: 0 }}   {...thProps} />
                <SortTh col="ticker"  label="Ticker"  title="Ticker symbol"           className={`${styles.stickyTh}`} style={{ left: 48 }}  {...thProps} />
                <SortTh col="company" label="Company" title="Company name"            className={`${styles.stickyTh}`} style={{ left: 112 }} {...thProps} />
                <SortTh col="composite" label="Score" title="Weighted composite score" className={`${styles.stickyTh} ${styles.stickyLast}`} style={{ left: 282 }} {...thProps} />
                {FACTORS.map((f, i) => (
                  <SortTh key={f.key} col={`score_${f.key}`} label={f.label} title={f.description}
                    className={i === 0 ? styles.groupDivider : ""} {...thProps} />
                ))}
                <SortTh col="market_cap"   label="Mkt Cap"   title="Market capitalisation"  className={styles.groupDivider} {...thProps} />
                <SortTh col="pb_ratio"     label="P/B"        title="Price-to-book ratio"    {...thProps} />
                <SortTh col="roe"          label="ROE"        title="Return on equity"       {...thProps} />
                <SortTh col="beta"         label="β"          title="Market beta"            {...thProps} />
                <SortTh col="asset_growth" label="Asset Gr."  title="Annual asset growth"    {...thProps} />
              </tr>
            </thead>
            <tbody>
              {paginated.map((s) => (
                <tr key={s.ticker}>
                  <td className={`${styles.rank} ${styles.stickyTd}`}          style={{ left: 0 }}>  {s.rank}</td>
                  <td className={`${styles.stickyTd}`}                          style={{ left: 48 }}>
                    <button className={styles.tickerLink} onClick={() => navigate(`/stocks/${s.ticker}`)}>{s.ticker}</button>
                  </td>
                  <td className={`${styles.stickyTd}`}                          style={{ left: 112 }}>{s.company}</td>
                  <td className={`${styles.stickyTd} ${styles.stickyLast}`}     style={{ left: 282 }}><ScoreBadge score={s.composite} /></td>
                  {FACTORS.map((f, i) => (
                    <td key={f.key} className={i === 0 ? styles.groupDivider : ""}><ScoreBadge score={s.scores[f.key]} /></td>
                  ))}
                  <td className={`${styles.raw} ${styles.groupDivider}`}>{fmtMarketCap(s.market_cap)}</td>
                  <td className={styles.raw}>{fmtNum(s.pb_ratio)}</td>
                  <td className={styles.raw}>{fmtPct(s.roe)}</td>
                  <td className={styles.raw}>{fmtNum(s.beta)}</td>
                  <td className={styles.raw}>{fmtPct(s.asset_growth)}</td>
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
