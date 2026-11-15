// This controls a shortcut only; the dashboard still requires separate authentication.
routerAdd("GET", "/api/notes/capabilities", (e) => {
  const isAdmin = e.auth.getBool("verified") && e.app.findRecordsByFilter(
    "_superusers", "email = {:email}", "", 1, 0,
    { email: e.auth.getString("email") },
  ).length > 0;
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, { isAdmin });
}, $apis.requireAuth("users"));
