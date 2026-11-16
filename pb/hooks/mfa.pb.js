// Opt-in two-step sign-in. The users collection's MFA rule (`mfaEnabled = true`)
// asks for an emailed code after the password; these hooks guard the flag itself.

// Turning the flag on or off needs the current password (body field
// `currentPassword`), and turning it on needs a verified email so a user cannot
// lock themselves out. Superusers skip both: that is the recovery path.
onRecordUpdateRequest((e) => {
  const original = e.record.original();
  const enabled = e.record.getBool("mfaEnabled");
  if (enabled !== original.getBool("mfaEnabled") && !e.hasSuperuserAuth()) {
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
  e.next();
}, "users");

// Codes are only a second step: accounts without two-step sign-in get no email,
// and the same kind of decoy id PocketBase returns for unknown addresses.
onRecordRequestOTPRequest((e) => {
  if (e.record && !e.record.getBool("mfaEnabled")) {
    return e.json(200, {
      otpId: $security.randomStringWithAlphabet(
        15,
        "abcdefghijklmnopqrstuvwxyz0123456789",
      ),
    });
  }
  e.next();
}, "users");
