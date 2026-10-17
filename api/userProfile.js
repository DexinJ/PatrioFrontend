// api/userProfile.js
// The single POST /api/users call site. The backend refuses to create the
// profile row without the terms flag, so both sign-up and the acceptance gate
// go through here.
import i18next from "i18next";

import { API_BASE_URL } from "./backendConfig";
import { fetchWithTimeout } from "./fetchWithTimeout";

const PROFILE_REQUEST_TIMEOUT_MS = 15000;

export function accountSetupCancelledError() {
  const error = new Error("Account setup was cancelled.");
  error.code = "ACCOUNT_SETUP_CANCELLED";
  return error;
}

export function makeFallbackUsername(user, typedUsername = "") {
  return (
    typedUsername.trim() ||
    user?.displayName?.replace(/\s+/g, "").slice(0, 20) ||
    user?.email?.split("@")[0].slice(0, 20) ||
    "user"
  );
}

export async function saveUserProfileToBackend({
  idToken,
  username,
  termsAccepted,
  signal,
}) {
  let resp;

  try {
    resp = await fetchWithTimeout(
      `${API_BASE_URL}/api/users`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          username,
          termsAccepted: termsAccepted === true,
        }),
        signal,
      },
      {
        timeoutMs: PROFILE_REQUEST_TIMEOUT_MS,
        timeoutMessage: i18next.t("errors.accountSetupTimedOut"),
      }
    );
  } catch (error) {
    if (error?.name === "AbortError" && signal?.aborted) {
      throw accountSetupCancelledError();
    }
    throw error;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const error = new Error(
      i18next.t("errors.backendSaveFailed", {
        status: resp.status,
        message: text.slice(0, 200),
      })
    );
    error.status = resp.status;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.code) error.code = parsed.code;
    } catch {
      // Non-JSON error bodies keep the generic message.
    }
    throw error;
  }

  return resp.json().catch(() => ({}));
}
