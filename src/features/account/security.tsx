import { IconLoader2 } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { ClientResponseError } from "pocketbase";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, FormField, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { pb } from "@/services/pocketbase";
import type { UsersResponse } from "@/services/pocketbase-types";
import { formHandler } from "@/utils/form";

/** Turn two-step sign-in on or off; both directions need the current password. */
export const AccountSecurity = () => {
  const [user, setUser] = useState(pb.authStore.record as UsersResponse | null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = pb.authStore.record?.id;
    // The stored record can be stale (e.g. verified since sign-in).
    if (id)
      pb.collection("users")
        .getOne(id)
        .then(setUser)
        .catch(() => {
          /* keep the stored record */
        });
  }, []);

  if (!user) return null;
  const enabled = user.mfaEnabled;
  const blocked = !enabled && !user.verified;

  const toggle = async () => {
    if (!password) return setError("Enter your current password.");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setUser(
        await pb.collection("users").update(user.id, {
          mfaEnabled: !enabled,
          currentPassword: password,
        }),
      );
      setPassword("");
      setNotice(
        enabled
          ? "Two-step sign-in is off. Your password alone signs you in."
          : "Two-step sign-in is on. Next time you sign in, we will email you a code.",
      );
    } catch (err) {
      setError(
        err instanceof ClientResponseError && err.status === 400
          ? err.message
          : "Could not save the change. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const sendVerification = async () => {
    setError("");
    try {
      await pb.collection("users").requestVerification(user.email);
      setNotice(
        `We sent a verification link to ${user.email}. Open it, then come back here.`,
      );
    } catch {
      setError("Could not send the verification email. Please try again.");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <Link to="/" className="text-sm underline">
        Back to notes
      </Link>
      <h1 className="font-semibold text-xl">Account security</h1>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-medium">Two-step sign-in</h2>
        <p className="text-sm" data-testid="mfa-status">
          Status: <strong>{enabled ? "On" : "Off"}</strong>
        </p>
        <p className="text-muted-foreground text-sm">
          When it is on, signing in takes your password and then a one-time code
          we email to <strong>{user.email}</strong>. You will need access to
          that inbox every time you sign in.
        </p>

        {blocked ? (
          <>
            <p className="text-sm">
              Verify your email address before turning this on. Otherwise a typo
              or an old address could lock you out of your account.
            </p>
            <Button type="button" variant="outline" onClick={sendVerification}>
              Send verification email
            </Button>
          </>
        ) : (
          <form onSubmit={formHandler(toggle)} className="flex flex-col gap-3">
            <FormField>
              <FormLabel error={!!error} htmlFor="current-password">
                Current password
              </FormLabel>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <Button type="submit" className="space-x-2" disabled={busy}>
              {busy && <IconLoader2 className="size-4 animate-spin" />}
              <span>
                {enabled
                  ? "Turn off two-step sign-in"
                  : "Turn on two-step sign-in"}
              </span>
            </Button>
          </form>
        )}
        <FormError role="alert">{error}</FormError>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </section>
    </div>
  );
};
