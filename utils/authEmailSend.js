// utils/authEmailSend.js
// One place that turns a refused auth email send into something the app can
// show and something the team can find later. Callers used to hand-roll this:
// sign-up discarded the error, the resend path printed an unattributed string,
// and password reset reported a failure as a success.
//
// This module deliberately imports nothing from React Native so it stays
// loadable under `node scripts/run-unit-tests.cjs`.

import {
  AUTH_EMAIL_SEND_FAILED_KEY,
  authErrorMessageKey,
} from "../auth/authErrorMessages.js";

// Reporting is injected rather than imported: app/_layout.js installs the
// Sentry-backed reporter once, and tests keep the no-op default. Importing
// @sentry/react-native here would make this module unloadable outside the app.
let reportFailure = () => {};

export function setAuthEmailSendReporter(next) {
  reportFailure = typeof next === "function" ? next : () => {};
}

// For callers that already own their error copy and only need the durable
// record - the email-change form latches a password prompt on a custom code, so
// it cannot hand its error to attemptAuthEmailSend without losing that copy.
export function reportAuthEmailSendFailure(error, context = {}) {
  try {
    reportFailure(error, {
      scope: String(context.scope || "").trim(),
      code: String(error?.code || "").trim() || null,
    });
  } catch {}
}

export async function attemptAuthEmailSend({ scope, send, report } = {}) {
  try {
    await send();
    return { ok: true, code: null, messageKey: null };
  } catch (error) {
    const code = String(error?.code || "").trim() || null;
    // A reporter that throws must never turn a handled rejection into an
    // unhandled one, and must never stop the caller from showing its message.
    if (report) {
      try {
        report(error, { scope: String(scope || "").trim(), code });
      } catch {}
    } else {
      reportAuthEmailSendFailure(error, { scope });
    }
    return {
      ok: false,
      code,
      messageKey: authErrorMessageKey(error) || AUTH_EMAIL_SEND_FAILED_KEY,
    };
  }
}
