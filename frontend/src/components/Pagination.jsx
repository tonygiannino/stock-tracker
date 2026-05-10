import styles from "./Pagination.module.css";

const PAGE_SIZES = [15, 25, 50];

export default function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const totalPages = Math.ceil(total / pageSize);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, total);

  return (
    <div className={styles.pagination}>
      <div className={styles.pageInfo}>
        {start}–{end} of {total}
      </div>

      <div className={styles.pageControls}>
        <button onClick={() => onPage(1)}            disabled={page === 1}>«</button>
        <button onClick={() => onPage(page - 1)}     disabled={page === 1}>‹</button>
        <span className={styles.pageNum}>Page {page} of {totalPages || 1}</span>
        <button onClick={() => onPage(page + 1)}     disabled={page >= totalPages}>›</button>
        <button onClick={() => onPage(totalPages)}   disabled={page >= totalPages}>»</button>
      </div>

      <div className={styles.pageSize}>
        <label>
          Rows per page:
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
