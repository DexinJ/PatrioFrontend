// api/termsAcceptance.js
// Records the agreement with POST /api/users, after which the caller re-runs the
// session bootstrap. The backend stamps the time and the version; this only
// reports that the user agreed.
import { API_BASE_URL } from "./backendConfig";
import { fetchWithTimeout } from "./fetchWithTimeout";

const {
  TERMS_ACCEPTANCE_REQUIRED,
  isTermsAcceptanceRequiredResponse,
  isTermsAcceptanceRequiredError,
  termsVersionFromPayload,
} = require("./termsAcceptancePolicy.cjs");

export {
  TERMS_ACCEPTANCE_REQUIRED,
  isTermsAcceptanceRequiredResponse,
  isTermsAcceptanceRequiredError,
  termsVersionFromPayload,
};

export async function acceptTerms({
  idToken,
  username,
  signal,
  timeoutMessage,
}) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/users`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ username, termsAccepted: true }),
      signal,
    },
    { timeoutMs: 15000, timeoutMessage }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload?.error || `Could not save your agreement (${response.status}).`
    );
    error.code = payload?.code || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}
