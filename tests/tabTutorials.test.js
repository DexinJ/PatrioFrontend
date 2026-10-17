import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import {
  TAB_TUTORIAL_KEYS,
  TAB_TUTORIAL_TAB_VERSIONS,
  TAB_TUTORIALS,
  TAB_TUTORIAL_VERSION,
  clearTabTutorialSeen,
  getTabKeyForPathname,
  getTabTutorial,
  getTabTutorialVersion,
  hasSeenTabTutorial,
  isTabTutorialSeen,
  markTabTutorialSeen,
  nextStepIndex,
  normalizeSeenTabs,
  previousStepIndex,
  shouldRevealMenu,
} from "../utils/tabTutorials.js";

const require = createRequire(import.meta.url);
const en = require("../locales/en.json");
const zh = require("../locales/zh.json");

function resolveKey(catalog, key) {
  return key.split(".").reduce((node, part) => node?.[part], catalog);
}

test("every tab has at least one tutorial step with a unique id", () => {
  for (const tabKey of TAB_TUTORIAL_KEYS) {
    const steps = getTabTutorial(tabKey);
    assert.ok(Array.isArray(steps) && steps.length > 0, `${tabKey} has steps`);

    const ids = steps.map((step) => step.id);
    assert.equal(new Set(ids).size, ids.length, `${tabKey} step ids are unique`);
  }
});

test("every tutorial step has both translations in every locale", () => {
  for (const tabKey of TAB_TUTORIAL_KEYS) {
    for (const step of getTabTutorial(tabKey)) {
      for (const key of [step.titleKey, step.bodyKey]) {
        const english = resolveKey(en, key);
        assert.equal(typeof english, "string", `en missing ${key}`);
        assert.ok(english.trim().length > 0, `en blank ${key}`);

        const chinese = resolveKey(zh, key);
        assert.equal(typeof chinese, "string", `zh missing ${key}`);
        assert.ok(chinese.trim().length > 0, `zh blank ${key}`);
      }
    }
  }
});

test("pathname maps to the tab key that owns the route", () => {
  assert.equal(getTabKeyForPathname("/"), "home");
  assert.equal(getTabKeyForPathname("/index"), "home");
  assert.equal(getTabKeyForPathname("/fridge"), "fridge");
  assert.equal(getTabKeyForPathname("/chat"), "chat");
  assert.equal(getTabKeyForPathname("/list"), "list");
  assert.equal(getTabKeyForPathname("/settings"), "settings");
  assert.equal(getTabKeyForPathname("/(tabs)/fridge"), "fridge");
  assert.equal(getTabKeyForPathname("/fridge/"), "fridge");
  assert.equal(getTabKeyForPathname("/settings?tab=plan"), "settings");
  assert.equal(getTabKeyForPathname("/privacy-policy"), null);
  assert.equal(getTabKeyForPathname(""), null);
  assert.equal(getTabKeyForPathname(undefined), null);
});

test("a tab is unseen until it is marked at the current version", () => {
  const emptySettings = { tutorial: { seenTabs: {} } };
  assert.equal(isTabTutorialSeen({}, "fridge"), false);
  assert.equal(hasSeenTabTutorial(emptySettings, "fridge"), false);
  assert.equal(hasSeenTabTutorial(emptySettings, "home"), false);

  const afterFridge = markTabTutorialSeen({}, "fridge");
  // Compared against the tab's own version, not the global one: a tab whose steps have not
  // changed keeps its older number while other tabs move ahead.
  assert.deepEqual(afterFridge, { fridge: getTabTutorialVersion("fridge") });
  assert.equal(hasSeenTabTutorial({ tutorial: { seenTabs: afterFridge } }, "fridge"), true);
  assert.equal(hasSeenTabTutorial({ tutorial: { seenTabs: afterFridge } }, "list"), false);
});

test("an older version re-teaches the tab and an unknown tab never tours", () => {
  const stale = { fridge: getTabTutorialVersion("fridge") - 1 };
  assert.equal(hasSeenTabTutorial({ tutorial: { seenTabs: stale } }, "fridge"), false);
  assert.equal(isTabTutorialSeen(stale, "fridge"), false);

  // Unknown keys are treated as "nothing to teach" so they can never block
  // navigation or show an empty overlay.
  assert.equal(getTabTutorial("nope"), null);
  assert.equal(hasSeenTabTutorial({ tutorial: { seenTabs: {} } }, "nope"), true);
  assert.deepEqual(markTabTutorialSeen({}, "nope"), {});
});

test("stored seen state is normalized instead of trusted", () => {
  assert.deepEqual(normalizeSeenTabs(null), {});
  assert.deepEqual(normalizeSeenTabs("fridge"), {});
  assert.deepEqual(normalizeSeenTabs([]), {});
  assert.deepEqual(normalizeSeenTabs({ fridge: "1" }), {});
  assert.deepEqual(normalizeSeenTabs({ fridge: 0 }), {});
  assert.deepEqual(normalizeSeenTabs({ fridge: 2, ghost: 1, chat: 1.8 }), {
    fridge: 2,
    chat: 1,
  });
});

test("replay clears only the requested tab", () => {
  const seen = { home: 1, fridge: 1, list: 1 };
  assert.deepEqual(clearTabTutorialSeen(seen, "fridge"), {
    home: 1,
    list: 1,
  });
  assert.deepEqual(clearTabTutorialSeen(seen, "settings"), seen);
  assert.deepEqual(clearTabTutorialSeen(null, "fridge"), {});
});

test("tutorial step targets reference ids used by the screens", () => {
  // Guards against a rename on either side silently turning a coach mark into
  // a centered card: every anchored step must belong to its own tab's prefix.
  for (const tabKey of TAB_TUTORIAL_KEYS) {
    const prefix = `${tabKey}.`;
    for (const step of TAB_TUTORIALS[tabKey]) {
      if (step.targetId === null) continue;
      assert.ok(
        step.targetId.startsWith(prefix),
        `${step.id} target ${step.targetId} should start with ${prefix}`
      );
    }
  }
});

test("every anchored step points at a target id that exists in the source", () => {
  const sourceRoots = ["app", "components"];
  const sourceFiles = [];

  const walk = (directory) => {
    for (const entry of readdirSync(join(process.cwd(), directory), {
      withFileTypes: true,
    })) {
      if (entry.name === "node_modules") continue;
      const relativePath = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(relativePath);
      else if (/\.(js|jsx)$/.test(entry.name)) sourceFiles.push(relativePath);
    }
  };
  for (const root of sourceRoots) walk(root);

  const sources = sourceFiles.map((file) =>
    readFileSync(join(process.cwd(), file), "utf8")
  );

  for (const tabKey of TAB_TUTORIAL_KEYS) {
    for (const step of getTabTutorial(tabKey)) {
      if (step.targetId === null) continue;
      const registered = sources.some(
        (source) => source.includes(`"${step.targetId}"`) || source.includes(`'${step.targetId}'`)
      );
      assert.ok(
        registered,
        `no TutorialTarget registers ${step.targetId} (step ${tabKey}.${step.id})`
      );
    }
  }
});

test("every tab declares the version it is taught at", () => {
  assert.deepEqual(
    Object.keys(TAB_TUTORIAL_TAB_VERSIONS).sort(),
    [...TAB_TUTORIAL_KEYS].sort()
  );

  for (const tabKey of TAB_TUTORIAL_KEYS) {
    const version = getTabTutorialVersion(tabKey);
    assert.ok(Number.isFinite(version) && version > 0, `${tabKey} has a version`);
  }

  assert.equal(getTabTutorialVersion("nope"), TAB_TUTORIAL_VERSION);
});

test("only the tabs whose steps changed are taught again", () => {
  const settings = {
    tutorial: { seenTabs: { home: 1, chat: 1, fridge: 1, list: 1, settings: 1 } },
  };

  assert.equal(hasSeenTabTutorial(settings, "chat"), false);
  assert.equal(hasSeenTabTutorial(settings, "fridge"), false);
  assert.equal(hasSeenTabTutorial(settings, "home"), true);
  assert.equal(hasSeenTabTutorial(settings, "list"), true);
  assert.equal(hasSeenTabTutorial(settings, "settings"), true);
});

test("the reveal helper is scoped to the two dropdown steps", () => {
  assert.equal(shouldRevealMenu("chat", "attachOptions"), true);
  assert.equal(shouldRevealMenu("fridge", "addOptions"), true);
  assert.equal(shouldRevealMenu("chat", "attach"), false);
  assert.equal(shouldRevealMenu("fridge", "addButton"), false);
  assert.equal(shouldRevealMenu("fridge", "attachOptions"), false);
  assert.equal(shouldRevealMenu("chat", "addOptions"), false);
  assert.equal(shouldRevealMenu("chat", undefined), false);
});

test("the chat tour teaches the composer row before the button inside it", () => {
  // components/MessageInput.js nests the chat.attach anchor inside chat.composer, so naming the
  // container first is what stops the spotlight from doubling back on itself.
  const steps = getTabTutorial("chat");
  assert.ok(
    steps.findIndex((step) => step.id === "composer") <
      steps.findIndex((step) => step.id === "attach"),
    "composer comes before attach"
  );
});

test("every reveal step directly follows the step that opens it", () => {
  const pairs = [
    ["chat", "attach", "attachOptions"],
    ["fridge", "addButton", "addOptions"],
  ];

  for (const [tabKey, triggerId, revealId] of pairs) {
    const steps = getTabTutorial(tabKey);
    const triggerIndex = steps.findIndex((step) => step.id === triggerId);
    assert.ok(triggerIndex >= 0, `${tabKey} has a ${triggerId} step`);
    assert.equal(
      steps.findIndex((step) => step.id === revealId),
      triggerIndex + 1,
      `${tabKey}.${revealId} directly follows ${tabKey}.${triggerId}`
    );
    assert.equal(
      shouldRevealMenu(tabKey, revealId),
      true,
      `${tabKey}.${revealId} opens a dropdown`
    );
  }
});

test("the current tour version is the newest per-tab version", () => {
  assert.equal(
    TAB_TUTORIAL_VERSION,
    Math.max(...Object.values(TAB_TUTORIAL_TAB_VERSIONS))
  );
});

test("next step index stops at the last step and refuses unknown input", () => {
  assert.equal(nextStepIndex(0, 3), 1);
  assert.equal(nextStepIndex(1, 3), 2);
  assert.equal(nextStepIndex(2, 3), null);
  assert.equal(nextStepIndex(0, 1), null);
  assert.equal(nextStepIndex(0, 0), null);
  assert.equal(nextStepIndex(-1, 3), null);
  assert.equal(nextStepIndex(0, undefined), null);
  assert.equal(nextStepIndex("1", 3), null);
});

test("previous step index stops at the first step", () => {
  assert.equal(previousStepIndex(2), 1);
  assert.equal(previousStepIndex(1), 0);
  assert.equal(previousStepIndex(0), null);
  assert.equal(previousStepIndex(-1), null);
  assert.equal(previousStepIndex(undefined), null);
  assert.equal(previousStepIndex("1"), null);
});

test("every tour walks forward to the last step and back to the first", () => {
  for (const tabKey of TAB_TUTORIAL_KEYS) {
    const total = getTabTutorial(tabKey).length;
    let index = 0;
    let forwardSteps = 0;

    while (true) {
      const next = nextStepIndex(index, total);
      if (next === null) break;
      forwardSteps += 1;
      index = next;
    }
    assert.equal(forwardSteps, total - 1, `${tabKey} reaches the last step`);
    assert.equal(index, total - 1, `${tabKey} stops on the last step`);

    while (index > 0) {
      const previous = previousStepIndex(index);
      assert.notEqual(previous, null, `${tabKey} steps back from ${index}`);
      index = previous;
    }
    assert.equal(index, 0, `${tabKey} returns to the first step`);
  }
});
