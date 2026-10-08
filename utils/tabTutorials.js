// Per-tab, one-time coach-mark tutorials.
//
// Every tab owns a short step list. A step may point at a registered on-screen
// target (see components/TutorialTarget.js) so the overlay can spotlight the
// real control; steps without a target render as a centered card. Each tab is
// seen once per TUTORIAL_VERSION and stays dismissed until either the version
// is bumped or the user replays it from Settings -> Preferences.

export const TAB_TUTORIAL_VERSION = 1;

// How long to wait after a tab becomes active before showing its overlay, so
// the screen has mounted and registered its targets.
export const TAB_TUTORIAL_START_DELAY_MS = 600;

export const TAB_TUTORIAL_KEYS = Object.freeze([
  "home",
  "chat",
  "fridge",
  "list",
  "settings",
]);

export const TAB_TUTORIALS = Object.freeze({
  home: Object.freeze([
    {
      id: "greeting",
      targetId: "home.greeting",
      titleKey: "tutorial.tabs.home.greeting.title",
      bodyKey: "tutorial.tabs.home.greeting.body",
    },
    {
      id: "cards",
      targetId: "home.cards",
      titleKey: "tutorial.tabs.home.cards.title",
      bodyKey: "tutorial.tabs.home.cards.body",
    },
    {
      id: "quickActions",
      targetId: "home.quickActions",
      titleKey: "tutorial.tabs.home.quickActions.title",
      bodyKey: "tutorial.tabs.home.quickActions.body",
    },
    {
      id: "replay",
      targetId: null,
      titleKey: "tutorial.tabs.home.replay.title",
      bodyKey: "tutorial.tabs.home.replay.body",
    },
  ]),
  chat: Object.freeze([
    {
      id: "header",
      targetId: "chat.header",
      titleKey: "tutorial.tabs.chat.header.title",
      bodyKey: "tutorial.tabs.chat.header.body",
    },
    {
      id: "messages",
      targetId: "chat.messages",
      titleKey: "tutorial.tabs.chat.messages.title",
      bodyKey: "tutorial.tabs.chat.messages.body",
    },
    {
      id: "attach",
      targetId: "chat.attach",
      titleKey: "tutorial.tabs.chat.attach.title",
      bodyKey: "tutorial.tabs.chat.attach.body",
    },
    {
      id: "composer",
      targetId: "chat.composer",
      titleKey: "tutorial.tabs.chat.composer.title",
      bodyKey: "tutorial.tabs.chat.composer.body",
    },
  ]),
  fridge: Object.freeze([
    {
      id: "searchBar",
      targetId: "fridge.searchBar",
      titleKey: "tutorial.tabs.fridge.searchBar.title",
      bodyKey: "tutorial.tabs.fridge.searchBar.body",
    },
    {
      id: "filterTabs",
      targetId: "fridge.filterTabs",
      titleKey: "tutorial.tabs.fridge.filterTabs.title",
      bodyKey: "tutorial.tabs.fridge.filterTabs.body",
    },
    {
      id: "items",
      targetId: "fridge.items",
      titleKey: "tutorial.tabs.fridge.items.title",
      bodyKey: "tutorial.tabs.fridge.items.body",
    },
    {
      id: "addButton",
      targetId: "fridge.addButton",
      titleKey: "tutorial.tabs.fridge.addButton.title",
      bodyKey: "tutorial.tabs.fridge.addButton.body",
    },
    {
      id: "editButton",
      targetId: "fridge.editButton",
      titleKey: "tutorial.tabs.fridge.editButton.title",
      bodyKey: "tutorial.tabs.fridge.editButton.body",
    },
  ]),
  list: Object.freeze([
    {
      id: "searchBar",
      targetId: "list.searchBar",
      titleKey: "tutorial.tabs.list.searchBar.title",
      bodyKey: "tutorial.tabs.list.searchBar.body",
    },
    {
      id: "filterTabs",
      targetId: "list.filterTabs",
      titleKey: "tutorial.tabs.list.filterTabs.title",
      bodyKey: "tutorial.tabs.list.filterTabs.body",
    },
    {
      id: "items",
      targetId: "list.items",
      titleKey: "tutorial.tabs.list.items.title",
      bodyKey: "tutorial.tabs.list.items.body",
    },
    {
      id: "inputRow",
      targetId: "list.inputRow",
      titleKey: "tutorial.tabs.list.inputRow.title",
      bodyKey: "tutorial.tabs.list.inputRow.body",
    },
    {
      id: "editButton",
      targetId: "list.editButton",
      titleKey: "tutorial.tabs.list.editButton.title",
      bodyKey: "tutorial.tabs.list.editButton.body",
    },
  ]),
  settings: Object.freeze([
    {
      id: "categories",
      targetId: "settings.categories",
      titleKey: "tutorial.tabs.settings.categories.title",
      bodyKey: "tutorial.tabs.settings.categories.body",
    },
    {
      id: "replay",
      targetId: null,
      titleKey: "tutorial.tabs.settings.replay.title",
      bodyKey: "tutorial.tabs.settings.replay.body",
    },
  ]),
});

const PATH_TO_TAB_KEY = Object.freeze({
  "/": "home",
  "/index": "home",
  "/chat": "chat",
  "/fridge": "fridge",
  "/list": "list",
  "/settings": "settings",
});

export function getTabTutorial(tabKey) {
  const steps = TAB_TUTORIALS[String(tabKey || "")];
  return Array.isArray(steps) && steps.length > 0 ? steps : null;
}

// Expo Router reports the index route as "/" (the "(tabs)" group never appears
// in the URL), but this stays tolerant of a leading group segment or a query
// string so a future route rename cannot silently disable the tour.
export function getTabKeyForPathname(pathname) {
  if (typeof pathname !== "string" || !pathname) return null;

  let value = pathname.split("?")[0].split("#")[0];
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/^\/\([^/]+\)/, "");
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  if (!value) value = "/";

  return PATH_TO_TAB_KEY[value.toLowerCase()] || null;
}

// Stored shape: { home: 1, fridge: 1 }. Anything unreadable is dropped so a
// corrupt value can only cause a tab to be taught again, never crash.
export function normalizeSeenTabs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const normalized = {};
  for (const tabKey of TAB_TUTORIAL_KEYS) {
    const version = value[tabKey];
    if (Number.isFinite(version) && version > 0) {
      normalized[tabKey] = Math.floor(version);
    }
  }
  return normalized;
}

// Unknown tabs report the current version so they are always treated as
// "nothing left to teach".
export function getSeenTabVersion(seenTabs, tabKey) {
  if (!getTabTutorial(tabKey)) return TAB_TUTORIAL_VERSION;
  return normalizeSeenTabs(seenTabs)[tabKey] || 0;
}

export function isTabTutorialSeen(
  seenTabs,
  tabKey,
  version = TAB_TUTORIAL_VERSION
) {
  return getSeenTabVersion(seenTabs, tabKey) >= version;
}

export function hasSeenTabTutorial(
  settings,
  tabKey,
  version = TAB_TUTORIAL_VERSION
) {
  return isTabTutorialSeen(settings?.tutorial?.seenTabs, tabKey, version);
}

export function markTabTutorialSeen(
  seenTabs,
  tabKey,
  version = TAB_TUTORIAL_VERSION
) {
  const normalized = normalizeSeenTabs(seenTabs);
  if (!getTabTutorial(tabKey)) return normalized;
  return { ...normalized, [tabKey]: version };
}

export function clearTabTutorialSeen(seenTabs, tabKey) {
  const normalized = normalizeSeenTabs(seenTabs);
  if (!normalized[tabKey]) return normalized;
  const next = { ...normalized };
  delete next[tabKey];
  return next;
}
