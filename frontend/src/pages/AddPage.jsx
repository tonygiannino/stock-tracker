import { useNavigate } from "react-router-dom";
import StockForm from "../components/StockForm";
import styles from "./EditPage.module.css";

export default function AddPage() {
  const navigate = useNavigate();

  function handleSave() {
    navigate("/");
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate("/")}>
        ← Back
      </button>
      <h1 className={styles.title}>Add Stock</h1>
      <StockForm onSave={handleSave} />
    </div>
  );
}
