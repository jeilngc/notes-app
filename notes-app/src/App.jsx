import { useEffect, useState, useCallback } from "react";
import Login from "./components/Login.jsx";
import NotesList from "./components/NotesList.jsx";
import NoteEditor from "./components/NoteEditor.jsx";
import {
  checkSession,
  login,
  logout,
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
  flushQueue,
  pendingCount
} from "./lib/api.js";

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking, false = gate, true = in
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pending, setPending] = useState(0);
  const [mobileView, setMobileView] = useState("list"); // "list" | "editor"

  const loadNotes = useCallback(async () => {
    try {
      const { notes: fetched, offline: isOffline } = await fetchNotes();
      setNotes(fetched.sort((a, b) => b.updatedAt - a.updatedAt));
      setOffline(isOffline);
    } catch (err) {
      if (err.code === 401) setAuthed(false);
    }
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      await flushQueue();
      setPending(pendingCount());
      await loadNotes();
    } catch (err) {
      if (err.code === 401) setAuthed(false);
    }
  }, [loadNotes]);

  // Initial session check
  useEffect(() => {
    checkSession()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  // Once authed, load notes and set up online/offline + focus listeners
  useEffect(() => {
    if (!authed) return;
    loadNotes();
    setPending(pendingCount());

    function handleOnline() {
      setOffline(false);
      sync();
    }
    function handleOffline() {
      setOffline(true);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", sync);
    };
  }, [authed, loadNotes, sync]);

  async function handleLogin(password) {
    await login(password);
    setAuthed(true);
  }

  async function handleLogout() {
    await logout();
    setAuthed(false);
    setNotes([]);
    setActiveId(null);
  }

  async function handleNew() {
    const note = await createNote({ title: "", body: "" });
    setNotes((prev) => [note, ...prev]);
    setActiveId(note.id);
    setMobileView("editor");
  }

  async function handleChange(id, patch) {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))
    );
    const saved = await updateNote(id, patch);
    if (saved) {
      setNotes((prev) => prev.map((n) => (n.id === id ? saved : n)));
    }
    setPending(pendingCount());
  }

  async function handleDelete(id) {
    await deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setPending(pendingCount());
    if (activeId === id) {
      setActiveId(null);
      setMobileView("list");
    }
  }

  function handleSelect(id) {
    setActiveId(id);
    setMobileView("editor");
  }

  if (authed === null) {
    return <div className="boot-screen" />;
  }

  if (!authed) {
    return <Login onSubmit={handleLogin} />;
  }

  const activeNote = notes.find((n) => n.id === activeId) || null;

  return (
    <div className="app-shell">
      <div className="noise" />
      <div className="glow-orb" style={{ width: 500, height: 500, top: -200, right: -150 }} />

      <aside className={`sidebar ${mobileView === "editor" ? "sidebar-hidden-mobile" : ""}`}>
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-mark">N</span>
            <span className="brand-name">Notes</span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={handleLogout} aria-label="Lock">
            🔒
          </button>
        </div>

        <button className="btn btn-primary new-note-btn" onClick={handleNew}>
          + New note
        </button>

        <NotesList
          notes={notes}
          activeId={activeId}
          onSelect={handleSelect}
          search={search}
          onSearchChange={setSearch}
        />

        <div className="sync-status">
          <span className={`status-dot ${offline ? "offline" : "online"}`} />
          <span>
            {offline ? "Offline — saved locally" : pending > 0 ? `Syncing ${pending}…` : "Synced"}
          </span>
        </div>
      </aside>

      <main className={`editor-pane ${mobileView === "list" ? "editor-hidden-mobile" : ""}`}>
        {activeNote ? (
          <NoteEditor
            note={activeNote}
            onChange={handleChange}
            onDelete={handleDelete}
            onBack={() => setMobileView("list")}
          />
        ) : (
          <div className="editor-placeholder">
            <p>Select a note, or create a new one.</p>
          </div>
        )}
      </main>
    </div>
  );
}
