import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StockTable from "../components/StockTable";
import styles from "./HomePage.module.css";

export default function HomePage() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const fetchStocks = useCallback(async () => {
    try {
      const res = await fetch("/api/stocks");
      if (!res.ok) throw new Error(`Failed to load stocks (${res.status})`);
      setStocks(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);

  async function handleDelete(ticker) {
    if (!confirm(`Delete ${ticker}?`)) return;
    const res = await fetch(`/api/stocks/${ticker}`, { method: "DELETE" });
    if (res.ok) setStocks((prev) => prev.filter((s) => s.ticker !== ticker));
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? stocks.filter((s) =>
        s.ticker.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        (s.sector   || "").toLowerCase().includes(q) ||
        (s.industry || "").toLowerCase().includes(q)
      )
    : stocks;

  return (
    <div>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Stocks</h1>
          <span className={styles.count}>
            {q ? `${filtered.length} of ${stocks.length}` : `${stocks.length}`} stocks
          </span>
        </div>
        <div className={styles.actions}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.search}
              type="text"
              placeholder="Search ticker, company, sector…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className={styles.clearBtn} onClick={() => setQuery("")}>×</button>
            )}
          </div>
          <button className={styles.addBtn} onClick={() => navigate("/stocks/new")}>
            + Add Stock
          </button>
        </div>
      </header>

      {loading && <p className={styles.loading}>Loading…</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!loading && !error && (
        <StockTable
          stocks={filtered}
          onEdit={(s) => navigate(`/stocks/${s.ticker}/edit`)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
