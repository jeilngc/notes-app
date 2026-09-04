import { useEffect, useState, useCallback } from "react";
import Login from "./components/Login.jsx";
import NotesList from "./components/NotesList.jsx";
import NoteEditor from "./components/NoteEditor.jsx";
import FoldersBar from "./components/FoldersBar.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import {
  checkSession,
  login,
  logout,
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
  fetchFolders,
  createFolder,
  deleteFolder,
  flushQueue,
  pendingCount
} from "./lib/api.js";

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking, false = gate, true = in
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [search, setSearch] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pending, setPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileView, setMobileView] = useState("list"); // "list" | "editor"
  const [confirmState, setConfirmState] = useState(null); // { type: "note"|"folder", target }

  const loadAll = useCallback(async () => {
    try {
      const [notesResult, foldersResult] = await Promise.all([fetchNotes(), fetchFolders()]);
      setNotes(notesResult.notes.sort((a, b) => b.updatedAt - a.updatedAt));
      setFolders(foldersResult.folders);
      setOffline(notesResult.offline || foldersResult.offline);
    } catch (err) {
      if (err.code === 401) setAuthed(false);
    }
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      await flushQueue();
      setPending(pendingCount());
      await loadAll();
    } catch (err) {
      if (err.code === 401) setAuthed(false);
    }
  }, [loadAll]);

  // Initial session check
  useEffect(() => {
    checkSession()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  // Once authed, load notes/folders and set up online/offline + focus listeners
  useEffect(() => {
    if (!authed) return;
    loadAll();
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
  }, [authed, loadAll, sync]);

  async function handleLogin(password) {
    await login(password);
    setAuthed(true);
  }

  async function handleLogout() {
    await logout();
    setAuthed(false);
    setNotes([]);
    setFolders([]);
    setActiveId(null);
  }

  async function handleManualRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await sync();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleNew() {
    const note = await createNote({ title: "", body: "", folderId: activeFolderId });
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

  function requestDeleteNote(note) {
    setConfirmState({ type: "note", target: note });
  }

  function requestDeleteFolder(folder) {
    setConfirmState({ type: "folder", target: folder });
  }

  async function confirmDelete() {
    if (!confirmState) return;
    const { type, target } = confirmState;
    setConfirmState(null);

    if (type === "note") {
      await deleteNote(target.id);
      setNotes((prev) => prev.filter((n) => n.id !== target.id));
      setPending(pendingCount());
      if (activeId === target.id) {
        setActiveId(null);
        setMobileView("list");
      }
    } else if (type === "folder") {
      await deleteFolder(target.id);
      setFolders((prev) => prev.filter((f) => f.id !== target.id));
      setNotes((prev) => prev.map((n) => (n.folderId === target.id ? { ...n, folderId: null } : n)));
      if (activeFolderId === target.id) setActiveFolderId(null);
    }
  }

  async function handleCreateFolder(name) {
    const folder = await createFolder(name);
    setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
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
  const visibleNotes = activeFolderId === null ? notes : notes.filter((n) => n.folderId === activeFolderId);

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
          <div className="sidebar-header-actions">
            <button
              className={`btn btn-ghost btn-icon ${refreshing ? "spin" : ""}`}
              onClick={handleManualRefresh}
              aria-label="Refresh"
              title="Refresh"
            >
              ⟳
            </button>
            <button className="btn btn-ghost btn-icon" onClick={handleLogout} aria-label="Lock">
              🔒
            </button>
          </div>
        </div>

        <button className="btn btn-primary new-note-btn" onClick={handleNew}>
          + New note
        </button>

        <FoldersBar
          folders={folders}
          activeFolderId={activeFolderId}
          onSelect={setActiveFolderId}
          onCreate={handleCreateFolder}
          onDelete={requestDeleteFolder}
        />

        <NotesList
          notes={visibleNotes}
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
            folders={folders}
            onChange={handleChange}
            onDelete={requestDeleteNote}
            onBack={() => setMobileView("list")}
          />
        ) : (
          <div className="editor-placeholder">
            <p>Select a note, or create a new one.</p>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.type === "folder" ? "Delete this folder?" : "Delete this note?"}
        message={
          confirmState?.type === "folder"
            ? `"${confirmState?.target?.name}" will be removed. Notes inside it won't be deleted — they'll move to No folder.`
            : `"${confirmState?.target?.title || "Untitled"}" will be permanently deleted. This can't be undone.`
        }
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
