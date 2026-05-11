import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./StockTable.module.css";
import Pagination from "./Pagination";

const COLUMNS = [
  { key: "ticker",   label: "Ticker"   },
  { key: "company",  label: "Company"  },
  { key: "sector",   label: "Sector"   },
  { key: "industry", label: "Industry" },
];

function sortStocks(stocks, col, dir) {
  return [...stocks].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av;
    }
    const as = (av || "").toLowerCase();
    const bs = (bv || "").toLowerCase();
    if (as < bs) return dir === "asc" ? -1 : 1;
    if (as > bs) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

export default function StockTable({ stocks, onEdit, onDelete }) {
  const navigate = useNavigate();
  const [sortCol, setSortCol] = useState("ticker");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(15);

  function handleSort(key) {
    if (key === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  if (stocks.length === 0) {
    return <p className={styles.empty}>No stocks yet. Add one above.</p>;
  }

  const sorted    = sortStocks(stocks, sortCol, sortDir);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map(({ key, label }) => (
              <th
                key={key}
                className={styles.sortable}
                onClick={() => handleSort(key)}
                aria-sort={sortCol === key ? sortDir : "none"}
              >
                {label}
                <span className={styles.arrow}>
                  {sortCol === key ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅"}
                </span>
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((s) => (
            <tr key={s.ticker}>
              <td className={styles.ticker}>
                <button className={styles.tickerLink} onClick={() => navigate(`/stocks/${s.ticker}`)}>
                  {s.ticker}
                </button>
              </td>
              <td className={styles.company}>{s.company}</td>
              <td>{s.sector || <span className={styles.na}>—</span>}</td>
              <td>{s.industry || <span className={styles.na}>—</span>}</td>
              <td className={styles.actions}>
                <button className={styles.edit} onClick={() => onEdit(s)}>Edit</button>
                <button className={styles.delete} onClick={() => onDelete(s.ticker)}>Delete</button>
              </td>
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
  );
}
