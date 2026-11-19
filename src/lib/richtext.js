// Notes are stored as HTML. Older notes are plain text, so convert on the fly.
const HTML_RE = /^\s*<(p|h[1-6]|ul|ol|blockquote|pre|hr|div)[\s>/]/i;

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// What the editor should load
export function toEditorHtml(body) {
  if (!body) return "";
  if (HTML_RE.test(body)) return body;
  return body
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

// Plain text for search + list previews
export function htmlToText(body) {
  if (!body) return "";
  if (!HTML_RE.test(body)) return body;
  const spaced = body.replace(/<\/(p|li|h[1-6]|blockquote|pre|div)>|<br\s*\/?>/gi, " ");
  const doc = new DOMParser().parseFromString(spaced, "text/html"); // inert: no scripts run
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}
