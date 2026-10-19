// A build/runtime flag controls public signup; only the exact value true opts in.
onRecordCreateRequest((e) => {
  if ($os.getenv("VITE_SIGNUP_ENABLED") !== "true" && !e.hasSuperuserAuth()) {
    throw new ForbiddenError("Account creation is disabled.");
  }
  e.next();
}, "users");

onRecordAuthWithOAuth2Request((e) => {
  if ($os.getenv("VITE_SIGNUP_ENABLED") !== "true" && !e.record) {
    throw new ForbiddenError("Account creation is disabled.");
  }
  e.next();
}, "users");
