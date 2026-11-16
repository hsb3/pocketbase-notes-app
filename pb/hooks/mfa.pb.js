// Opt-in two-step sign-in. The users collection's MFA rule (`mfaEnabled = true`)
// asks for an emailed code after the password; these hooks guard the flag itself.

// Turning the flag on or off needs the current password (body field
// `currentPassword`), and turning it on needs a verified email so a user cannot
// lock themselves out. Superusers skip both: that is the recovery path.
onRecordUpdateRequest((e) => {
  const original = e.record.original();
  const enabled = e.record.getBool("mfaEnabled");
  const changed = enabled !== original.getBool("mfaEnabled");
  if (changed && !e.hasSuperuserAuth()) {
    const password = e.requestInfo().body.currentPassword;
    if (typeof password !== "string" || !original.validatePassword(password)) {
      throw new BadRequestError("Your current password is incorrect.", {
        currentPassword: new ValidationError(
          "validation_invalid_password",
          "Your current password is incorrect.",
        ),
      });
    }
    if (enabled && !original.verified()) {
      throw new BadRequestError(
        "Verify your email address before turning on two-step sign-in.",
      );
    }
  }
  // Sessions from before opting in never passed the second step: end them.
  if (changed && enabled) e.record.refreshTokenKey();
  // Codes and pending second steps from while it was on would otherwise sign in alone.
  if (changed && !enabled) {
    $app.deleteAllOTPsByRecord(original);
    $app.deleteAllMFAsByRecord(original);
  }
  e.next();
}, "users");

// Sign-up never starts with it on: that would skip the verified-email check.
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("mfaEnabled", false);
  e.next();
}, "users");

// Codes are only a second step: an email goes out only with an unexpired mfaId
// from this account's password step. Everything else (opted out, unknown email,
// no or foreign mfaId) gets the same random decoy id and no email, so nobody can
// flood an inbox, burn the real code or tell opted-in accounts apart.
onRecordRequestOTPRequest((e) => {
  const mfaId = e.requestInfo().body.mfaId;
  let passed = false;
  if (e.record?.getBool("mfaEnabled") && typeof mfaId === "string" && mfaId) {
    try {
      const mfa = $app.findMFAById(mfaId);
      passed =
        mfa.recordRef() === e.record.id &&
        mfa.collectionRef() === e.collection.id &&
        !mfa.hasExpired(e.collection.mfa.durationTime());
    } catch {
      passed = false;
    }
  }
  if (!passed)
    return e.json(200, {
      otpId: $security.randomStringWithAlphabet(
        15,
        "abcdefghijklmnopqrstuvwxyz0123456789",
      ),
    });
  e.next();
}, "users");
