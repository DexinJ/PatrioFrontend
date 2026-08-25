// i18n/index.js
// Central i18next setup for Pantrio.
//
// Language resolution order:
//   1. A language the user explicitly picked (AsyncStorage override)
//   2. The device locale (expo-localization)
//   3. English (fallback)
//
// Only English is shipped for now. Add new languages by dropping a
// locales/<code>.json file, importing it below, and adding it to
// SUPPORTED_LANGUAGES + supportedLngs.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
// eslint-disable-next-line import/no-unresolved
import en from "../locales/en.json";
// eslint-disable-next-line import/no-unresolved
import zh from "../locales/zh.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh", label: "简体中文" },
];

export const LANGUAGE_STORAGE_KEY = "pantrio.appLanguage";

export function getDeviceLanguageCode() {
  const locales = getLocales();
  const code = locales?.[0]?.languageCode;
  return typeof code === "string" && code.length ? code : "en";
}

export async function getSavedLanguageCode() {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    return typeof saved === "string" && saved.length ? saved : null;
  } catch {
    return null;
  }
}

export async function setAppLanguage(code) {
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // Persistence is best-effort; the in-memory language still applies.
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: "en",
  fallbackLng: "en",
  supportedLngs: ["en", "zh"],
  interpolation: {
    // React Native components render text directly; no HTML escaping needed.
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  initImmediate: false,
});

export default i18n;
