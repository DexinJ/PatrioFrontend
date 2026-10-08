import {
  createBackendResponseError,
  parseBackendResponseText,
} from "./backendErrors";
import i18next from "i18next";
import { API_BASE_URL } from "./backendConfig";
import { fetchWithTimeout } from "./fetchWithTimeout";

const DELETE_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 10_000;

async function readResponse(response) {
  const responseText = await response.text().catch(() => "");
  return parseBackendResponseText(responseText) || {};
}

async function authenticatedDeletionRequest(
  path,
  { bearerToken, method = "GET", timeoutMs = STATUS_TIMEOUT_MS } = {}
) {
  const token = String(bearerToken || "").trim();
  if (!token) {
    const error = new Error(i18next.t("errors.authenticatedUserRequired"));
    error.code = "AUTH_REQUIRED";
    throw error;
  }

  const response = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers: { Authorization: `Bearer ${token}` },
    },
    {
      timeoutMs,
      timeoutMessage:
        method === "DELETE"
          ? i18next.t("errors.deletionRequestTimedOut")
          : i18next.t("errors.deletionStatusTimedOut"),
    }
  );
  const payload = await readResponse(response);
  return { httpStatus: response.status, payload };
}

export function requestBackendAccountDeletion(uid, bearerToken) {
  return authenticatedDeletionRequest(
    `/api/users/${encodeURIComponent(uid)}`,
    {
      bearerToken,
      method: "DELETE",
      timeoutMs: DELETE_TIMEOUT_MS,
    }
  );
}

export function getBackendAccountDeletionStatus(uid, bearerToken) {
  return authenticatedDeletionRequest(
    `/api/users/${encodeURIComponent(uid)}/deletion-status`,
    { bearerToken }
  );
}

export function accountDeletionResponseError(
  { httpStatus, payload },
  fallbackMessage = i18next.t("root.couldNotDeleteAccount")
) {
  return createBackendResponseError(payload, {
    status: httpStatus,
    fallbackMessage,
  });
}
