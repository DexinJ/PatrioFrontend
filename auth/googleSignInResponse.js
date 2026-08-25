import i18next from "i18next";

function normalizedToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  return token || null;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Extract an ID token from the discriminated response returned by Google
 * Sign-In v16. Cached tokens are consulted only after a successful interactive
 * sign-in, never after cancellation or an unknown response.
 */
export async function extractGoogleIdTokenFromSignInResponse(
  response,
  {
    getTokens,
    cancelledCode = "GOOGLE_SIGN_IN_CANCELLED",
    cancelledMessage = i18next.t("errors.googleSignInCancelled"),
    missingTokenMessage = i18next.t("errors.googleNoIdentityToken"),
  } = {}
) {
  if (response?.type === "cancelled") {
    throw codedError(cancelledMessage, cancelledCode);
  }

  const isV16Success = response?.type === "success";
  const isLegacyResponse = response?.type == null;
  if (!isV16Success && !isLegacyResponse) {
    throw codedError(
      i18next.t("errors.googleUnsupportedResponse"),
      "GOOGLE_SIGN_IN_INVALID_RESPONSE"
    );
  }

  let idToken = normalizedToken(
    isV16Success ? response?.data?.idToken : response?.idToken
  );

  // getTokens() reports the currently cached native account. It is safe only
  // once this invocation has positively completed an interactive sign-in.
  if (!idToken && isV16Success && typeof getTokens === "function") {
    const tokens = await getTokens();
    idToken = normalizedToken(tokens?.idToken);
  }

  if (!idToken) {
    throw codedError(missingTokenMessage, "GOOGLE_ID_TOKEN_MISSING");
  }

  return idToken;
}
