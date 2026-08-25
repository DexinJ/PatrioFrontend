// components/LinkPreviewCard.js

import { memo, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getLinkPreview } from "link-preview-js";

import { GlobalContext } from "../context/GlobalContext";
import {
  canFetchLinkPreview,
  shouldAutoLoadLinkPreview,
} from "../utils/linkPreviewPolicy";

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

function LinkPreviewCard({ url, theme }) {
  const { t } = useTranslation();
  const { settings } = useContext(GlobalContext);
  const incognito = Boolean(settings?.privacy?.incognito);
  const autoLoad = shouldAutoLoadLinkPreview({ incognito });
  const [meta, setMeta] = useState(() => ({
    status: canFetchLinkPreview(url)
      ? autoLoad
        ? "loading"
        : "idle"
      : "blocked",
    title: null,
    description: null,
  }));
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (canFetchLinkPreview(url) && autoLoad) {
      void loadPreview(url);
    }
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, autoLoad]);

  async function loadPreview(targetUrl) {
    if (!canFetchLinkPreview(targetUrl)) {
      setMeta((previous) => ({
        ...previous,
        status: "blocked",
        title: null,
        description: null,
      }));
      return;
    }

    setMeta((previous) => ({
      ...previous,
      status: "loading",
      title: null,
      description: null,
    }));

    try {
      const data = await getLinkPreview(targetUrl, {
        headers: {
          "user-agent": "Twitterbot/1.0",
          "accept-language": "en-US",
        },
        timeout: 4000,
        imagesPropertyType: "og",
      });
      if (!mountedRef.current) return;
      setMeta({
        status: "loaded",
        title: toDisplayText(data?.title) || null,
        description: toDisplayText(data?.description) || null,
      });
    } catch {
      if (!mountedRef.current) return;
      setMeta((previous) => ({
        ...previous,
        status: "failed",
        title: null,
        description: null,
      }));
    }
  }

  const openLink = async () => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error(t("linkPreview.linkNotSupported"));
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        t("linkPreview.couldNotOpenLink"),
        error?.message || t("linkPreview.pleaseTryAgain")
      );
    }
  };

  const loading = meta.status === "loading";
  const loaded = meta.status === "loaded";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.inputBackground,
          borderColor: theme.border ?? "rgba(0,0,0,0.12)",
        },
      ]}
    >
      <View style={styles.body}>
        {!!meta.title && (
          <Text
            selectable
            style={[styles.title, { color: theme.textPrimary }]}
            numberOfLines={2}
          >
            {meta.title}
          </Text>
        )}
        {!!meta.description && (
          <Text
            selectable
            style={[styles.desc, { color: theme.textSecondary }]}
            numberOfLines={3}
          >
            {meta.description}
          </Text>
        )}

        <Text
          selectable
          style={[styles.domain, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {getDomain(url)}
        </Text>

        {!loaded && (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {loading
              ? t("linkPreview.loadingPreview")
              : meta.status === "blocked"
                ? t("linkPreview.blockedForSafety")
                : meta.status === "failed"
                  ? t("linkPreview.previewUnavailable")
                  : incognito
                    ? t("linkPreview.incognitoOff")
                    : t("linkPreview.loadsWhenRequested")}
          </Text>
        )}

        <View style={styles.actions}>
          {!loaded && meta.status !== "blocked" && (
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
              <Text style={[styles.action, { color: theme.accent }]}>
                {loading
                  ? t("linkPreview.loadingEllipsis")
                  : t("linkPreview.loadPreviewButton")}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={openLink}
            accessibilityRole="link"
            accessibilityLabel={t("linkPreview.open", { url: getDomain(url) })}
          >
            <Text style={[styles.action, { color: theme.accent }]}>
              {t("linkPreview.openLink")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    marginVertical: 6,
    alignSelf: "flex-start",
  },
  body: {
    padding: 12,
  },
  title: {
    fontWeight: "700",
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 6,
  },
  desc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  domain: {
    fontSize: 12,
    opacity: 0.85,
  },
  hint: {
    fontSize: 12,
    marginTop: 6,
  },
  actions: {
    flexDirection: "row",
    marginTop: 8,
    gap: 16,
  },
  action: {
    fontSize: 14,
    fontWeight: "600",
  },
});

export default memo(LinkPreviewCard);
