import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import styles from "./DetailPage.module.css";
import StockNotes from "../components/StockNotes";
import { apiUrl, useAuthFetch } from "../lib/api";

export default function DetailPage() {
  const { ticker } = useParams();
  const navigate = useNavigate();
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const authFetch = useAuthFetch();

  useEffect(() => {
    async function fetchStock() {
      try {
        const res = await authFetch(apiUrl(`/api/stocks/${ticker}`));
        if (!res.ok) throw new Error(`Stock not found (${res.status})`);
        setStock(await res.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchStock();
  }, [ticker]);

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate("/")}>
        ← Back
      </button>

      {loading && <p className={styles.loading}>Loading…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {stock && (
        <>
          <div className={styles.hero}>
            <div>
              <span className={styles.ticker}>{stock.ticker}</span>
              <h1 className={styles.company}>{stock.company}</h1>
            </div>
            <button
              className={styles.editBtn}
              onClick={() => navigate(`/stocks/${stock.ticker}/edit`)}
            >
              Edit
            </button>
          </div>

          <div className={styles.grid}>
            <div className={styles.card}>
              <span className={styles.label}>ID</span>
              <span className={styles.value}>{stock.id}</span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>Ticker</span>
              <span className={styles.value}>{stock.ticker}</span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>Sector</span>
              <span className={stock.sector ? styles.value : styles.empty}>
                {stock.sector || "—"}
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>Industry</span>
              <span className={stock.industry ? styles.value : styles.empty}>
                {stock.industry || "—"}
              </span>
            </div>
            <div className={`${styles.card} ${styles.wide}`}>
              <span className={styles.label}>Website</span>
              {stock.website ? (
                <a
                  href={stock.website}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.link}
                >
                  {stock.website}
                </a>
              ) : (
                <span className={styles.empty}>—</span>
              )}
            </div>
          </div>

          <StockNotes ticker={stock.ticker} />
        </>
      )}
    </div>
  );
}
