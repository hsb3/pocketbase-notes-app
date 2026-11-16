import { IconLoader2 } from "@tabler/icons-react";
import { ClientResponseError } from "pocketbase";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, FormField, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useCountDown } from "@/hooks/use-countdown";
import { pb } from "@/services/pocketbase";
import { formHandler } from "@/utils/form";

/** The mfaId PocketBase returns (status 401) when a first sign-in step needs a second. */
export const pendingMfaId = (error: unknown) =>
  error instanceof ClientResponseError &&
  error.status === 401 &&
  typeof error.response?.mfaId === "string"
    ? (error.response.mfaId as string)
    : undefined;

const RESEND_SECONDS = 30;

const codeError = (error: unknown) => {
  if (error instanceof ClientResponseError) {
    if (error.status === 429)
      return "Too many attempts. Wait a few minutes, then send a new code.";
    if (/MFA/.test(error.message))
      return "This sign-in has timed out. Go back and sign in again.";
  }
  return "That code is wrong or has expired. Check the newest email, or send a new code.";
};

/**
 * Second sign-in step: email a one-time code and exchange it, with the mfaId from
 * the first step. Without an email (OAuth first step) it asks for the address first.
 */
export const CodeStep = ({
  mfaId,
  email: knownEmail,
  onDone,
  onCancel,
}: {
  mfaId: string;
  email?: string;
  onDone: () => unknown;
  onCancel: () => void;
}) => {
  const [email, setEmail] = useState(knownEmail ?? "");
  const [otpId, setOtpId] = useState<string>();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const { seconds, start, reset } = useCountDown(RESEND_SECONDS, () => {
    setCanResend(true);
    reset();
  });

  const send = useCallback(
    async (address: string) => {
      setBusy(true);
      setError("");
      setCanResend(false);
      try {
        setOtpId(
          (
            await pb
              .collection("users")
              .requestOTP(address, { requestKey: null })
          ).otpId,
        );
        start();
      } catch {
        setError("Could not send a code. Please try again.");
        setCanResend(true);
      } finally {
        setBusy(false);
      }
    },
    [start],
  );

  // Send once per step, even when StrictMode runs effects twice.
  const sent = useRef(false);
  useEffect(() => {
    if (!knownEmail || sent.current) return;
    sent.current = true;
    send(knownEmail);
  }, [knownEmail, send]);

  const verify = async () => {
    if (!otpId) return send(email.trim());
    if (!code.trim()) return setError("Enter the code from the email.");
    setBusy(true);
    setError("");
    try {
      await pb.collection("users").authWithOTP(otpId, code.trim(), { mfaId });
      await onDone();
    } catch (err) {
      setError(codeError(err));
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={formHandler(verify)}
      className="m-auto flex flex-col gap-3 p-2"
      aria-labelledby="two-step-title"
    >
      <h1 id="two-step-title" className="font-semibold text-lg">
        Check your email
      </h1>
      {otpId ? (
        <>
          <p className="text-sm">
            Two-step sign-in is on for this account. We sent a one-time code to{" "}
            <strong>{email}</strong>. It works once and expires in 5 minutes.
          </p>
          <FormField>
            <FormLabel error={!!error} htmlFor="code">
              Sign-in code
            </FormLabel>
            <Input
              id="code"
              name="code"
              value={code}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={busy}
              onChange={(e) => setCode(e.target.value)}
            />
          </FormField>
        </>
      ) : (
        <>
          <p className="text-sm">
            Two-step sign-in is on for this account. Enter its email address and
            we will send you a one-time code.
          </p>
          <FormField>
            <FormLabel error={!!error} htmlFor="code-email">
              Email
            </FormLabel>
            <Input
              id="code-email"
              type="email"
              value={email}
              disabled={busy || !!knownEmail}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
        </>
      )}
      <FormError role="alert">{error}</FormError>

      <Button type="submit" className="space-x-2" disabled={busy}>
        {busy && <IconLoader2 className="size-4 animate-spin" />}
        <span>{otpId ? "Verify and sign in" : "Send code"}</span>
      </Button>

      {otpId && (
        <Button
          type="button"
          variant="outline"
          disabled={!canResend || busy}
          onClick={() => send(email.trim())}
        >
          {canResend ? "Send a new code" : `Send a new code in ${seconds}s`}
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={onCancel}>
        Back to login
      </Button>
    </form>
  );
};
