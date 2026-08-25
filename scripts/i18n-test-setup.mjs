// i18n-test-setup.mjs
// ESM preload: initializes the same i18next instance that app modules import,
// so Node unit tests exercising user-facing strings see real English values.
// Loaded with node --import before the test files run.
import { createRequire } from "node:module";
import i18next from "i18next";

const require = createRequire(import.meta.url);
const en = require("../locales/en.json");

i18next.init({
  resources: {
    en: { translation: en },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  initImmediate: false,
});
