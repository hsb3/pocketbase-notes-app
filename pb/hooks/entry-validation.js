function body(doc) {
  let text = "";
  let count = 0;
  function visit(node, parent, depth) {
    if (!node || typeof node !== "object" || Array.isArray(node) || depth > 12 || ++count > 5000) throw new Error("Invalid or overly complex document.");
    const allowed = parent === null ? ["doc"] : parent === "doc" || parent === "blockquote" ? ["paragraph", "heading", "blockquote"] : ["text", "hardBreak"];
    if (!allowed.includes(node.type)) throw new Error("Unsupported document content.");
    for (const key of Object.keys(node)) if (!["type", "content", "text", "marks", "attrs"].includes(key)) throw new Error("Unsupported document property.");
    if (node.type === "heading") {
      if (!node.attrs || !Number.isInteger(node.attrs.level) || node.attrs.level < 1 || node.attrs.level > 6 || Object.keys(node.attrs).length !== 1) throw new Error("Invalid heading.");
    } else if (node.attrs && Object.keys(node.attrs).length) throw new Error("Unsupported attributes.");
    if (node.type === "text") {
      if (typeof node.text !== "string" || !node.text.length || node.content) throw new Error("Invalid text.");
      text += node.text;
      if (node.marks !== undefined && (!Array.isArray(node.marks) || node.marks.some((mark) => !mark || !["bold", "italic"].includes(mark.type) || Object.keys(mark).some((key) => key !== "type")))) throw new Error("Unsupported formatting.");
    } else {
      if (node.text !== undefined || node.marks !== undefined) throw new Error("Invalid document structure.");
      if (node.type === "hardBreak") {
        if (node.content !== undefined) throw new Error("Invalid line break.");
      } else {
        if (node.content !== undefined && !Array.isArray(node.content)) throw new Error("Invalid content.");
        if (["doc", "blockquote"].includes(node.type) && !node.content?.length) throw new Error("Empty document structure.");
        for (const child of node.content || []) visit(child, node.type, depth + 1);
      }
    }
  }
  visit(doc, null, 0);
  if (!text.trim()) throw new Error("Write something before saving.");
  if (JSON.stringify(doc).length > 102400) throw new Error("Entry is too long.");
}
function date(kind, value) {
  if (kind === "note") {
    if (value !== "") throw new Error("Notes cannot have a journal date.");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Choose a valid journal date.");
}
module.exports = { body, date };
