import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import StockForm from "../components/StockForm";
import styles from "./EditPage.module.css";

export default function EditPage() {
  const { ticker } = useParams();
  const navigate = useNavigate();
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchStock() {
      try {
        const res = await fetch(`/api/stocks/${ticker}`);
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

  function handleSave() {
    navigate("/");
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate("/")}>
        ← Back
      </button>
      <h1 className={styles.title}>Edit {ticker}</h1>

      {loading && <p className={styles.loading}>Loading…</p>}
      {error && <p className={styles.error}>{error}</p>}
      {stock && (
        <StockForm
          editing={stock}
          onSave={handleSave}
          onCancel={() => navigate("/")}
        />
      )}
    </div>
  );
}
