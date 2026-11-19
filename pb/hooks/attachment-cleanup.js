exports.isReferenced = (app, id) =>
  app.findRecordsByFilter("notes", "attachments.id ?= {:id}", "", 1, 0, { id }).length > 0;

exports.candidates = `SELECT f.id FROM attachments f
  WHERE f.created < {:cutoff} AND NOT EXISTS (
    SELECT 1 FROM notes n,
      json_each(CASE WHEN json_valid(n.attachments) THEN n.attachments ELSE '[]' END) a
    WHERE a.value = f.id
  ) LIMIT 100`;
