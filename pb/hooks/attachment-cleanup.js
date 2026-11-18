const sources = ["entries", "notes"];

exports.isReferenced = (app, id) => sources.some((collection) =>
  app.findRecordsByFilter(collection, "attachments.id ?= {:id}", "", 1, 0, { id }).length > 0
);

const exclusions = sources.map((collection) => `NOT EXISTS (
  SELECT 1 FROM ${collection} r,
    json_each(CASE WHEN json_valid(r.attachments) THEN r.attachments ELSE '[]' END) a
  WHERE a.value = f.id
)`);
exports.candidates = `SELECT f.id FROM attachments f
  WHERE f.created < {:cutoff} AND ${exclusions.join(" AND ")}
  LIMIT 100`;
