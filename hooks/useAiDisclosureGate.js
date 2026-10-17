// One place that answers "may this screen send anything to the model yet?".
//
// Workstream A1 gated the chat composer, but three other paths reach a model and
// none of them asked: the Fridge screen's photo capture, the Fridge screen's
// recipe request from an item's action menu, and a retry of an older failed turn
// in the transcript. Re-deriving the rule per screen is how those paths drifted
// in the first place, so every sender asks this hook instead.
//
// The rule itself stays pure and unit-tested in utils/aiDisclosurePolicy.cjs;
// this only binds it to the stored settings and offers the way to the card.

import { router } from "expo-router";
import { useCallback, useContext, useMemo } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";

import { GlobalContext } from "../context/GlobalContext";

// CommonJS require, matching how the other pure policy modules are consumed (see
// api/storageKeys.js and app/(tabs)/chat.js).
const { isAiDisclosureAcknowledged } = require("../utils/aiDisclosurePolicy.cjs");

export default function useAiDisclosureGate() {
  const { t } = useTranslation();
  const { settings, storageHydration } = useContext(GlobalContext);

  // `resolved` is what keeps a cold start from reading "not known yet" as "not
  // acknowledged": until the stored settings land, sending stays allowed and the
  // card stays hidden, exactly as it did before this hook existed.
  const resolved = storageHydration?.settings?.resolved === true;
  const required = resolved && !isAiDisclosureAcknowledged(settings);

  // Returns true when the caller may send. Otherwise it explains and offers the
  // way to the card, and the caller must return without sending anything.
  const ensure = useCallback(() => {
    if (!required) return true;

    Alert.alert(t("chat.aiConsentTitle"), t("chat.aiConsentSendBlockedBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("chat.aiConsentGoToChat"),
        onPress: () => router.push("/chat"),
      },
    ]);
    return false;
  }, [required, t]);

  // Stable identity: callers put this in `useCallback` dependency arrays.
  return useMemo(
    () => ({ resolved, required, ensure }),
    [ensure, required, resolved]
  );
}
