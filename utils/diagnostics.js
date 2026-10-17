// utils/diagnostics.js
//
// Owns the Sentry client and the user's choice about it.
//
// The setting lives at device scope rather than inside the per-account settings
// blob for two reasons: the decision has to be known before the account is
// resolved, and "share diagnostics" is a property of the install, not of one
// account. The default is on, which matches the behaviour that shipped before
// this switch existed.
//
// See Guideline 5.1.1(ii): collection needs consent and an accessible way to
// withdraw it.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";

export const DIAGNOSTICS_STORAGE_KEY = "@pantrio:diagnosticsEnabled:v1";

let initialized = false;

function diagnosticsOptions() {
  return {
    dsn: "https://9d707a565864181830d59147b126ac25@o4511787964432384.ingest.us.sentry.io/4511787964563456",
    environment:
      process.env.EXPO_PUBLIC_APP_ENV ||
      (__DEV__ ? "development" : "production"),
    sendDefaultPii: false,

    // Prevent independent transmission of application logs.
    enableLogs: false,

    // Do not record ordinary sessions.
    replaysSessionSampleRate: 0,

    // Keep replay useful for diagnosing production-only failures without
    // recording every error session.
    replaysOnErrorSampleRate: __DEV__ ? 0 : 0.1,

    integrations: [
      Sentry.mobileReplayIntegration({
        maskAllText: true,
        maskAllImages: true,
        maskAllVectors: true,
      }),
    ],
    beforeSend(event) {
      if (event.request?.headers) {
        const headers = { ...event.request.headers };
        delete headers.Authorization;
        delete headers.authorization;
        delete headers.Cookie;
        delete headers.cookie;
        event.request.headers = headers;
      }

      if (event.user) {
        event.user = event.user.id ? { id: event.user.id } : undefined;
      }

      return event;
    },
  };
}

// Idempotent: the mount effect, the settings switch, and a future re-enable can
// all call it without stacking clients.
export function initDiagnostics() {
  if (initialized) return;
  initialized = true;
  Sentry.init(diagnosticsOptions());
}

function closeDiagnostics() {
  initialized = false;
  // Drops the client, so no further events are built or sent. Failures here are
  // not worth surfacing: the worst case is that the next launch retries.
  Promise.resolve(Sentry.close()).catch(() => {});
}

export async function isDiagnosticsEnabled() {
  try {
    const stored = await AsyncStorage.getItem(DIAGNOSTICS_STORAGE_KEY);
    if (stored === null) return true;
    return stored !== "false";
  } catch {
    // An unreadable preference is treated as the default rather than as a
    // silent opt-out.
    return true;
  }
}

// Called once per launch, before any event can be sent.
export async function initDiagnosticsIfEnabled() {
  if (await isDiagnosticsEnabled()) {
    initDiagnostics();
  }
}

export async function setDiagnosticsEnabled(enabled) {
  // Persist first and let a failure throw: the caller reverts the switch and
  // tells the user, rather than showing a preference that will silently
  // evaporate on the next launch.
  await AsyncStorage.setItem(
    DIAGNOSTICS_STORAGE_KEY,
    enabled ? "true" : "false"
  );

  if (enabled) {
    initDiagnostics();
  } else {
    closeDiagnostics();
  }
}
