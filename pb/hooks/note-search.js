const fold = require(`${__hooks}/comparison-key.js`);

function sources(title, text) {
  const source = text.split(/[\r\n\u2028\u2029]/, 1)[0].trim()
    ? text : [title, text].filter(Boolean).join("\n");
  const full = fold(source);
  const heading = fold(title);
  return full.includes(heading) ? [[source, full]] : [[title, heading], [source, full]];
}

function key(title, text) {
  return sources(title, text).map(([, folded]) => folded).join("\n").split("\0").join("\n");
}

function validate(query) {
  const term = query.searchTerm;
  if (!term || term !== term.trim() || /[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(term) || Array.from(term).length > 160) {
    throw new BadRequestError("Enter a single-line search term of up to 160 characters.");
  }
  const folded = fold(term);
  const pattern = "%" + folded.replace(/[\\%_]/g, "\\$&") + "%";
  if (query.filter !== 'deleted = "" && search_key ~ ' + JSON.stringify(pattern) ||
      query.sort !== "-updated,-id" || query.perPage !== "20" ||
      query.fields !== "id,folder,title,updated,snippet" || query.expand ||
      (query.skipTotal && query.skipTotal !== "false")) {
    throw new BadRequestError("Invalid search page options.");
  }
  return folded;
}

// NFC can compose characters across intervening marks. Match decomposed characters
// in stable order, carrying the outermost original offsets of every contributor.
function nfc(tags) {
  const queues = new Map();
  const input = tags.map(([point]) => point).join("");
  for (const tag of tags) {
    for (const part of tag[0].normalize("NFD")) {
      if (!queues.has(part)) queues.set(part, { tags: [], next: 0 });
      queues.get(part).tags.push(tag);
    }
  }
  return Array.from(input.normalize("NFC"), (point) => {
    let first = Infinity, last = -1;
    for (const part of point.normalize("NFD")) {
      const queue = queues.get(part);
      const [, lo, hi] = queue.tags[queue.next++];
      first = Math.min(first, lo);
      last = Math.max(last, hi);
    }
    return [point, first, last];
  });
}

function exactSpan(points, offset, start, end) {
  const initial = points.map((p, i) => [p, offset + i, offset + i]);
  const upper = [];
  for (const [p, first, last] of nfc(initial)) {
    for (const expanded of p.toUpperCase()) upper.push([expanded, first, last]);
  }
  let first = Infinity, last = -1;
  for (const [, lo, hi] of nfc(upper).slice(start, end)) {
    first = Math.min(first, lo);
    last = Math.max(last, hi);
  }
  return [first, last + 1];
}

function refine(points, offset, start, end, folded) {
  if (points.length === 1) return [offset, offset + 1];
  const mid = Math.floor(points.length / 2);
  const left = points.slice(0, mid), right = points.slice(mid);
  const a = fold(left.join("")), b = fold(right.join(""));
  if (a + b !== folded) return exactSpan(points, offset, start, end);
  const split = Array.from(a).length;
  if (end <= split) return refine(left, offset, start, end, a);
  if (start >= split) return refine(right, offset + mid, start - split, end - split, b);
  return [refine(left, offset, start, split, a)[0], refine(right, offset + mid, 0, end - split, b)[1]];
}

function originalSpan(points, folded, start, end) {
  const groups = [];
  const jamo = /[\u1100-\u11ff\ua960-\ua97f\ud7b0-\ud7ff]/;
  for (let i = 0; i < points.length;) {
    const lo = i++;
    while (i < points.length && (/\p{M}/u.test(points[i]) || (jamo.test(points[i-1]) && jamo.test(points[i])))) i++;
    groups.push({ lo, hi: i, fold: fold(points.slice(lo, i).join("")) });
  }
  if (groups.map(g => g.fold).join("") !== folded) return refine(points, 0, start, end, folded);
  let offset = 0, first = Infinity, last = -1;
  for (const group of groups) {
    const next = offset + Array.from(group.fold).length;
    if (next > start && offset < end) {
      const [lo, hi] = offset > start && next < end ? [group.lo, group.hi] :
        refine(points.slice(group.lo, group.hi), group.lo,
          Math.max(0, start - offset), Math.min(next, end) - offset, group.fold);
      first = Math.min(first, lo);
      last = Math.max(last, hi);
    }
    if (next >= end) break;
    offset = next;
  }
  return [first, last];
}

function snippet(title, text, term) {
  for (const [source, folded] of sources(title, text)) {
    const index = folded.split("\0").join("\n").indexOf(term);
    if (index < 0) continue;
    const points = Array.from(source);
    const start = Array.from(folded.slice(0, index)).length;
    const end = start + Array.from(term).length;
    const [lo, hi] = /^[\x00-\x7f]*$/.test(source) ? [start, end] : originalSpan(points, folded, start, end);
    if (!(lo >= 0 && lo < hi && hi <= points.length)) break;
    const slice = (a, b) => points.slice(a, b).join("");
    return {
      before: (lo > 32 ? "…" : "") + slice(Math.max(0, lo - 32), lo),
      match: hi - lo > 160 ? slice(lo, lo + 79) + "…" + slice(hi - 80, hi) : slice(lo, hi),
      after: slice(hi, hi + 32) + (hi + 32 < points.length ? "…" : ""),
    };
  }
  throw new Error("The search result has no matching source text.");
}

module.exports = { key, validate, snippet };
