const blocks = ["paragraph", "heading", "blockquote", "list", "codeBlock", "horizontalRule", "image", "table", "mathBlock"];
const inline = ["text", "hardBreak", "mention", "mathInline"];
const attributes = { heading: ["level"], codeBlock: ["language"], mathBlock: ["language"], image: ["src", "width", "height"], list: ["kind", "order", "checked", "collapsed"], tableCell: ["colspan", "rowspan", "colwidth"], tableHeaderCell: ["colspan", "rowspan", "colwidth"], mention: ["id", "value", "kind"] };
function safeLink(value) { return typeof value === "string" && /^(https?:\/\/|mailto:|tel:|#)/i.test(value) && !/[\u0000-\u001f]/.test(value); }
function body(doc, hasAttachments) {
  let text = "", substantive = false, count = 0;
  const images = [];
  function visit(node, parent, depth) {
    if (!node || typeof node !== "object" || Array.isArray(node) || depth > 24 || ++count > 5000) throw new Error("Invalid or overly complex document.");
    const children = parent === null ? ["doc"] : parent === "table" ? ["tableRow"] : parent === "tableRow" ? ["tableCell", "tableHeaderCell"] : ["paragraph", "heading"].includes(parent) ? inline : ["codeBlock", "mathBlock", "mathInline"].includes(parent) ? ["text"] : blocks;
    if (!children.includes(node.type)) throw new Error("Unsupported document content.");
    for (const key of Object.keys(node)) if (!["type", "content", "text", "marks", "attrs"].includes(key)) throw new Error("Unsupported document property.");
    const attrs = node.attrs || {};
    if (typeof attrs !== "object" || Array.isArray(attrs) || Object.keys(attrs).some((key) => !(attributes[node.type] || []).includes(key))) throw new Error("Unsupported document attributes.");
    if (node.type === "heading" && (!Number.isInteger(attrs.level) || attrs.level < 1 || attrs.level > 6)) throw new Error("Invalid heading.");
    if (["codeBlock", "mathBlock"].includes(node.type) && attrs.language !== undefined && (typeof attrs.language !== "string" || attrs.language.length > 100)) throw new Error("Invalid code language.");
    if (node.type === "image") {
      if (typeof attrs.src !== "string") throw new Error("Invalid image.");
      if (/^attachment:[a-z0-9]{15}$/.test(attrs.src)) images.push(attrs.src.slice(11));
      else if (!/^https?:\/\//i.test(attrs.src) || !safeLink(attrs.src)) throw new Error("Finish or remove the pending/invalid image before saving.");
      for (const key of ["width", "height"]) if (attrs[key] != null && (typeof attrs[key] !== "number" || !Number.isFinite(attrs[key]) || attrs[key] < 0 || attrs[key] > 20000)) throw new Error("Invalid image dimensions.");
      substantive = true;
    }
    if (node.type === "list") {
      if (attrs.kind !== undefined && !["bullet", "ordered", "task", "toggle"].includes(attrs.kind)) throw new Error("Invalid list.");
      if (attrs.order != null && (!Number.isInteger(attrs.order) || attrs.order < 0)) throw new Error("Invalid list order.");
      for (const key of ["checked", "collapsed"]) if (attrs[key] !== undefined && typeof attrs[key] !== "boolean") throw new Error("Invalid list state.");
    }
    if (["tableCell", "tableHeaderCell"].includes(node.type)) {
      for (const key of ["colspan", "rowspan"]) if (attrs[key] !== undefined && (!Number.isInteger(attrs[key]) || attrs[key] < 1 || attrs[key] > 100)) throw new Error("Invalid table span.");
      if (attrs.colwidth != null && (!Array.isArray(attrs.colwidth) || attrs.colwidth.length > 100 || attrs.colwidth.some((n) => !Number.isFinite(n) || n < 0 || n > 20000))) throw new Error("Invalid column width.");
    }
    if (node.type === "mention") {
      for (const key of ["id", "value"]) if (typeof attrs[key] !== "string" || attrs[key].length > 255) throw new Error("Invalid mention.");
      if (attrs.kind !== undefined && typeof attrs.kind !== "string") throw new Error("Invalid mention kind.");
      text += attrs.value;
    }
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks) || node.marks.length > 8) throw new Error("Invalid formatting.");
      for (const mark of node.marks) {
        if (!mark || !["bold", "italic", "underline", "strike", "code", "link"].includes(mark.type) || Object.keys(mark).some((key) => !["type", "attrs"].includes(key))) throw new Error("Unsupported formatting.");
        if (mark.type === "link") {
          if (!mark.attrs || !safeLink(mark.attrs.href) || Object.keys(mark.attrs).some((key) => !["href", "target", "rel"].includes(key))) throw new Error("Unsafe link.");
          if (mark.attrs.target != null && !["_blank", "_self"].includes(mark.attrs.target)) throw new Error("Invalid link target.");
          if (mark.attrs.rel != null && typeof mark.attrs.rel !== "string") throw new Error("Invalid link relation.");
        } else if (mark.attrs && Object.keys(mark.attrs).length) throw new Error("Unsupported mark attributes.");
      }
    }
    if (node.type === "text") {
      if (typeof node.text !== "string" || !node.text.length || node.content) throw new Error("Invalid text.");
      text += node.text;
    } else {
      if (node.text !== undefined) throw new Error("Invalid document structure.");
      if (["hardBreak", "horizontalRule", "image", "mention"].includes(node.type)) {
        if (node.content !== undefined) throw new Error("Invalid leaf content.");
      } else {
        if (node.content !== undefined && !Array.isArray(node.content)) throw new Error("Invalid content.");
        if (["doc", "blockquote", "list", "table", "tableCell", "tableHeaderCell"].includes(node.type) && !node.content?.length) throw new Error("Empty document structure.");
        for (const child of node.content || []) visit(child, node.type, depth + 1);
      }
    }
  }
  visit(doc, null, 0);
  if (!text.trim() && !substantive && !hasAttachments) throw new Error("Write something or attach a file before saving.");
  if (JSON.stringify(doc).length > 102400) throw new Error("Entry is too long.");
  return images;
}
function date(kind, value) {
  if (kind === "note") {
    if (value !== "") throw new Error("Notes cannot have a journal date.");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Choose a valid journal date.");
}
module.exports = { body, date };
