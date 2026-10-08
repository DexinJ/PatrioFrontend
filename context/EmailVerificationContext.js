// context/EmailVerificationContext.js
// Owns the soft verification gate. Nothing here can close the app: email is a
// recovery address only, so the worst case is an unverified user who keeps the
// access they already had.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { AppState } from "react-native";
import {
  clearEmailVerificationSnooze,
  getEmailVerificationSnoozeUntil,
  snoozeEmailVerificationPrompt,
  takeEmailVerificationPromptRequest,
} from "../api/emailVerificationStorage";
import { authErrorMessageKey } from "../auth/authErrorMessages";
import { changeAccountEmail } from "../auth/emailChange";
import { auth } from "../auth/firebaseClient";
import { useAuth } from "../auth/useAuth";
import {
  EMAIL_VERIFICATION_PROMPT_SNOOZE_MS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  emailChangeValidationError,
  isPasswordAccount,
  needsEmailVerification,
  shouldPromptEmailVerification,
} from "../utils/emailVerificationPolicy";

const EmailVerificationContext = createContext(null);

export function EmailVerificationProvider({ children }) {
  const { t } = useTranslation();
  const { queuePostAuthNotice, user } = useAuth();
  const userId = user?.uid || null;

  const [promptVisible, setPromptVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [verificationConfirmed, setVerificationConfirmed] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(0);

  const noticeShownRef = useRef(false);
  const activeUidRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const describeError = useCallback(
    (nextError) => {
      const key = authErrorMessageKey(nextError);
      return key ? t(key) : nextError?.message || t("common.unknownError");
    },
    [t]
  );

  // Reset per-account state on an account switch, not only on sign-out. A fast
  // sign-out/sign-in must not inherit the previous account's confirmation.
  useEffect(() => {
    if (activeUidRef.current === userId) return;
    activeUidRef.current = userId;
    noticeShownRef.current = false;
    setVerificationConfirmed(false);
    setPromptVisible(false);
    setBusy(false);
    setError("");
    setPasswordRequired(false);
    setLastSentAt(0);
  }, [userId]);

  const confirmVerified = useCallback(async () => {
    if (!userId || noticeShownRef.current) return;
    noticeShownRef.current = true;
    setVerificationConfirmed(true);
    setPromptVisible(false);
    await clearEmailVerificationSnooze(userId).catch(() => {});
    queuePostAuthNotice({
      title: t("auth.emailVerifiedTitle"),
      message: t("auth.emailVerifiedMessage"),
      audienceUid: userId,
    });
  }, [queuePostAuthNotice, t, userId]);

  // reload() is the only way to observe a link opened in a browser: neither
  // onAuthStateChanged nor the cached user object updates on its own.
  const refreshVerification = useCallback(async () => {
    if (!user || !needsEmailVerification(user)) return false;
    try {
      await user.reload();
    } catch {
      return false;
    }
    if (auth.currentUser?.emailVerified === true) {
      await confirmVerified();
      return true;
    }
    return false;
  }, [confirmVerified, user]);

  useEffect(() => {
    if (!userId || !user || !needsEmailVerification(user)) return undefined;

    let cancelled = false;
    void (async () => {
      // The request flag is consumed only after the snooze check and after the
      // last await, so a cancelled or re-invoked effect can never take a
      // request it does not go on to honour. A storage failure reads as "no
      // snooze" - failing open is the helpful direction here.
      const snoozedUntilMs = await getEmailVerificationSnoozeUntil(userId).catch(
        () => null
      );
      if (cancelled) return;
      if (!shouldPromptEmailVerification({ user, snoozedUntilMs })) return;
      if (!takeEmailVerificationPromptRequest(userId)) return;
      setPromptVisible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, user]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshVerification();
    });
    return () => subscription.remove();
  }, [refreshVerification]);

  const sendVerification = useCallback(async () => {
    if (!user || busy) return false;

    const elapsed = Date.now() - lastSentAt;
    if (lastSentAt && elapsed < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS) {
      setError(
        t("auth.verifyEmailResendIn", {
          seconds: Math.ceil(
            (EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - elapsed) / 1000
          ),
        })
      );
      return false;
    }

    setBusy(true);
    setError("");
    try {
      await user.sendEmailVerification();
      setLastSentAt(Date.now());
      return true;
    } catch (nextError) {
      if (mountedRef.current) setError(describeError(nextError));
      return false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy, describeError, lastSentAt, t, user]);

  // Does not close the prompt: the modal shows its own "link sent to X" state,
  // because the address does not actually change until the link is opened.
  const submitEmailChange = useCallback(
    async ({ newEmail, password }) => {
      if (!user || busy) return false;

      const validation = emailChangeValidationError(newEmail, user.email);
      if (validation === "EMPTY") {
        setError(t("auth.changeEmailMissingEmail"));
        return false;
      }
      if (validation === "INVALID") {
        setError(t("auth.errorInvalidEmail"));
        return false;
      }
      if (validation === "UNCHANGED") {
        setError(t("auth.changeEmailSameEmail"));
        return false;
      }

      setBusy(true);
      setError("");
      try {
        await changeAccountEmail(user, { newEmail, password });
        setPasswordRequired(false);
        return true;
      } catch (nextError) {
        if (mountedRef.current) {
          // Latch upward only. A wrong password returns auth/invalid-credential,
          // and clearing the flag there would hide the field the user is
          // actively correcting.
          if (nextError?.code === "PASSWORD_REAUTHENTICATION_REQUIRED") {
            setPasswordRequired(true);
          }
          setError(describeError(nextError));
        }
        return false;
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [busy, describeError, t, user]
  );

  const dismissPrompt = useCallback(async () => {
    setPromptVisible(false);
    setError("");
    setPasswordRequired(false);
    if (!userId) return;
    await snoozeEmailVerificationPrompt(
      userId,
      Date.now() + EMAIL_VERIFICATION_PROMPT_SNOOZE_MS
    ).catch(() => {});
  }, [userId]);

  const value = useMemo(
    () => ({
      email: String(user?.email || ""),
      needsVerification: !verificationConfirmed && needsEmailVerification(user),
      // The status row only means something for password accounts. Provider
      // accounts can report emailVerified false (Apple private relay), and
      // claiming "Verified" there would be wrong.
      showEmailStatus: isPasswordAccount(user),
      promptVisible,
      busy,
      error,
      passwordRequired,
      lastSentAt,
      openPrompt: () => {
        setError("");
        setPromptVisible(true);
        void refreshVerification();
      },
      closePrompt: () => {
        setPromptVisible(false);
        setError("");
        setPasswordRequired(false);
      },
      // Switching modes inside the modal must not inherit the other mode's
      // error, or a failed email change reappears as a validation message on
      // the resend screen.
      clearError: () => setError(""),
      dismissPrompt,
      refreshVerification,
      sendVerification,
      submitEmailChange,
    }),
    [
      busy,
      dismissPrompt,
      error,
      lastSentAt,
      passwordRequired,
      promptVisible,
      refreshVerification,
      sendVerification,
      submitEmailChange,
      user,
      verificationConfirmed,
    ]
  );

  return (
    <EmailVerificationContext.Provider value={value}>
      {children}
    </EmailVerificationContext.Provider>
  );
}

export function useEmailVerification() {
  const context = useContext(EmailVerificationContext);
  if (!context) {
    throw new Error(
      "useEmailVerification must be used within an EmailVerificationProvider."
    );
  }
  return context;
}
