import { useState } from "react";

export default function FoldersBar({ folders, activeFolderId, onSelect, onCreate, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function submitNewFolder(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setAdding(false);
      setName("");
      return;
    }
    onCreate(trimmed);
    setName("");
    setAdding(false);
  }

  return (
    <div className="folders-bar scroll-area">
      <button
        className="folder-pill"
        data-active={activeFolderId === null}
        onClick={() => onSelect(null)}
      >
        All notes
      </button>

      {folders.map((folder) => (
        <div key={folder.id} className="folder-pill-wrap">
          <button
            className="folder-pill"
            data-active={activeFolderId === folder.id}
            onClick={() => onSelect(folder.id)}
          >
            {folder.name}
          </button>
          <button
            className="folder-pill-remove"
            aria-label={`Delete folder ${folder.name}`}
            onClick={() => onDelete(folder)}
          >
            ×
          </button>
        </div>
      ))}

      {adding ? (
        <form onSubmit={submitNewFolder} className="folder-add-form">
          <input
            autoFocus
            className="field folder-add-input"
            placeholder="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={submitNewFolder}
          />
        </form>
      ) : (
        <button className="folder-pill folder-pill-add" onClick={() => setAdding(true)}>
          + Folder
        </button>
      )}
    </div>
  );
}
