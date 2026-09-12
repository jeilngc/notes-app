import { useEffect, useState, useCallback } from "react";
import Login from "./components/Login.jsx";
import NotesList from "./components/NotesList.jsx";
import NoteEditor from "./components/NoteEditor.jsx";
import FoldersBar from "./components/FoldersBar.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import {
  checkSession,
  login,
  verifyOfflinePassword,
  hasOfflineAuth,
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
  const [authed, setAuthed] = useState(null);
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [search, setSearch] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pending, setPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileView, setMobileView] = useState("list");
  const [confirmState, setConfirmState] = useState(null);

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

  useEffect(() => {
    let cancelled = false;

    async function initializeAuth() {
      try {
        await checkSession();
        if (!cancelled) setAuthed(true);
        return;
      } catch (err) {
        if (err.code === 401) {
          if (!cancelled) setAuthed(false);
          return;
        }
      }

      if (!cancelled) setAuthed(false);
    }

    initializeAuth();
    return () => {
      cancelled = true;
    };
  }, []);

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
    try {
      await login(password);
      setAuthed(true);
      return;
    } catch (err) {
      // A 401/400/500 is a real server response and must not be bypassed.
      // Only a fetch/network failure is allowed to use the local verifier.
      if (err.code) throw err;
    }

    if (!hasOfflineAuth()) {
      throw new Error("offline-login-unavailable");
    }

    const valid = await verifyOfflinePassword(password);
    if (!valid) {
      throw new Error("unauthorized");
    }

    setOffline(true);
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
    <>
      <FoldersBar
        folders={folders}
        activeFolderId={activeFolderId}
        onSelect={setActiveFolderId}
        onCreate={handleCreateFolder}
        onDelete={requestDeleteFolder}
        offline={offline}
        pending={pending}
      />
      <div className="app-shell">
        <NotesList
          notes={visibleNotes}
          activeId={activeId}
          search={search}
          onSearch={setSearch}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={requestDeleteNote}
          onRefresh={handleManualRefresh}
          refreshing={refreshing}
          mobileView={mobileView}
        />
        <NoteEditor
          note={activeNote}
          onChange={handleChange}
          onBack={() => setMobileView("list")}
          mobileView={mobileView}
          offline={offline}
        />
      </div>
      {confirmState && (
        <ConfirmDialog
          title={confirmState.type === "note" ? "Delete note?" : "Delete folder?"}
          message={
            confirmState.type === "note"
              ? "This note will be permanently deleted."
              : "Notes in this folder will be moved to no folder."
          }
          onConfirm={confirmDelete}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </>
  );
}
