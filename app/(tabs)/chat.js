import { Ionicons } from "@expo/vector-icons";
import i18next from "i18next";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useGpt } from "../../api/gpt";
import { toRequestImageUri } from "../../api/chatAttachments";
import AiDataConsentCard from "../../components/AiDataConsentCard";
import MessageBubble from "../../components/MessageBubble";
import MessageInput from "../../components/MessageInput";
import MessageList from "../../components/MessageList";
import TutorialTarget from "../../components/TutorialTarget";
import { ChatContext, GlobalContext } from "../../context/GlobalContext";
import { useTabTutorial } from "../../context/TabTutorialContext";
import useAiDisclosureGate from "../../hooks/useAiDisclosureGate";
import usePhotoCapture from "../../hooks/usePhotoCapture";
import {
  CHAT_SUGGESTIONS,
  CHAT_SUGGESTION_ACTION_PHOTO,
  hasExpiredItems,
  mealForDate,
} from "../../utils/chatSuggestions";
import {
  TUTORIAL_CHAT_NOTICE_KEY,
  buildTutorialSampleChat,
  shouldShowTabSamples,
} from "../../utils/tutorialSamples";
import {
  claimFridgeProposalAction,
  fridgeProposalCategoryLabels,
  markFridgeProposalActionConsumed,
  normalizeFridgeProposalQuantity,
  releaseFridgeProposalAction,
} from "../../utils/fridgeProposal";
import {
  claimBulkProposalAction,
  markBulkProposalActionConsumed,
} from "../../utils/bulkProposal";
import {
  applyRecipePreferenceProposal,
  formatRecipePreferencePatch,
  normalizeRecipePreferencePatch,
} from "../../utils/recipePreferences";
import { looksLikeNativeErrorText } from "../../utils/chatReplayPolicy";
import {
  RETRY_MODE_BLOCKED,
  planRetrySend,
  removeNotice,
  replaceTrailingNotice,
  retryPayloadFromMessages,
} from "../../utils/chatErrorNotice";

// CommonJS require, matching how the other pure policy modules are consumed
// (see api/storageKeys.js and api/aiProviderSettings.js). Declared after the
// import block so the import statements stay contiguous.
const { AI_DISCLOSURE_SETTINGS_VERSION } = require("../../utils/aiDisclosurePolicy.cjs");

function getChatErrorMessage(error) {
  const messagesByCode = {
    QUOTA_EXHAUSTED: i18next.t("chat.errors.quotaExhausted"),
    REQUEST_TOO_LARGE: i18next.t("chat.errors.requestTooLarge"),
    RATE_LIMITED: i18next.t("chat.errors.rateLimited"),
    AUTH_REQUIRED: i18next.t("chat.errors.sessionExpired"),
    AUTH_INVALID: i18next.t("chat.errors.sessionExpired"),
    ENTITLEMENT_STALE: i18next.t("chat.errors.entitlementStale"),
    REQUEST_TIMEOUT: i18next.t("chat.errors.requestTimedOut"),
    SERVER_TOOL_TIMEOUT: i18next.t("chat.errors.toolTimedOut"),
    RECIPE_RECOMMENDATION_TIMEOUT: i18next.t("chat.errors.recipeSearchTimedOut"),
    UPSTREAM_TIMEOUT: i18next.t("chat.errors.requestTimedOut"),
    UPSTREAM_ERROR: i18next.t("chat.errors.upstreamUnavailable"),
    UPSTREAM_UNAVAILABLE: i18next.t("chat.errors.upstreamUnavailable"),
    APPLE_AI_REQUEST_TOO_LARGE: i18next.t("chat.errors.requestTooLarge"),
    APPLE_AI_TOOL_LIMIT: i18next.t("chat.errors.appleCouldNotComplete"),
    APPLE_AI_INVALID_RESPONSE: i18next.t("chat.errors.appleCouldNotComplete"),
  };

  if (messagesByCode[error?.code]) return messagesByCode[error.code];

  const message = String(error?.message || "").trim();

  // Native bridge failures carry framework names, source paths, and Apple
  // framework detail the assistant is told never to reveal. Map them to a
  // user-facing string instead of echoing the raw text.
  if (looksLikeNativeErrorText(message)) {
    return /context window/i.test(message)
      ? i18next.t("chat.errors.requestTooLarge")
      : i18next.t("chat.errors.couldNotComplete");
  }

  if (message && message !== i18next.t("common.unknownError")) return message;

  return i18next.t("chat.errors.couldNotComplete");
}

function ChatEmptyState({
  theme,
  fontSize,
  fridgeItems,
  onSuggestion,
  consentPending = false,
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  // The cook prompt names the meal for the current hour. Recompute it when the
  // tab comes back into view instead of trusting a label rendered at launch.
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
    }, [])
  );

  const suggestions = useMemo(
    () =>
      CHAT_SUGGESTIONS.filter(
        (suggestion) =>
          !suggestion.expiredRestock || hasExpiredItems(fridgeItems)
      ),
    [fridgeItems]
  );

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
      {/* Tapping a chip starts the turn, so the empty state offers a way in
          instead of only explaining what the assistant can do. The prompts and
          their per-locale copy live in utils/chatSuggestions.js.
          Both the chips and the AI notice below are hidden while the data
          disclosure is unacknowledged: a chip would invite a turn the send path
          refuses, and the notice would repeat the disclosure the consent card is
          already showing. The card is the only place it appears, until it is
          accepted. */}
      {consentPending ? null : (
      <View style={styles.suggestionChips}>
        {suggestions.map((suggestion) => {
          const label = suggestion.meal
            ? t(suggestion.labelKey, {
                meal: t(`chat.suggestions.meals.${mealForDate(now)}`),
              })
            : t(suggestion.labelKey);

          return (
            <TouchableOpacity
              key={suggestion.id}
              style={[
                styles.suggestionChip,
                { borderColor: theme.border, backgroundColor: theme.card },
              ]}
              onPress={() =>
                onSuggestion?.({ action: suggestion.action, text: label })
              }
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Ionicons
                name={suggestion.icon}
                size={Math.max(15, fontSize * 0.95)}
                color={theme.accent}
              />
              <Text
                style={[
                  styles.suggestionText,
                  { fontSize: Math.max(13, fontSize * 0.9), color: theme.textPrimary },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      )}
      {consentPending ? null : (
        <Text style={[styles.emptyNote, { color: theme.textSecondary }]}>
          {t("chat.aiNotice")}
        </Text>
      )}
    </View>
  );
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const { streamMessage, prewarm, cancelAll } = useGpt();
  const {
    theme,
    settings,
    fridgeItems,
    addManyToFridge,
    editFridgeItem,
    removeManyFromFridge,
    updateSetting,
    updateRecipePreferences,
  } = useContext(GlobalContext);
  const {
    messages,
    setMessages,
    waiting,
    activeConversationId,
    conversationLoading,
  } = useContext(ChatContext);
  const { isActive: tutorialActive, activeTabKey: tutorialTabKey } = useTabTutorial();
  const fontSize = settings?.ux?.fontSize || 16;

  // The first turn is gated on the third-party AI data disclosure. The rule lives
  // in utils/aiDisclosurePolicy.cjs and the binding to stored settings lives in
  // hooks/useAiDisclosureGate.js, so this screen and the Fridge screen cannot
  // drift apart on what "may send" means. `required` stays false until the stored
  // settings are read, so the card never flashes and a send is never refused for a
  // user who already agreed.
  const aiGate = useAiDisclosureGate();
  const aiConsentRequired = aiGate.required;

  const acknowledgeAiDisclosure = useCallback(() => {
    updateSetting("chat", "aiDisclosureAcknowledged", true);
    updateSetting(
      "chat",
      "aiDisclosureVersion",
      AI_DISCLOSURE_SETTINGS_VERSION
    );
  }, [updateSetting]);

  // While this tab's first-run tour is running on an empty conversation, show a
  // short labelled example exchange so the "ask about your kitchen" step has
  // something to point at. Render-only and never sent to the model: see
  // utils/tutorialSamples.js.
  const showTutorialSamples = shouldShowTabSamples({
    isActive: tutorialActive,
    activeTabKey: tutorialTabKey,
    tabKey: "chat",
    itemCount: messages.length,
  });
  const tutorialSampleMessages = useMemo(
    () => (showTutorialSamples ? buildTutorialSampleChat(t) : []),
    [showTutorialSamples, t]
  );
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

  // Prewarm the chat WebSocket as soon as this screen is opened, so the
  // connect handshake overlaps with the user composing their first message.
  useFocusEffect(
    useCallback(() => {
      try {
        prewarm();
      } catch {
        // Best-effort; the normal send path reconnects as needed.
      }
    }, [prewarm])
  );

  // The idle timer closes the socket after 90 seconds without traffic, and
  // prewarm only ran when the screen was focused — so a send after a long pause
  // paid the handshake. Re-arm it when the composer is focused instead of
  // keeping every socket alive for the whole screen visit.
  const handleComposerFocus = useCallback(() => {
    try {
      prewarm();
    } catch {
      // Best-effort; the send path reconnects as needed.
    }
  }, [prewarm]);

  // One send path for both a new turn and a retry of a failed one, so the
  // failure handling exists in exactly one place.
  const sendTurn = async ({
    text,
    imageUri,
    imageRequestUri,
    appendUserMessage = true,
    history = null,
  }) => {
    const generation = sendGenerationRef.current + 1;
    sendGenerationRef.current = generation;
    setInput("");

    if (!text && !imageUri) return;

    try {
      await streamMessage({
        text: text || "",
        imageUri: imageUri || "",
        imageRequestUri: imageRequestUri || "",
        appendUserMessage,
        history,
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

      setMessages((prev) =>
        replaceTrailingNotice(prev, {
          // The generation makes the id unique even when two failures land in
          // the same millisecond; the id is the list key and the dismiss
          // handle.
          id: `assistant-error-${generation}-${Date.now()}`,
          role: "assistant",
          // User-facing only: never sent back to a model.
          // See utils/chatReplayPolicy.
          isError: true,
          errorCode: error?.code || null,
          content: [{ type: "output_text", text: errorMessage }],
        })
      );
    }
  };

  // Every send path on this screen funnels through here — the composer, the
  // empty-state chips, and the photo capture callback — so the disclosure check
  // only has to exist once per screen. The Fridge screen's two send paths ask the
  // same hook (hooks/useAiDisclosureGate.js), and
  // tests/aiDisclosurePolicy.test.js fails if a new one forgets to.
  const handleSend = (message) => {
    if (aiConsentRequired) return;
    return sendTurn({ ...message });
  };

  // Re-send the turn a notice failed to answer. The user bubble stays put and
  // the notice is dropped, so the retry never duplicates the turn. Only the
  // newest notice is retryable, because the request history has to end with the
  // turn being re-sent.
  const handleRetry = async (noticeId) => {
    if (!mountedRef.current) return;
    // A stored notice is a way to reach a model too. While the disclosure is
    // unacknowledged the card is on screen in the composer, so this returns
    // silently rather than interrupting with a second explanation.
    if (aiConsentRequired) return;

    const payload = retryPayloadFromMessages(messages, noticeId);
    if (!payload) return;

    // A photo turn only stores its durable attachment path, never the base64 the
    // model needs, so the bytes are read back before the request is built.
    const imageDataUri = payload.imageUri
      ? await toRequestImageUri(payload.imageUri)
      : "";
    if (!mountedRef.current) return;

    const plan = planRetrySend(payload, imageDataUri);
    if (plan.mode === RETRY_MODE_BLOCKED) {
      // Nothing left to send (an image-only turn whose photo is gone): keep the
      // notice, so Dismiss stays available, and say why instead of sending a turn
      // the model cannot answer.
      Alert.alert(
        t("chat.errors.imageRetryTitle"),
        t("chat.errors.imageRetryUnavailable")
      );
      return;
    }

    setMessages((prev) => removeNotice(prev, noticeId));
    return sendTurn({
      text: plan.text,
      // The turn is already in the transcript and must not be appended again, so
      // nothing here is persisted: the URL below only ever travels on the wire.
      imageUri: plan.imageRequestUri,
      imageRequestUri: plan.imageRequestUri,
      appendUserMessage: false,
      history: (Array.isArray(messages) ? messages : []).filter(
        (entry) => entry?.isError !== true
      ),
    });
  };

  const handleDismissNotice = (noticeId) => {
    setMessages((prev) => removeNotice(prev, noticeId));
  };

  // Stop button: cancel through the same path used for conversation switches
  // and backgrounding. The send path swallows REQUEST_CANCELLED, so cancelling
  // never leaves an error notice behind.
  const handleStop = () => {
    cancelAll?.();
  };

  // The empty-state "add from a photo" chip reuses the composer's capture flow.
  const { takePhoto } = usePhotoCapture({ onCapture: handleSend });

  const handleSuggestion = (suggestion) => {
    if (!suggestion) return;
    if (aiConsentRequired) return;

    if (suggestion.action === CHAT_SUGGESTION_ACTION_PHOTO) {
      takePhoto();
      return;
    }

    const prompt = String(suggestion.text || "").trim();
    if (!prompt) return;
    handleSend({ text: prompt, imageUri: null, isUser: true });
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
    if (action?.kind === "bulk_fridge_update") {
      const changes = Array.isArray(action.changes) ? action.changes : [];
      if (changes.length === 0) return;
      if (
        !claimBulkProposalAction(
          claimedFridgeProposalActionsRef.current,
          action
        )
      ) {
        return;
      }

      const knownIds = new Set(
        (Array.isArray(fridgeItems) ? fridgeItems : []).map((item) => item?.id)
      );
      const seenIds = new Set();
      let applied = 0;
      const failed = [];
      for (const change of changes) {
        const id = String(change?.id || "").trim();
        const label = String(change?.name || "").trim() || t("common.unnamed");
        if (!id || seenIds.has(id) || !knownIds.has(id)) {
          failed.push(label);
          continue;
        }
        seenIds.add(id);
        const update =
          change?.update && typeof change.update === "object"
            ? change.update
            : {};
        if (!change?.remove && Object.keys(update).length === 0) {
          failed.push(label);
          continue;
        }
        try {
          if (change?.remove === true) {
            removeManyFromFridge([id]);
          } else {
            editFridgeItem(id, update);
          }
          applied += 1;
        } catch (error) {
          if (__DEV__) console.log({ bulkFridgeUpdateError: error?.message || error });
          failed.push(label);
        }
      }

      if (!mountedRef.current) return;
      setMessages((prev) => [
        ...markBulkProposalActionConsumed(prev, action),
        {
          role: "assistant",
          content: [
            {
              type: "output_text",
              text:
                t("chat.appliedFridgeChanges", { count: applied }) +
                (failed.length
                  ? `\n${t("chat.skipped", {
                      names: failed.join(", "),
                    })}`
                  : ""),
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
            {/*
              The tour anchors this step. With samples the anchor wraps only the
              example exchange, so the coach card lands below it instead of over
              it; a real conversation fills the area as it always did.
            */}
            <TutorialTarget
              id="chat.messages"
              style={showTutorialSamples ? undefined : { flex: 1 }}
            >
              {conversationLoading && activeConversationId ? (
                <TouchableWithoutFeedback
                  onPress={Keyboard.dismiss}
                  accessible={false}
                >
                  <View style={styles.loadingState}>
                    <ActivityIndicator size="large" color={theme.accent} />
                  </View>
                </TouchableWithoutFeedback>
              ) : showTutorialSamples && !waiting ? (
                <View style={styles.sampleChat}>
                  <Text
                    style={[
                      styles.sampleNotice,
                      {
                        fontSize: Math.max(12, fontSize * 0.8),
                        color: theme.textSecondary,
                      },
                    ]}
                  >
                    {t(TUTORIAL_CHAT_NOTICE_KEY)}
                  </Text>
                  {tutorialSampleMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      text={message.content}
                      isUser={message.role === "user"}
                    />
                  ))}
                </View>
              ) : messages.length === 0 && !waiting ? (
                <TouchableWithoutFeedback
                  onPress={Keyboard.dismiss}
                  accessible={false}
                >
                  <View style={styles.emptyWrap}>
                    <ChatEmptyState
                      theme={theme}
                      fontSize={fontSize}
                      fridgeItems={fridgeItems}
                      onSuggestion={handleSuggestion}
                      consentPending={aiConsentRequired}
                    />
                  </View>
                </TouchableWithoutFeedback>
              ) : (
                <MessageList
                  messages={messages}
                  onUiAction={handleUiAction}
                  onRetry={handleRetry}
                  onDismiss={handleDismissNotice}
                />
              )}
            </TutorialTarget>
          </Animated.View>

          <TutorialTarget id="chat.composer">
            {aiConsentRequired ? (
              <AiDataConsentCard
                theme={theme}
                fontSize={fontSize}
                onAcknowledge={acknowledgeAiDisclosure}
              />
            ) : (
              <MessageInput
                value={input}
                onChangeText={setInput}
                onSend={handleSend}
                onStop={handleStop}
                onFocus={handleComposerFocus}
              />
            )}
          </TutorialTarget>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentTransition: { flex: 1 },
  sampleChat: { paddingTop: 12, paddingBottom: 4 },
  sampleNotice: { textAlign: "center", marginBottom: 6, paddingHorizontal: 24 },
  emptyWrap: { flex: 1 },
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
  emptyNote: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 6,
  },
  suggestionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  suggestionText: {
    fontWeight: "600",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
