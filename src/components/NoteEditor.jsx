import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { toEditorHtml } from "../lib/richtext.js";

function Tool({ title, active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      className="tool-btn"
      data-active={!!active}
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      disabled={disabled}
      // keep the editor focused/selection intact when tapping a tool
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FormatBar({ editor }) {
  if (!editor) return null;
  const run = () => editor.chain().focus();

  return (
    <div className="format-bar" role="toolbar" aria-label="Formatting">
      <Tool title="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => run().toggleBold().run()}>
        <b>B</b>
      </Tool>
      <Tool title="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => run().toggleItalic().run()}>
        <i>I</i>
      </Tool>
      <Tool title="Underline (Ctrl+U)" active={editor.isActive("underline")} onClick={() => run().toggleUnderline().run()}>
        <u>U</u>
      </Tool>
      <Tool title="Strikethrough" active={editor.isActive("strike")} onClick={() => run().toggleStrike().run()}>
        <s>S</s>
      </Tool>

      <span className="tool-sep" />

      <Tool title="Heading" active={editor.isActive("heading", { level: 1 })} onClick={() => run().toggleHeading({ level: 1 }).run()}>
        H1
      </Tool>
      <Tool title="Subheading" active={editor.isActive("heading", { level: 2 })} onClick={() => run().toggleHeading({ level: 2 }).run()}>
        H2
      </Tool>

      <span className="tool-sep" />

      <Tool title="Bulleted list" active={editor.isActive("bulletList")} onClick={() => run().toggleBulletList().run()}>
        •
      </Tool>
      <Tool title="Numbered list" active={editor.isActive("orderedList")} onClick={() => run().toggleOrderedList().run()}>
        1.
      </Tool>
      <Tool title="Checklist" active={editor.isActive("taskList")} onClick={() => run().toggleTaskList().run()}>
        ☑
      </Tool>
      <Tool title="Quote" active={editor.isActive("blockquote")} onClick={() => run().toggleBlockquote().run()}>
        ❝
      </Tool>

      <span className="tool-sep" />

      <Tool title="Undo" disabled={!editor.can().undo()} onClick={() => run().undo().run()}>
        ↶
      </Tool>
      <Tool title="Redo" disabled={!editor.can().redo()} onClick={() => run().redo().run()}>
        ↷
      </Tool>
    </div>
  );
}

export default function NoteEditor({ note, folders, onChange, onDelete, onBack }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const debounceRef = useRef(null);
  const pendingRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Start writing…" })
    ],
    content: toEditorHtml(note.body),
    onUpdate: ({ editor }) => setBody(editor.getHTML())
  });

  // Debounced save
  useEffect(() => {
    if (title === note.title && body === note.body) return;
    pendingRef.current = { title, body };
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pendingRef.current = null;
      onChange(note.id, { title, body });
    }, 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  // Don't lose the last half-second of typing when switching notes
  useEffect(() => {
    const id = note.id;
    return () => {
      if (pendingRef.current) onChangeRef.current(id, pendingRef.current);
    };
  }, [note.id]);

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

      <FormatBar editor={editor} />
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}
