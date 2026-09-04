import { useEffect, useRef, useState } from "react";

export default function NoteEditor({ note, folders, onChange, onDelete, onBack }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const debounceRef = useRef(null);

  // Sync local state when switching to a different note
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
  }, [note.id]);

  useEffect(() => {
    if (title === note.title && body === note.body) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(note.id, { title, body });
    }, 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  const updated = new Date(note.updatedAt);

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <button className="btn btn-ghost btn-icon editor-back" onClick={onBack} aria-label="Back to notes">
          ←
        </button>
        <span className="editor-meta">
          Edited {updated.toLocaleDateString([], { month: "short", day: "numeric" })} at{" "}
          {updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
        <select
          className="field editor-folder-select"
          value={note.folderId || ""}
          onChange={(e) => onChange(note.id, { folderId: e.target.value || null })}
          aria-label="Folder"
        >
          <option value="">No folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-icon btn-danger editor-delete" onClick={() => onDelete(note)} aria-label="Delete note">
          🗑
        </button>
      </div>

      <input
        className="editor-title"
        placeholder="Untitled"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="editor-body"
        placeholder="Start writing…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
    </div>
  );
}
