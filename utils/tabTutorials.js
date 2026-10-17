// Per-tab, one-time coach-mark tutorials.
//
// Every tab owns a short step list. A step may point at a registered on-screen
// target (see components/TutorialTarget.js) so the overlay can spotlight the
// real control; steps without a target render as a centered card. Each tab is
// seen once per TUTORIAL_VERSION and stays dismissed until either the version
// is bumped or the user replays it from Settings -> Preferences.

// Bumped whenever any tab's steps change.
export const TAB_TUTORIAL_VERSION = 4;

// The version each tab must reach before its tour stops replaying. Every tab is
// listed so adding one forces a decision here, and editing a tab's steps means
// raising its number to TAB_TUTORIAL_VERSION.
export const TAB_TUTORIAL_TAB_VERSIONS = Object.freeze({
  home: 1,
  chat: 4,
  fridge: 3,
  list: 1,
  settings: 1,
});

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
    // Composer before attach: components/MessageInput.js nests the attach anchor inside the
    // composer row, so naming the row first is what keeps the spotlight moving one way.
    {
      id: "composer",
      targetId: "chat.composer",
      titleKey: "tutorial.tabs.chat.composer.title",
      bodyKey: "tutorial.tabs.chat.composer.body",
    },
    {
      id: "attach",
      targetId: "chat.attach",
      titleKey: "tutorial.tabs.chat.attach.title",
      bodyKey: "tutorial.tabs.chat.attach.body",
    },
    {
      id: "attachOptions",
      targetId: "chat.attachOptions",
      titleKey: "tutorial.tabs.chat.attachOptions.title",
      bodyKey: "tutorial.tabs.chat.attachOptions.body",
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
      id: "itemsMenu",
      targetId: "fridge.items.first",
      titleKey: "tutorial.tabs.fridge.itemsMenu.title",
      bodyKey: "tutorial.tabs.fridge.itemsMenu.body",
    },
    {
      id: "addButton",
      targetId: "fridge.addButton",
      titleKey: "tutorial.tabs.fridge.addButton.title",
      bodyKey: "tutorial.tabs.fridge.addButton.body",
    },
    {
      id: "addOptions",
      targetId: "fridge.addOptions",
      titleKey: "tutorial.tabs.fridge.addOptions.title",
      bodyKey: "tutorial.tabs.fridge.addOptions.body",
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

// Steps whose host control has to reveal itself while the step is showing: the
// overlay is modal and swallows the tap that would normally open it. Both are
// dropdowns hidden behind a tap: the chat attach menu and the fridge add menu.
export function shouldRevealMenu(tabKey, stepId) {
  return (
    (tabKey === "chat" && stepId === "attachOptions") ||
    (tabKey === "fridge" && stepId === "addOptions")
  );
}

// Tour navigation. Both return null when there is no step to move to, so the
// caller decides what that means: advancing past the last step finishes the
// tour, while stepping back from the first step is simply a no-op.
export function nextStepIndex(index, totalSteps) {
  if (!Number.isFinite(index) || !Number.isFinite(totalSteps)) return null;
  if (index < 0 || totalSteps <= 0 || index >= totalSteps - 1) return null;
  return index + 1;
}

export function previousStepIndex(index) {
  if (!Number.isFinite(index) || index <= 0) return null;
  return index - 1;
}

// The version a tab has to reach before it counts as seen.
export function getTabTutorialVersion(tabKey) {
  const version = TAB_TUTORIAL_TAB_VERSIONS[String(tabKey || "")];
  return Number.isFinite(version) ? version : TAB_TUTORIAL_VERSION;
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
  version = getTabTutorialVersion(tabKey)
) {
  return getSeenTabVersion(seenTabs, tabKey) >= version;
}

export function hasSeenTabTutorial(
  settings,
  tabKey,
  version = getTabTutorialVersion(tabKey)
) {
  return isTabTutorialSeen(settings?.tutorial?.seenTabs, tabKey, version);
}

export function markTabTutorialSeen(
  seenTabs,
  tabKey,
  version = getTabTutorialVersion(tabKey)
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
