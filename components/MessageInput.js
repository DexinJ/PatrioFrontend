import { Ionicons } from "@expo/vector-icons";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { ChatContext, GlobalContext } from "../context/GlobalContext";
import {
  COMPOSER_BORDER_WIDTH,
  calculateComposerLayout,
} from "../utils/composerLayout";
import {
  normalizeComposerText,
  shouldShowSendButton,
} from "../utils/voiceInput";
import PlusMenu from "./PlusMenu";
import TutorialTarget from "./TutorialTarget";

export default function MessageInput({ value, onChangeText, onSend, onFocus }) {
  const { t } = useTranslation();
  const { settings, theme } = useContext(GlobalContext);
  const { receiving } = useContext(ChatContext);
  const { height: viewportHeight } = useWindowDimensions();

  const fontSize = settings?.ux?.fontSize || 16;
  const chatgptStyle = Boolean(settings?.chat?.chatgptStyle);

  const [composerContentHeight, setComposerContentHeight] = useState(0);
  const composerInputRef = useRef(null);
  const mountedRef = useRef(false);

  const composerLayout = calculateComposerLayout({
    contentHeight:
      typeof value === "string" && value.length > 0
        ? composerContentHeight
        : 0,
    fontSize,
    viewportHeight,
  });

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const sendMessageSafely = (payload) => {
    if (!mountedRef.current) return false;

    try {
      const result = onSend?.(payload);
      Promise.resolve(result).catch((error) => {
        if (mountedRef.current) {
          console.error("Failed to send message:", error);
        }
      });
      return true;
    } catch (error) {
      console.error("Failed to send message:", error);
      return false;
    }
  };

  const handleSendText = () => {
    if (receiving) return;

    const trimmedValue = normalizeComposerText(value);

    if (!trimmedValue) return;

    const sent = sendMessageSafely({
      text: trimmedValue,
      imageUri: null,
      isUser: true,
    });

    if (sent) onChangeText?.("");
  };

  const handleComposerTextChange = (nextValue) => {
    if (!nextValue) {
      setComposerContentHeight(0);
    }

    onChangeText?.(nextValue);
  };

  const handleSendImage = (imageData) => {
    if (receiving) return;
    sendMessageSafely(imageData);
  };

  const showSendButton = shouldShowSendButton(value);

  return (
    <View
      style={[
        styles.container,
        chatgptStyle ? styles.containerChatgpt : null,
        {
          borderColor: theme.border,
          backgroundColor: chatgptStyle ? theme.inputBackground : theme.card,
        },
      ]}
    >
      <TutorialTarget id="chat.attach">
        <PlusMenu onSend={handleSendImage} />
      </TutorialTarget>

      <TextInput
        ref={composerInputRef}
        editable={!receiving}
        multiline
        scrollEnabled={composerLayout.scrollEnabled}
        style={[
          styles.input,
          chatgptStyle ? styles.inputChatgpt : null,
          {
            fontSize,
            lineHeight: composerLayout.lineHeight,
            maxHeight: composerLayout.maximumHeight,
            minHeight: composerLayout.minimumHeight,
            paddingVertical: composerLayout.paddingVertical,
            color: theme.inputText,
            backgroundColor: chatgptStyle
              ? "transparent"
              : theme.inputBackground,
            borderColor: theme.border,
          },
        ]}
        value={value}
        onChangeText={handleComposerTextChange}
        onFocus={onFocus}
        onContentSizeChange={({ nativeEvent }) => {
          setComposerContentHeight(nativeEvent.contentSize.height);
        }}
        placeholder={
          receiving
            ? t("voiceInput.waitingForResponse")
            : chatgptStyle
              ? t("voiceInput.messagePantrio")
              : t("voiceInput.typeAMessage")
        }
        placeholderTextColor={theme.textPlaceholder}
        submitBehavior="newline"
        textAlignVertical="top"
        accessibilityLabel={t("voiceInput.chatMessageA11y")}
        accessibilityHint={t("voiceInput.messageHint")}
      />

      <TouchableOpacity
        style={[
          styles.micButton,
          {
            backgroundColor: theme.actionButton,
            opacity: !showSendButton || receiving ? 0.5 : 1,
          },
        ]}
        onPress={handleSendText}
        disabled={!showSendButton || receiving}
        accessibilityRole="button"
        accessibilityLabel={t("voiceInput.sendMessage")}
        accessibilityHint={t("voiceInput.sendMessageHint")}
        accessibilityState={{ disabled: !showSendButton || receiving }}
      >
        <Ionicons
          name="send"
          size={fontSize * 1.2}
          color={theme.inputBackground}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    padding: 10,
    alignItems: "flex-end",
    borderTopWidth: 1,
  },
  containerChatgpt: {
    borderTopWidth: 0,
    borderRadius: 24,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    borderWidth: COMPOSER_BORDER_WIDTH,
    borderRadius: 20,
    paddingHorizontal: 15,
    marginHorizontal: 5,
  },
  inputChatgpt: {
    borderWidth: 0,
    marginHorizontal: 2,
  },
  micButton: {
    padding: 10,
    borderRadius: 20,
    marginLeft: 5,
    justifyContent: "center",
    alignItems: "center",
  },
});
