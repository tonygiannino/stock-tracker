import { useState, useEffect, useRef } from "react";
import styles from "./StockNotes.module.css";
import { apiUrl, useAuthFetch } from "../lib/api";

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day:   "numeric",
    year:  "numeric",
    hour:  "numeric",
    minute: "2-digit",
  });
}

export default function StockNotes({ ticker }) {
  const [notes, setNotes]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const textareaRef           = useRef(null);
  const authFetch             = useAuthFetch();

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    authFetch(apiUrl(`/api/stocks/${ticker}/notes`))
      .then((r) => r.json())
      .then((data) => setNotes(data))
      .catch(() => setError("Failed to load notes."))
      .finally(() => setLoading(false));
  }, [ticker]);

  async function handleAdd(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSaving(true);
    setError("");
    try {
      const res = await authFetch(apiUrl(`/api/stocks/${ticker}/notes`), {
        method: "POST",
        body:   JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      const note = await res.json();
      setNotes((prev) => [note, ...prev]);
      setDraft("");
      textareaRef.current?.focus();
    } catch {
      setError("Could not save note.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      const res = await authFetch(apiUrl(`/api/stocks/${ticker}/notes/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error();
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      setError("Could not delete note.");
    }
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.heading}>Notes</h2>

      <form className={styles.form} onSubmit={handleAdd}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="Add a note…"
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd(e);
          }}
        />
        <div className={styles.formFooter}>
          <span className={styles.hint}>⌘ + Enter to save</span>
          <button className={styles.addBtn} type="submit" disabled={saving || !draft.trim()}>
            {saving ? "Saving…" : "Add Note"}
          </button>
        </div>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      {loading && <p className={styles.loading}>Loading notes…</p>}

      {!loading && notes.length === 0 && (
        <p className={styles.empty}>No notes yet.</p>
      )}

      <ul className={styles.list}>
        {notes.map((note) => (
          <li key={note.id} className={styles.note}>
            <div className={styles.noteBody}>
              <p className={styles.noteContent}>{note.content}</p>
              <span className={styles.noteDate}>{formatDate(note.created_at)}</span>
            </div>
            <button
              className={styles.deleteBtn}
              onClick={() => handleDelete(note.id)}
              title="Delete note"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
