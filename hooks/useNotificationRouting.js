import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useContext, useEffect, useRef } from "react";
import { GlobalContext } from "../context/GlobalContext";
import {
  buildReminderRoute,
  resolveFocusedItemId,
} from "../utils/notificationRouting";

/**
 * Sends a tapped Pantrio reminder to the fridge item it is about.
 *
 * Mounted as a child of the signed-in tab tree, after storage hydration, so a
 * response that arrives before the app has an account and items routes nowhere.
 * `useLastNotificationResponse` keeps returning the last response for the life
 * of the process, so each one is consumed once and then cleared.
 */
export default function useNotificationRouting() {
  const { fridgeItems } = useContext(GlobalContext);
  const response = Notifications.useLastNotificationResponse();
  const handledRef = useRef(null);

  useEffect(() => {
    if (!response) return;

    const route = buildReminderRoute({
      response,
      defaultActionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    });
    if (!route) return;

    const handledKey = `${response?.notification?.request?.identifier || ""}:${
      response?.actionIdentifier || ""
    }:${response?.notification?.date ?? 0}`;
    if (handledRef.current === handledKey) return;
    handledRef.current = handledKey;

    try {
      Notifications.clearLastNotificationResponse();
    } catch (error) {
      console.warn("Could not clear the last notification response:", error);
    }

    const focusItemId = resolveFocusedItemId(route, fridgeItems);
    router.navigate({
      pathname: "/fridge",
      params: focusItemId
        ? { focusItemId, focusNonce: String(Date.now()) }
        : {},
    });
  }, [fridgeItems, response]);
}
