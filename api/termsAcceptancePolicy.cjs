// api/termsAcceptancePolicy.cjs
// Pure helpers for the registration terms gate, kept in CommonJS so the unit
// tests can require them directly and so non-UI modules can use them without
// pulling in the fetch layer. Same pattern as accountDeletionPolicy.cjs.

const TERMS_ACCEPTANCE_REQUIRED = "TERMS_ACCEPTANCE_REQUIRED";

function isTermsAcceptanceRequiredResponse(httpStatus, payload) {
  return (
    Number(httpStatus) === 403 &&
    String(payload?.code || "").trim() === TERMS_ACCEPTANCE_REQUIRED
  );
}

function isTermsAcceptanceRequiredError(error) {
  return String(error?.code || "").trim() === TERMS_ACCEPTANCE_REQUIRED;
}

function termsVersionFromPayload(payload) {
  const version = String(payload?.termsVersion || "").trim();
  return version || null;
}

module.exports = {
  TERMS_ACCEPTANCE_REQUIRED,
  isTermsAcceptanceRequiredResponse,
  isTermsAcceptanceRequiredError,
  termsVersionFromPayload,
};
