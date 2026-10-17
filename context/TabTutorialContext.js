// Drives the per-tab, one-time coach-mark tutorials.
//
// The provider owns two things:
//   1. A registry of on-screen anchors, so a step can spotlight a real control
//      (components/TutorialTarget.js registers into it).
//   2. The transient tour session (which tab, which step, where the spotlight
//      currently is). "Has this tab been taught?" lives in GlobalContext
//      settings so it is UID-scoped, persisted, and cleared with account data.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  TAB_TUTORIAL_START_DELAY_MS,
  getTabTutorial,
  isTabTutorialSeen,
  markTabTutorialSeen,
  nextStepIndex,
  previousStepIndex,
} from "../utils/tabTutorials";
import { GlobalContext } from "./GlobalContext";
import { useEmailVerificationPromptVisible } from "./EmailVerificationContext";

const EMPTY_TUTORIAL = {
  isActive: false,
  activeTabKey: null,
  currentStep: null,
  stepIndex: 0,
  totalSteps: 0,
  spot: null,
  advance: () => {},
  back: () => {},
  dismiss: () => {},
  replayTutorials: () => {},
  registerTarget: () => {},
};

export const TabTutorialContext = createContext(EMPTY_TUTORIAL);

export function useTabTutorial() {
  return useContext(TabTutorialContext);
}

export function TabTutorialProvider({ activeTabKey, children }) {
  const { settings, storageHydrated, updateSetting } = useContext(GlobalContext);
  const verificationPromptVisible = useEmailVerificationPromptVisible();
  const [session, setSession] = useState(null);
  const [measurement, setMeasurement] = useState({ key: null, rect: null });
  const [registryVersion, setRegistryVersion] = useState(0);
  const targetsRef = useRef(new Map());
  // Guards both directions: a double tap must not skip two steps at once.
  const navLockRef = useRef(false);

  const seenTabs = settings?.tutorial?.seenTabs;

  const registerTarget = useCallback((id, node) => {
    if (!id) return;
    if (node) targetsRef.current.set(id, node);
    else targetsRef.current.delete(id);
    setRegistryVersion((previous) => previous + 1);
  }, []);

  const measureTarget = useCallback((id, callback) => {
    const node = id ? targetsRef.current.get(id) : null;
    if (!node || typeof node.measureInWindow !== "function") {
      callback(null);
      return;
    }
    try {
      node.measureInWindow((x, y, width, height) => {
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0
        ) {
          callback(null);
          return;
        }
        callback({ x, y, width, height });
      });
    } catch {
      // A detached or flattened host view can throw; fall back to a centered
      // card instead of breaking the tour.
      callback(null);
    }
  }, []);

  const sessionTabKey = session?.tabKey || null;
  const sessionIndex = session?.index || 0;
  const sessionSteps = sessionTabKey ? getTabTutorial(sessionTabKey) : null;
  const currentStep = sessionSteps ? sessionSteps[sessionIndex] || null : null;
  const currentTargetId = currentStep?.targetId || null;
  const measurementKey = currentTargetId
    ? `${sessionTabKey}:${sessionIndex}:${currentTargetId}`
    : null;

  // The spotlight is derived rather than stored, so switching steps or closing
  // the tour can never show a rectangle measured for a different step.
  const spot =
    measurementKey && measurement.key === measurementKey
      ? measurement.rect
      : null;

  // Keep the spotlight glued to the real control: measure right away, then
  // again after the first paint settles or a target registers late.
  useEffect(() => {
    if (!measurementKey) return undefined;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      measureTarget(currentTargetId, (rect) => {
        if (!cancelled) setMeasurement({ key: measurementKey, rect });
      });
    };

    const firstTimer = setTimeout(measure, 0);
    const retryTimer = setTimeout(measure, 180);
    const settleTimer = setTimeout(measure, 600);
    return () => {
      cancelled = true;
      clearTimeout(firstTimer);
      clearTimeout(retryTimer);
      clearTimeout(settleTimer);
    };
  }, [
    currentTargetId,
    measurementKey,
    registryVersion,
    measureTarget,
  ]);

  // Show a tab's tour the first time that tab is opened after sign-in. The
  // delay lets the screen mount and register its anchors first.
  useEffect(() => {
    if (!activeTabKey || !storageHydrated) return undefined;
    if (isTabTutorialSeen(seenTabs, activeTabKey)) return undefined;
    if (sessionTabKey === activeTabKey) return undefined;
    // The email-verification nudge is a Modal presented from this same screen.
    // Starting the tour while it is open mounts a second Modal at the same
    // time; React Native only presents one modal at a time, so the tour is
    // silently dropped and the dimmed screen looks frozen. Wait for the nudge
    // to close, then run.
    if (verificationPromptVisible) return undefined;

    const timer = setTimeout(() => {
      setSession({ tabKey: activeTabKey, index: 0 });
    }, TAB_TUTORIAL_START_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    activeTabKey,
    seenTabs,
    sessionTabKey,
    storageHydrated,
    verificationPromptVisible,
  ]);

  const finishSession = useCallback(
    (tabKey) => {
      setSession(null);
      if (!tabKey) return;
      const nextSeen = markTabTutorialSeen(seenTabs, tabKey);
      updateSetting("tutorial", "seenTabs", nextSeen);
    },
    [seenTabs, updateSetting]
  );

  const advance = useCallback(() => {
    if (!session || navLockRef.current) return;

    const steps = getTabTutorial(session.tabKey) || [];
    const next = nextStepIndex(session.index, steps.length);
    if (next === null) {
      finishSession(session.tabKey);
      return;
    }

    navLockRef.current = true;
    setSession({ tabKey: session.tabKey, index: next });
    setTimeout(() => {
      navLockRef.current = false;
    }, 220);
  }, [finishSession, session]);

  // Back exists so a mis-advance is recoverable without abandoning the tour:
  // before this, the only exit was Skip, which ends the tour for good.
  const back = useCallback(() => {
    if (!session || navLockRef.current) return;

    const previous = previousStepIndex(session.index);
    if (previous === null) return;

    navLockRef.current = true;
    setSession({ tabKey: session.tabKey, index: previous });
    setTimeout(() => {
      navLockRef.current = false;
    }, 220);
  }, [session]);

  const dismiss = useCallback(() => {
    if (!session) return;
    finishSession(session.tabKey);
  }, [finishSession, session]);

  // Reset every tab's tour and immediately walk the current tab again, so the
  // Settings row gives visible feedback where the user tapped it.
  const replayTutorials = useCallback(() => {
    // An empty map means "no tab has been taught at this version".
    updateSetting("tutorial", "seenTabs", {});
    setSession({ tabKey: activeTabKey || "home", index: 0 });
  }, [activeTabKey, updateSetting]);

  const value = useMemo(
    () => ({
      isActive: Boolean(session),
      activeTabKey: sessionTabKey,
      currentStep,
      stepIndex: sessionIndex,
      totalSteps: sessionSteps ? sessionSteps.length : 0,
      spot,
      advance,
      back,
      dismiss,
      replayTutorials,
      registerTarget,
    }),
    [
      advance,
      back,
      currentStep,
      dismiss,
      registerTarget,
      replayTutorials,
      session,
      sessionIndex,
      sessionSteps,
      sessionTabKey,
      spot,
    ]
  );

  return (
    <TabTutorialContext.Provider value={value}>
      {children}
    </TabTutorialContext.Provider>
  );
}
