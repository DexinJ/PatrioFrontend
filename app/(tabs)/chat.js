import { Ionicons } from "@expo/vector-icons";
import i18next from "i18next";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useGpt } from "../../api/gpt";
import MessageInput from "../../components/MessageInput";
import MessageList from "../../components/MessageList";
import { ChatContext, GlobalContext } from "../../context/GlobalContext";
import {
  claimFridgeProposalAction,
  fridgeProposalCategoryLabels,
  markFridgeProposalActionConsumed,
  normalizeFridgeProposalQuantity,
  releaseFridgeProposalAction,
} from "../../utils/fridgeProposal";
import {
  applyRecipePreferenceProposal,
  formatRecipePreferencePatch,
  normalizeRecipePreferencePatch,
} from "../../utils/recipePreferences";

function getChatErrorMessage(error) {
  const messagesByCode = {
    QUOTA_EXHAUSTED: i18next.t("chat.errors.quotaExhausted"),
    REQUEST_TOO_LARGE: i18next.t("chat.errors.requestTooLarge"),
    RATE_LIMITED: i18next.t("chat.errors.rateLimited"),
    AUTH_REQUIRED: i18next.t("chat.errors.sessionExpired"),
    AUTH_INVALID: i18next.t("chat.errors.sessionExpired"),
    ENTITLEMENT_STALE: i18next.t("chat.errors.entitlementStale"),
    REQUEST_TIMEOUT: i18next.t("chat.errors.requestTimedOut"),
    UPSTREAM_ERROR: i18next.t("chat.errors.upstreamUnavailable"),
    UPSTREAM_UNAVAILABLE: i18next.t("chat.errors.upstreamUnavailable"),
  };

  if (messagesByCode[error?.code]) return messagesByCode[error.code];

  const message = String(error?.message || "").trim();
  if (message && message !== i18next.t("common.unknownError")) return message;

  return i18next.t("chat.errors.couldNotComplete");
}

function ChatEmptyState({ theme }) {
  const { t } = useTranslation();
  return (
    <View style={styles.emptyState}>
      <Ionicons
        name="chatbubbles-outline"
        size={46}
        color={theme.textSecondary}
      />
      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
        {t("chat.startNewChat")}
      </Text>
      <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
        {t("chat.chatDescription")}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const { streamMessage } = useGpt();
  const { theme, settings, addManyToFridge, updateRecipePreferences } =
    useContext(GlobalContext);
  const {
    messages,
    setMessages,
    waiting,
    activeConversationId,
  } = useContext(ChatContext);
  const mountedRef = useRef(false);
  const sendGenerationRef = useRef(0);
  const appliedUiActionsRef = useRef(new Set());
  const claimedFridgeProposalActionsRef = useRef(new Set());
  const [chatTransition] = useState(() => new Animated.Value(1));
  const prevConversationRef = useRef(activeConversationId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sendGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (prevConversationRef.current === activeConversationId) return;
    prevConversationRef.current = activeConversationId;
    chatTransition.setValue(0);
    Animated.timing(chatTransition, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeConversationId, chatTransition]);

  useFocusEffect(
    useCallback(() => {
      const showSub = Keyboard.addListener(
        "keyboardWillShow",
        () => setKeyboardVisible(true)
      );
      const hideSub = Keyboard.addListener(
        "keyboardWillHide",
        () => setKeyboardVisible(false)
      );
      return () => {
        showSub.remove();
        hideSub.remove();
        setKeyboardVisible(false);
      };
    }, [])
  );

  const handleSend = async (message) => {
    const generation = sendGenerationRef.current + 1;
    sendGenerationRef.current = generation;
    setInput("");

    if (message.text || message.imageUri) {
      try {
        await streamMessage({
          text: message.text || "",
          imageUri: message.imageUri || "",
          imageRequestUri: message.imageRequestUri || "",
        });
      } catch (error) {
        if (
          error?.code === "REQUEST_CANCELLED" ||
          !mountedRef.current ||
          sendGenerationRef.current !== generation
        ) {
          return;
        }
        console.error("Error sending message to GPT:", error);
        const errorMessage = getChatErrorMessage(error);

        setMessages((prev) => [
          ...(Array.isArray(prev) ? prev : []),
          {
            role: "assistant",
            content: [{ type: "output_text", text: errorMessage }],
          },
        ]);
      }
    }
  };

  // ✅ Works with your typed categories requirement in gptTools.js
  const handleUiAction = async (maybeAction) => {
    if (!mountedRef.current) return;
    // Some components pass {kind,...}, others pass {action:{kind,...}}
    const action = maybeAction?.kind ? maybeAction : maybeAction?.action;
    if (action?.kind === "recipe_preference_update") {
      const patch = normalizeRecipePreferencePatch(action.patch);
      if (Object.keys(patch).length === 0) return;
      const operation = ["merge", "remove", "replace"].includes(
        action.operation
      )
        ? action.operation
        : "merge";
      const actionKey = JSON.stringify({ operation, patch });
      if (appliedUiActionsRef.current.has(actionKey)) return;
      appliedUiActionsRef.current.add(actionKey);
      const appliedPatch = applyRecipePreferenceProposal(
        settings?.recipePreferences?.explicit,
        patch,
        operation
      );
      updateRecipePreferences({ explicit: appliedPatch });
      if (!mountedRef.current) return;
      const summary = formatRecipePreferencePatch(appliedPatch);
      setMessages((previous) => [
        ...(Array.isArray(previous) ? previous : []),
        {
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: summary
                ? t("chat.savedPreferences", { summary })
                : t("chat.savedPreferencesShort"),
            },
          ],
        },
      ]);
      return;
    }
    if (action?.kind !== "add_all_to_fridge") return;
  
    const items = Array.isArray(action.items) ? action.items : [];
    if (items.length === 0) return;
  
    // For your current pipeline, categories should be an array like:
    // ["Fridge","Use soon","Dairy","Unopened"]
    // But we’ll still accept object form defensively.
    const clean = (v) => String(v ?? "").trim();
  
    let added = 0;
    const failed = [];
    const additions = [];
  
    for (const it of items) {
      const name = clean(it?.name);
      if (!name) continue;
  
      const quantity = normalizeFridgeProposalQuantity(it?.quantity);
      const categories = fridgeProposalCategoryLabels(it?.categories);
  
      // Pass through; the context normalizes tags and predicts missing expiry.
      const expiresAt =
        it?.expiresAt ??
        it?.expires_at ??
        it?.expirationDate ??
        it?.expiration_date ??
        undefined;
  
      additions.push({
        name,
        quantity,
        categories,
        expiresAt,
        expiresInDays:
          it?.expiresInDays ?? it?.expires_in_days ?? it?.shelfLifeDays,
      });
    }

    if (additions.length === 0) return;
    if (
      !claimFridgeProposalAction(
        claimedFridgeProposalActionsRef.current,
        action
      )
    ) {
      return;
    }

    try {
      added = addManyToFridge(additions).length;
    } catch (error) {
      releaseFridgeProposalAction(
        claimedFridgeProposalActionsRef.current,
        action
      );
      const reason = String(error?.message || error);
      failed.push(...additions.map(({ name }) => ({ name, reason })));
      if (__DEV__) console.log({ names: additions.map(({ name }) => name), reason });
    }
  
    // Optional summary message
    if (!mountedRef.current) return;
    setMessages((prev) => [
      ...(failed.length === 0
        ? markFridgeProposalActionConsumed(prev, action)
        : Array.isArray(prev)
          ? prev
          : []),
      {
        role: "assistant",
        content: [
          {
            type: "output_text",
            text:
              t("chat.addedToFridge", { count: added }) +
              (failed.length
                ? `\n${t("chat.skipped", {
                    names: failed.map((x) => x.name).join(", "),
                  })}`
                : ""),
          },
        ],
      },
    ]);
  };
  

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={insets.top}
    >
      <TouchableWithoutFeedback
        onPress={Keyboard.dismiss}
        accessible={false}
      >
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme.background,
              paddingBottom: keyboardVisible ? insets.bottom : 0,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Animated.View
              style={[
                styles.contentTransition,
                {
                  opacity: chatTransition,
                  transform: [
                    {
                      translateY: chatTransition.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {messages.length === 0 && !waiting ? (
                <ChatEmptyState theme={theme} />
              ) : (
                <MessageList messages={messages} onUiAction={handleUiAction} />
              )}
            </Animated.View>

            <MessageInput
              value={input}
              onChangeText={setInput}
              onSend={handleSend}
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentTransition: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
