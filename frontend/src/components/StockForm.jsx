import { useState, useEffect } from "react";
import styles from "./StockForm.module.css";
import { apiUrl, useAuthFetch } from "../lib/api";

const EMPTY = { ticker: "", company: "", sector: "", industry: "", website: "" };

export default function StockForm({ editing, onSave, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const authFetch = useAuthFetch();

  useEffect(() => {
    setForm(editing ?? EMPTY);
    setError("");
  }, [editing]);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const url = editing
        ? apiUrl(`/api/stocks/${editing.ticker}`)
        : apiUrl("/api/stocks");
      const method = editing ? "PUT" : "POST";
      const res = await authFetch(url, {
        method,
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try { const body = await res.json(); msg = body.error || msg; } catch {}
        throw new Error(msg);
      }
      const stock = await res.json();
      onSave(stock);
      if (!editing) setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.title}>{editing ? "Edit Stock" : "Add Stock"}</h2>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Ticker *</span>
          <input
            name="ticker"
            value={form.ticker}
            onChange={handleChange}
            placeholder="AAPL"
            disabled={!!editing}
            required
          />
        </label>

        <label className={styles.field}>
          <span>Company *</span>
          <input
            name="company"
            value={form.company}
            onChange={handleChange}
            placeholder="Apple Inc."
            required
          />
        </label>

        <label className={styles.field}>
          <span>Sector</span>
          <input
            name="sector"
            value={form.sector}
            onChange={handleChange}
            placeholder="Technology"
          />
        </label>

        <label className={styles.field}>
          <span>Industry</span>
          <input
            name="industry"
            value={form.industry}
            onChange={handleChange}
            placeholder="Consumer Electronics"
          />
        </label>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>Website</span>
          <input
            name="website"
            value={form.website}
            onChange={handleChange}
            placeholder="https://apple.com"
            type="url"
          />
        </label>
      </div>

      <div className={styles.actions}>
        {editing && (
          <button type="button" className={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className={styles.submit} disabled={saving}>
          {saving ? "Saving…" : editing ? "Save Changes" : "Add Stock"}
        </button>
      </div>
    </form>
  );
}
