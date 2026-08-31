import { memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ImageViewing from "./ImageViewer";
import MarkdownText from "./MarkdownText";
import { getLinkPreview } from "link-preview-js";
import { useTranslation } from "react-i18next";
import { GlobalContext } from "../context/GlobalContext";
import {
  canFetchLinkPreview,
  shouldAutoLoadLinkPreview,
} from "../utils/linkPreviewPolicy";

const MAX_LINK_PREVIEWS = 6;

function toDisplayText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function MessageBubble({ text, imageUri, isUser, selected = false, onLongPress }) {
  const { t } = useTranslation();
  const { settings, theme } = useContext(GlobalContext);
  const fontSize = settings?.ux?.fontSize || 16;
  const incognito = Boolean(settings?.privacy?.incognito);
  const chatgptStyle = Boolean(settings?.chat?.chatgptStyle);
  const autoLoadPreview = shouldAutoLoadLinkPreview({ incognito });
  // iOS: custom actions menu (long-press), so the native copy-only menu must
  // stay off. Android: keep native text selection with selection handles.
  const useCustomTextMenu = Platform.OS === "ios";

  const [previewVisible, setPreviewVisible] = useState(false);
  const mountedRef = useRef(false);
  const displayText = toDisplayText(text);
  const safeImageUri = typeof imageUri === "string" ? imageUri : "";
  const [linkMetas, setLinkMetas] = useState([]); // ✅ array now

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const openPreview = () => {
    if (safeImageUri) setPreviewVisible(true);
  };
  const closePreview = () => setPreviewVisible(false);

  // --- Extract URLs (dedupe, keep order) ---
  const urls = useMemo(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const found = displayText.match(urlRegex) || [];

    const seen = new Set();
    const deduped = [];

    for (const raw of found) {
      // trim trailing punctuation that often sticks to URLs in sentences
      const clean = raw.replace(/[),.?!:;"']+$/g, "");
      if (!seen.has(clean)) {
        seen.add(clean);
        deduped.push(clean);
        if (deduped.length >= MAX_LINK_PREVIEWS) break;
      }
    }
    return deduped;
  }, [displayText]);

  const metaByUrl = new Map(
    linkMetas.filter((meta) => urls.includes(meta.url)).map((meta) => [meta.url, meta])
  );

  const loadPreview = async (url) => {
    if (!canFetchLinkPreview(url)) {
      setLinkMetas((previous) => [
        ...previous.filter((meta) => meta.url !== url),
        { url, status: "blocked", title: null, description: null },
      ]);
      return;
    }

    setLinkMetas((previous) => [
      ...previous.filter((meta) => meta.url !== url),
      { url, status: "loading", title: null, description: null },
    ]);

    try {
      const data = await getLinkPreview(url, {
        headers: {
          "user-agent": "Twitterbot/1.0",
          "accept-language": "en-US",
        },
        timeout: 4000,
        imagesPropertyType: "og",
      });
      if (!mountedRef.current) return;
      setLinkMetas((previous) => [
        ...previous.filter((meta) => meta.url !== url),
        {
          url,
          status: "loaded",
          title: toDisplayText(data?.title) || null,
          description: toDisplayText(data?.description) || null,
        },
      ]);
    } catch {
      if (!mountedRef.current) return;
      setLinkMetas((previous) => [
        ...previous.filter((meta) => meta.url !== url),
        { url, status: "failed", title: null, description: null },
      ]);
    }
  };

  const openLink = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error(t("linkPreview.linkNotSupported"));
      if (!mountedRef.current) return;
      await Linking.openURL(url);
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          t("linkPreview.couldNotOpenLink"),
          error?.message || t("linkPreview.pleaseTryAgain")
        );
      }
    }
  };

  // --- Case 1: image only (unchanged behavior) ---
  if (safeImageUri) {
    return (
      <View
        style={[
          styles.imageContainer,
          isUser ? styles.userAlign : styles.aiAlign,
        ]}
      >
        <TouchableOpacity
          onPress={openPreview}
          accessibilityRole="imagebutton"
          accessibilityLabel={t("linkPreview.openAttachedImage")}
        >
          <Image
            source={{ uri: safeImageUri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        </TouchableOpacity>

        <ImageViewing
          images={[{ uri: safeImageUri }]}
          imageIndex={0}
          visible={previewVisible}
          onRequestClose={closePreview}
          backgroundColor={theme.modalBackground}
        />
      </View>
    );
  }

  // --- Case 2: text + link previews (Google-ish cards OUTSIDE bubble) ---
  return (
    <View
      style={[
        styles.messageGroup,
        chatgptStyle ? styles.messageGroupChatgpt : null,
        isUser ? styles.userAlign : styles.aiAlign,
      ]}
    >
      {/* --- Bubble (text only) --- */}
      <View
        style={[
          styles.bubble,
          { backgroundColor: isUser ? theme.userBubble : theme.aiBubble },
          isUser ? styles.userBubble : styles.aiBubble,
          chatgptStyle && !isUser ? styles.aiBubbleChatgpt : null,
          selected && { borderColor: theme.accent, borderWidth: 1.5 },
        ]}
      >
        {displayText ? (
          isUser ? (
            <Text
              selectable={!useCustomTextMenu}
              onLongPress={useCustomTextMenu ? onLongPress : undefined}
              style={[styles.text, { fontSize, color: theme.textPrimary }]}
            >
              {displayText}
            </Text>
          ) : (
            <MarkdownText
              text={displayText}
              theme={theme}
              fontSize={fontSize}
              selectable={!useCustomTextMenu}
              onLongPress={useCustomTextMenu ? onLongPress : undefined}
            />
          )
        ) : null}
      </View>

      {/* Link preview cards OUTSIDE the bubble: user messages only, since
          assistant messages render preview cards inline via MarkdownText. */}
      {isUser && !!urls.length && (
        <View style={[styles.linkList, isUser ? styles.userAlign : styles.aiAlign]}>
          {urls.map((url) => {
            const meta = metaByUrl.get(url);
            const loading = meta?.status === "loading";
            const loaded = meta?.status === "loaded";
            return (
            <View
              key={url}
              style={[
                styles.linkCard,
                {
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.border ?? "rgba(0,0,0,0.12)",
                },
              ]}
            >
              <View style={styles.linkBody}>
                {!!meta?.title && (
                  <Text
                    selectable
                    style={[styles.linkTitle, { color: theme.textPrimary }]}
                    numberOfLines={2}
                  >
                    {meta.title}
                  </Text>
                )}

                {!!meta?.description && (
                  <Text
                    selectable
                    style={[styles.linkDesc, { color: theme.textSecondary }]}
                    numberOfLines={3}
                  >
                    {meta.description}
                  </Text>
                )}

                <Text
                  selectable
                  style={[styles.linkDomain, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {getDomain(url)}
                </Text>
                {!loaded && (
                  <Text style={[styles.linkHint, { color: theme.textSecondary }]}>
                    {loading
                      ? t("linkPreview.loadingPreview")
                      : meta?.status === "blocked"
                        ? t("linkPreview.blockedForSafety")
                        : meta?.status === "failed"
                          ? t("linkPreview.previewUnavailable")
                          : incognito
                            ? t("linkPreview.incognitoOff")
                            : autoLoadPreview
                              ? t("linkPreview.loadingPreview")
                              : t("linkPreview.loadsWhenRequested")}
                  </Text>
                )}
                <View style={styles.linkActions}>
                  {!loaded && meta?.status !== "blocked" && (
                    <TouchableOpacity
                      onPress={() => loadPreview(url)}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityLabel={t("linkPreview.loadPreview", {
                        url: getDomain(url),
                      })}
                      accessibilityHint={t("linkPreview.contactsWebsite")}
                      accessibilityState={{ disabled: loading, busy: loading }}
                    >
                      <Text style={[styles.linkAction, { color: theme.accent }]}>
                        {loading
                          ? t("linkPreview.loadingEllipsis")
                          : t("linkPreview.loadPreviewButton")}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => openLink(url)}
                    accessibilityRole="link"
                    accessibilityLabel={t("linkPreview.open", {
                      url: getDomain(url),
                    })}
                  >
                    <Text style={[styles.linkAction, { color: theme.accent }]}>
                      {t("linkPreview.openLink")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );})}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  messageGroup: {
    marginVertical: 5,
    maxWidth: "90%",
  },

  messageGroupChatgpt: {
    maxWidth: "100%",
  },

  bubble: {
    maxWidth: "75%",
    padding: 10,
    borderRadius: 15,
    marginVertical: 5,
    flexShrink: 1,
  },
  aiBubbleChatgpt: {
    maxWidth: "100%",
    backgroundColor: "transparent",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 0,
  },
  userBubble: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 0,
  },
  aiBubble: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 0,
  },
  text: {
    flexShrink: 1,
  },

  thumbnail: {
    width: 200,
    height: 200,
    borderRadius: 10,
    marginTop: 6,
  },

  userAlign: { alignSelf: "flex-end" },
  aiAlign: { alignSelf: "flex-start" },

  // --- Link list container ---
  linkList: {
    marginTop: 6,
    maxWidth: "90%",
    gap: 10, // if unsupported in your RN version, remove and add marginBottom to linkCard
  },

  // --- Link preview card (matches the markdown block style) ---
  linkCard: {
    width: "85%",
    maxWidth: 360,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
  },

  linkBody: {
    padding: 12,
  },

  linkTitle: {
    fontWeight: "700",
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 6,
  },

  linkDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },

  linkDomain: {
    fontSize: 12,
    opacity: 0.85,
  },
  linkHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  linkActions: {
    flexDirection: "row",
    gap: 18,
    marginTop: 10,
  },
  linkAction: {
    fontSize: 13,
    fontWeight: "700",
  },
});

export default memo(MessageBubble);
