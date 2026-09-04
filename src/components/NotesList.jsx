function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function NotesList({ notes, activeId, onSelect, search, onSearchChange }) {
  const filtered = notes.filter((n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
  });

  return (
    <div className="notes-list">
      <input
        className="field notes-search"
        placeholder="Search notes"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <div className="scroll-area notes-list-scroll">
        {filtered.length === 0 && (
          <div className="notes-empty">
            {search.trim() ? "No notes match your search." : "No notes yet. Create your first one."}
          </div>
        )}

        {filtered.map((note) => (
          <button
            key={note.id}
            className="note-item"
            data-active={note.id === activeId}
            onClick={() => onSelect(note.id)}
          >
            <div className="note-item-title">{note.title || "Untitled"}</div>
            <div className="note-item-preview">{note.body ? note.body.slice(0, 80) : "No additional text"}</div>
            <div className="note-item-date">{formatDate(note.updatedAt)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
