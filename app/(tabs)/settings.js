// SettingsScreen.js (FULL paste-in replacement)
// - Adds urgencyDays controls (from GlobalContext) under Expiration Reminder
// - Urgency sliders update LIVE while sliding
// - Updates username locally (settings.user.name) AND on backend
// - Adds Logout and permanent Delete Account buttons
// Assumes:
//   1) you have useAuth() that exposes { user, signOut } + user.getIdToken()
//   2) your backend has PATCH /api/users/me { name }
//   3) your backend has DELETE /api/users/:uid
//   4) you have API_BASE_URL set (env or constants)

import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useNavigation, useRouter } from "expo-router";
import i18next from "i18next";
import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  InteractionManager,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import {
  getCustomAiProviderSettings,
  normalizeAiBaseUrl,
  setCustomAiProviderSettings,
} from "../../api/aiProviderSettings";
import { resolveAiProvider } from "../../api/aiProviderPolicy";
import { API_BASE_URL } from "../../api/backendConfig";
import { fetchWithTimeout } from "../../api/fetchWithTimeout";
import { clearChatData } from "../../api/memoryManager";
import { requestReminderPermissions } from "../../api/reminderScheduler";
import {
  getAccountDeletionReauthenticationMethod,
  reauthenticateForAccountDeletion,
} from "../../auth/accountReauthentication";
import { useAuth } from "../../auth/useAuth";
import { HeaderWithHiddenButton } from "../../components/Header";
import { useAccountSession } from "../../context/AccountSessionContext";
import { ChatActionsContext, GlobalContext } from "../../context/GlobalContext";
import { useAppleSubscription } from "../../context/SubscriptionContext";
import { SUPPORTED_LANGUAGES, setAppLanguage } from "../../i18n";
import {
  getAppleIntelligenceAvailability,
  openAppleIntelligenceSettings,
} from "../../modules/apple-intelligence/src";

const { width } = Dimensions.get("window");

const APPLE_SUBSCRIPTIONS_URL =
  "https://apps.apple.com/account/subscriptions";
const TERMS_OF_USE_URL =
  String(process.env.EXPO_PUBLIC_TERMS_OF_USE_URL || "").trim() ||
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_POLICY_URL = String(
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || ""
).trim();
const LOCAL_AI_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const AI_PROVIDER_URLS = [
  { labelKey: "settings.providers.openai", value: "https://api.openai.com/v1" },
  {
    labelKey: "settings.providers.openrouter",
    value: "https://openrouter.ai/api/v1",
  },
  { labelKey: "settings.providers.groq", value: "https://api.groq.com/openai/v1" },
  {
    labelKey: "settings.providers.togetherAi",
    value: "https://api.together.xyz/v1",
  },
];

const APPLE_AI_UNSUPPORTED_STATUSES = new Set([
  "device_not_eligible",
  "unsupported_os",
  "unsupported_platform",
  "development_build_required",
]);

const APPLE_SUBSCRIPTION_STATUS_LABELS = {
  subscribed: "settings.subscriptionStatuses.active",
  active: "settings.subscriptionStatuses.active",
  in_grace_period: "settings.subscriptionStatuses.activeGracePeriod",
  grace_period: "settings.subscriptionStatuses.activeGracePeriod",
  in_billing_retry_period: "settings.subscriptionStatuses.billingIssue",
  billing_retry: "settings.subscriptionStatuses.billingIssue",
  expired: "settings.subscriptionStatuses.expired",
  revoked: "settings.subscriptionStatuses.revoked",
  not_subscribed: "settings.subscriptionStatuses.noActiveSubscription",
  loading: "settings.subscriptionStatuses.checking",
  unknown: "settings.subscriptionStatuses.unknown",
  development_build_required: "settings.subscriptionStatuses.requiresIosBuild",
  unsupported_platform: "settings.subscriptionStatuses.availableOnIos",
};

const APPLE_SUBSCRIPTION_ATTENTION_STATUSES = new Set([
  "in_billing_retry_period",
  "billing_retry",
  "expired",
  "revoked",
]);

const SETTINGS_CATEGORIES = [
  {
    key: "user",
    titleKey: "settings.categories.account",
    icon: "person-outline",
  },
  {
    key: "plan",
    titleKey: "settings.categories.planUsage",
    icon: "card-outline",
  },
  {
    key: "preferences",
    titleKey: "settings.categories.preferences",
    icon: "options-outline",
  },
  {
    key: "privacy",
    titleKey: "settings.categories.privacyData",
    icon: "shield-checkmark-outline",
  },
  {
    key: "advanced",
    titleKey: "settings.categories.aiProvider",
    icon: "construct-outline",
  },
];

const RECIPE_ENERGY_OPTIONS = [
  { value: "any", labelKey: "settings.energyOptions.any" },
  { value: "light", labelKey: "settings.energyOptions.light" },
  { value: "balanced", labelKey: "settings.energyOptions.balanced" },
  { value: "hearty", labelKey: "settings.energyOptions.hearty" },
];

function commaSeparatedList(value) {
  return (Array.isArray(value) ? value : []).join(", ");
}

function parsePreferenceList(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function PreferenceListEditor({
  label,
  help,
  value,
  onChange,
  placeholder,
  styles,
  theme,
}) {
  const storedValue = commaSeparatedList(value);
  const [draft, setDraft] = useState(storedValue);

  const commit = useCallback(() => {
    const next = parsePreferenceList(draft);
    setDraft(commaSeparatedList(next));
    onChange(next);
  }, [draft, onChange]);

  return (
    <View style={styles.settingColumn}>
      <Text style={styles.accountCardTitle}>{label}</Text>
      <Text style={styles.helpText}>{help}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.preferenceInput}
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder={placeholder}
        placeholderTextColor={theme.textPlaceholder}
        autoCapitalize="words"
        autoCorrect
        returnKeyType="done"
      />
    </View>
  );
}

function NumberPreferenceEditor({
  label,
  help,
  value,
  onChange,
  placeholder,
  minimum,
  maximum,
  allowEmpty = true,
  fallback = minimum,
  styles,
  theme,
}) {
  const storedValue = value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(storedValue);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed && allowEmpty) {
      setDraft("");
      onChange(null);
      return;
    }

    const parsed = Math.round(Number(trimmed));
    const next = Number.isFinite(parsed)
      ? Math.min(maximum, Math.max(minimum, parsed))
      : fallback;
    setDraft(String(next));
    onChange(next);
  }, [allowEmpty, draft, fallback, maximum, minimum, onChange]);

  return (
    <View style={styles.compactPreferenceField}>
      <Text style={styles.accountCardTitle}>{label}</Text>
      <Text style={styles.helpText}>{help}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.preferenceInput}
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder={placeholder}
        placeholderTextColor={theme.textPlaceholder}
        keyboardType="number-pad"
        inputMode="numeric"
        returnKeyType="done"
      />
    </View>
  );
}

function getSubscriptionStatusLabel(status) {
  const labelKey =
    APPLE_SUBSCRIPTION_STATUS_LABELS[status] ||
    "settings.subscriptionStatuses.unknown";
  return i18next.t(labelKey);
}

function getSubscriptionName(subscription) {
  if (subscription?.displayName) return subscription.displayName;
  if (!subscription?.productId) return null;

  const productName = subscription.productId.split(".").pop() || "";
  return productName
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSubscriptionDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

function formatQuotaCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return Math.max(0, Math.trunc(number)).toLocaleString();
}

function formatQuotaReset(value, timezone) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const options = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  };

  try {
    return date.toLocaleString(undefined, options);
  } catch {
    return date.toLocaleString();
  }
}

function planName(value) {
  const normalized = String(value || "free").trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const SIGN_IN_PROVIDER_LABELS = {
  "apple.com": "settings.signInProviders.apple",
  "google.com": "settings.signInProviders.google",
  password: "settings.signInProviders.emailAndPassword",
  phone: "settings.signInProviders.phone",
};

function accountEmail(user) {
  const directEmail = String(user?.email || "").trim();
  if (directEmail) return directEmail;

  const providerEmail = (user?.providerData || []).find((provider) =>
    String(provider?.email || "").trim()
  )?.email;
  return String(
    providerEmail || i18next.t("settings.notProvided")
  ).trim();
}

function emailDetail(user) {
  const email = accountEmail(user);
  return {
    email,
    note: /@privaterelay\.appleid\.com$/i.test(email)
      ? i18next.t("settings.privateRelay")
      : "",
  };
}

function signInMethods(user) {
  if (user?.isAnonymous) return i18next.t("settings.guest");

  const providerLabels = [...new Set(
    (user?.providerData || [])
      .map((provider) => String(provider?.providerId || "").trim().toLowerCase())
      .filter(Boolean)
      .map((providerId) =>
        (SIGN_IN_PROVIDER_LABELS[providerId]
          ? i18next.t(SIGN_IN_PROVIDER_LABELS[providerId])
          : null) ||
        (/^(oidc\.|saml\.)/.test(providerId)
          ? i18next.t("settings.organizationSso")
          : i18next.t("settings.otherProvider"))
      )
  )].sort();

  return providerLabels.length
    ? providerLabels.join(", ")
    : i18next.t("settings.signInProviders.signedIn");
}

function formatSubscriptionPeriod(period) {
  const value = Number(period?.value);
  const unit = String(period?.unit || "").toLowerCase();
  if (!Number.isFinite(value) || value <= 0 || !unit) return null;
  const normalizedUnit = value === 1 ? unit.replace(/s$/, "") : unit;
  return i18next.t("settings.planPeriod", {
    count: Math.trunc(value),
    unit: normalizedUnit,
  });
}

function validateCustomAiBaseUrl(value) {
  const normalized = normalizeAiBaseUrl(value);
  let parsed;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(i18next.t("settings.invalidApiBaseUrl"));
  }

  if (parsed.username || parsed.password) {
    throw new Error(i18next.t("settings.apiBaseUrlCredentials"));
  }

  if (parsed.search || parsed.hash) {
    throw new Error(i18next.t("settings.apiBaseUrlQuery"));
  }

  const localDevelopmentUrl =
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    parsed.protocol === "http:" &&
    LOCAL_AI_HOSTS.has(parsed.hostname.toLowerCase());

  if (parsed.protocol !== "https:" && !localDevelopmentUrl) {
    throw new Error(
      i18next.t("settings.apiBaseUrlMustBeHttps")
    );
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return normalizeAiBaseUrl(parsed.toString());
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const {
    settings,
    storageHydrated,
    storageOwnerUid,
    updateSetting,
    updateRecipePreferences,
    resetRecipePreferences,
    theme,
    clearAllData,

    // Urgency thresholds from GlobalContext
    urgencyDays,
    setUrgencyDays,
  } = useContext(GlobalContext);
  const {
    setMessages,
    setSummary,
    resetConversations,
  } = useContext(ChatActionsContext);

  const { user, signOut, loggedIn, deleteAccount } = useAuth();
  const {
    subscription,
    loading: subscriptionLoading,
    error: subscriptionError,
  } = useAppleSubscription();
  const {
    session: accountSession,
    entitlement,
    quota,
    model: accountModel,
    loading: accountSessionLoading,
    error: accountSessionError,
    apple,
    applePlans,
    appleProductsLoading,
    appleProductsError,
    accountOperation,
    appleOperation,
    appleError,
    refreshSession,
    purchaseApplePlan,
    restoreApplePurchases,
    refreshAppleSubscription,
    beginAccountTeardown,
  } = useAccountSession();

  const [currentSubMenu, setCurrentSubMenu] = useState(null);
  const [anim] = useState(() => new Animated.Value(0));
  const mountedRef = useRef(false);
  const navigation = useNavigation();
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [remindDays, setRemindDays] = useState(
    settings?.expiration?.remindDays ?? 5
  );
  const customUrgency = settings?.expiration?.customUrgency === true;
  const [fontSizeDraft, setFontSizeDraft] = useState(null);
  const displayedFontSize = fontSizeDraft ?? settings?.ux?.fontSize ?? 16;

  const [modalVisible, setModalVisible] = useState(false);
  const [tempName, setTempName] = useState(
    settings?.user?.name ?? "freeUser"
  );
  const [savingName, setSavingName] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletePasswordModalVisible, setDeletePasswordModalVisible] =
    useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showPlanDetails, setShowPlanDetails] = useState(false);
  const [showAvailablePlans, setShowAvailablePlans] = useState(false);
  const [showUrgencyThresholds, setShowUrgencyThresholds] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiProviderSettingsBaseUrl, setAiProviderSettingsBaseUrl] = useState(null);
  const configuredAiBaseUrl =
    settings?.advanced?.aiBaseUrl || "https://api.openai.com/v1";
  const configuredAiModel = settings?.advanced?.aiModel || "gpt-4o-mini";
  const [aiBaseUrlDraft, setAiBaseUrlDraft] = useState(null);
  const [aiModelDraft, setAiModelDraft] = useState(null);
  const [aiProviderSettingsRevision, setAiProviderSettingsRevision] = useState(0);
  const aiBaseUrl = aiBaseUrlDraft ?? configuredAiBaseUrl;
  const aiModel = aiModelDraft ?? configuredAiModel;
  const [aiProviderOpen, setAiProviderOpen] = useState(false);
  const aiProvider = resolveAiProvider(
    settings?.advanced?.aiProvider,
    settings?.advanced?.useCustomAi
  );
  const [savingAi, setSavingAi] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [appleAvailability, setAppleAvailability] = useState(null);
  const [checkingAppleAi, setCheckingAppleAi] = useState(false);

  const router = useRouter();
  const fontSize = settings?.ux?.fontSize ?? 16;
  const username = settings?.user?.name ?? "freeUser";
  const currentLanguageLabel =
    SUPPORTED_LANGUAGES.find(
      (lang) => lang.code === i18next.language
    )?.label ?? SUPPORTED_LANGUAGES[0].label;
  const recipePreferences = settings?.recipePreferences;
  const explicitRecipePreferences = recipePreferences?.explicit || {};
  const { email: signedInEmail, note: signedInEmailNote } = emailDetail(user);
  const signInMethodLabel = signInMethods(user);
  const subscriptionStatus = subscriptionLoading && !subscription?.checkedAt
    ? "loading"
    : subscription?.status;
  const subscriptionStatusLabel = getSubscriptionStatusLabel(
    subscriptionStatus
  );
  const subscriptionStatusColor = subscriptionStatus === "loading"
    ? theme.textSecondary
    : subscription?.isEntitled
      ? theme.accent
      : APPLE_SUBSCRIPTION_ATTENTION_STATUSES.has(subscriptionStatus)
        ? theme.danger
        : theme.textSecondary;
  const subscriptionName = getSubscriptionName(subscription);
  const subscriptionDate = formatSubscriptionDate(
    subscription?.expirationDate
  );
  const subscriptionPlanLabel = subscriptionName ||
    (subscriptionStatus === "loading"
      ? t("settings.lookingUpPlan")
      : t("settings.noPlanSelected"));
  const accountAccessStatusLabel = accountSessionLoading
    ? t("settings.checkingAccount")
    : accountSessionError && !accountSession
      ? t("settings.accessUnavailable")
    : entitlement?.active
      ? entitlement?.verified
        ? t("settings.verifiedAccess")
        : t("settings.reportedAccess")
      : t("settings.freeAccess");
  const accountAccessStatusColor = accountSessionLoading
    ? theme.textSecondary
    : accountSessionError && !accountSession
      ? theme.danger
    : entitlement?.active
      ? theme.accent
      : theme.textSecondary;
  const accountPlanLabel = accountSessionLoading
    ? t("settings.loadingPantrioAccess")
    : accountSessionError && !accountSession
      ? t("settings.couldNotLoadPantrioAccess")
      : t("settings.planSuffix", { plan: planName(entitlement?.plan) });
  const quotaReset = formatQuotaReset(quota?.resetsAt, quota?.timezone);
  const effectiveModel = accountModel?.effective || null;
  const applePurchasesAvailable =
    Platform.OS === "ios" &&
    apple?.enabled === true &&
    Boolean(apple?.appAccountToken);
  const appleBusy = Boolean(appleOperation);
  const accountBusy = Boolean(accountOperation);

  const stylesWithFont = useMemo(
    () => dynamicStyles(theme, fontSize),
    [theme, fontSize]
  );

  const updateExplicitRecipePreferences = useCallback(
    (patch) => updateRecipePreferences?.({ explicit: patch }),
    [updateRecipePreferences]
  );

  const confirmRecipePreferenceReset = useCallback(() => {
    Alert.alert(
      t("settings.resetRecipePreferencesAlertTitle"),
      t("settings.resetRecipePreferencesAlertMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.resetPreferencesButton"),
          style: "destructive",
          onPress: resetRecipePreferences,
        },
      ]
    );
  }, [resetRecipePreferences, t]);

  const setAiBaseUrl = useCallback((nextValue) => {
    setAiBaseUrlDraft((currentDraft) => {
      const currentValue = currentDraft ?? configuredAiBaseUrl;
      return typeof nextValue === "function"
        ? nextValue(currentValue)
        : nextValue;
    });
  }, [configuredAiBaseUrl]);

  const normalizedAiBaseUrl = normalizeAiBaseUrl(aiBaseUrl);
  const normalizedConfiguredAiBaseUrl = normalizeAiBaseUrl(configuredAiBaseUrl);
  const loadingAiProviderSettings =
    !storageHydrated || aiProviderSettingsBaseUrl !== normalizedAiBaseUrl;

  const aiProviderItems = useMemo(() => {
    const normalizedUrl = normalizeAiBaseUrl(aiBaseUrl);
    const translatedDefaults = AI_PROVIDER_URLS.map((item) => ({
      label: t(item.labelKey),
      value: item.value,
    }));
    if (
      !normalizedUrl ||
      AI_PROVIDER_URLS.some((item) => item.value === normalizedUrl)
    ) {
      return translatedDefaults;
    }
    return [
      {
        label: t("settings.providers.custom", { url: normalizedUrl }),
        value: normalizedUrl,
      },
      ...translatedDefaults,
    ];
  }, [aiBaseUrl, t]);

  useEffect(() => {
    if (!storageHydrated) return undefined;

    let active = true;

    getCustomAiProviderSettings(storageOwnerUid, normalizedAiBaseUrl, {
      migrateLegacy: normalizedAiBaseUrl === normalizedConfiguredAiBaseUrl,
      fallbackModel:
        normalizedAiBaseUrl === normalizedConfiguredAiBaseUrl
          ? configuredAiModel
          : "",
    })
      .then((savedSettings) => {
        if (!active) return;
        setAiApiKey(savedSettings.apiKey);
        setAiModelDraft(savedSettings.model);
        setAiProviderSettingsBaseUrl(normalizedAiBaseUrl);
      })
      .catch(() => {
        if (!active) return;
        setAiApiKey("");
        setAiModelDraft("");
        setAiProviderSettingsBaseUrl(normalizedAiBaseUrl);
      });

    return () => {
      active = false;
    };
  }, [
    normalizedAiBaseUrl,
    normalizedConfiguredAiBaseUrl,
    configuredAiModel,
    aiProviderSettingsRevision,
    storageHydrated,
    storageOwnerUid,
  ]);

  const checkAppleAi = useCallback(async () => {
    if (mountedRef.current) setCheckingAppleAi(true);
    try {
      const availability = await getAppleIntelligenceAvailability();
      if (mountedRef.current) setAppleAvailability(availability);
      return availability;
    } finally {
      if (mountedRef.current) setCheckingAppleAi(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    getAppleIntelligenceAvailability().then((availability) => {
      if (!active) return;
      setAppleAvailability(availability);
      if (
        aiProvider === "apple" &&
        APPLE_AI_UNSUPPORTED_STATUSES.has(availability.status)
      ) {
        updateSetting("advanced", "aiProvider", "pantrio");
        updateSetting("advanced", "useCustomAi", false);
      }
    });

    return () => {
      active = false;
    };
  }, [aiProvider, updateSetting]);

  const selectAiProvider = async (nextProvider) => {
    if (nextProvider === "apple") {
      const availability = await checkAppleAi();
      if (!mountedRef.current) return;

      if (!availability.available) {
        if (availability.status === "not_enabled") {
          Alert.alert(
            t("settings.turnOnAppleIntelligenceAlertTitle"),
            t("settings.turnOnAppleIntelligenceAlertMessage", {
              reason: availability.reason,
            }),
            [
              { text: t("common.notNow"), style: "cancel" },
              {
                text: t("common.openSettings"),
                onPress: openAppleIntelligenceSettings,
              },
            ]
          );
        } else {
          Alert.alert(
            t("settings.appleIntelligenceUnavailable"),
            availability.reason
          );
        }
        return;
      }
    }

    updateSetting("advanced", "aiProvider", nextProvider);
    updateSetting("advanced", "useCustomAi", nextProvider === "custom");
  };

  const saveAiProvider = async () => {
    let baseUrl;
    try {
      baseUrl = validateCustomAiBaseUrl(aiBaseUrl);
    } catch (error) {
      Alert.alert(
        t("settings.invalidUrl"),
        error?.message || t("settings.enterValidHttpsUrl")
      );
      return;
    }
    const model = aiModel.trim();
    if (!model || !aiApiKey.trim()) {
      Alert.alert(
        t("settings.missingDetails"),
        t("settings.missingDetailsMessage")
      );
      return;
    }

    setSavingAi(true);
    try {
      await setCustomAiProviderSettings(storageOwnerUid, baseUrl, {
        apiKey: aiApiKey,
        model,
      });
      if (!mountedRef.current) return;
      updateSetting("advanced", "aiBaseUrl", baseUrl);
      updateSetting("advanced", "aiModel", model);
      Alert.alert(
        t("settings.savedAlertTitle"),
        t("settings.savedAlertMessage")
      );
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          t("settings.saveFailed"),
          error?.message || t("settings.couldNotSaveAiSettings")
        );
      }
    } finally {
      if (mountedRef.current) setSavingAi(false);
    }
  };

  const testAiProvider = async () => {
    if (testingAi) return;

    let baseUrl;
    try {
      baseUrl = validateCustomAiBaseUrl(aiBaseUrl);
    } catch (error) {
      Alert.alert(
        t("settings.invalidUrl"),
        error?.message || t("settings.enterValidHttpsUrl")
      );
      return;
    }

    const model = aiModel.trim();
    const apiKey = aiApiKey.trim();
    if (!model || !apiKey) {
      Alert.alert(
        t("settings.missingDetails"),
        t("settings.missingDetailsTestMessage")
      );
      return;
    }

    setTestingAi(true);
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: "Reply with only OK.",
              },
            ],
          }),
        },
        {
          timeoutMs: 20_000,
          timeoutMessage: t("settings.connectionTestTimedOut"),
        }
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const providerMessage = String(
          data?.error?.message || data?.message || ""
        ).trim();
        throw new Error(
          providerMessage
            ? providerMessage.slice(0, 300)
            : response.status === 404
              ? t("settings.noChatCompletionsEndpoint")
              : t("settings.providerRejected", {
                  status: response.status,
                })
        );
      }
      const responseContent = data?.choices?.[0]?.message?.content;
      const responseText = typeof responseContent === "string"
        ? responseContent
        : Array.isArray(responseContent)
          ? responseContent.map((part) => part?.text || "").join("")
          : "";
      if (!responseText.trim()) {
        throw new Error(t("settings.providerUnexpectedResponse"));
      }
      if (!mountedRef.current) return;

      const providerHost = new URL(baseUrl).hostname;
      Alert.alert(
        t("settings.connectionSuccessful"),
        t("settings.connectionSuccessfulMessage", { host: providerHost })
      );
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          t("settings.connectionFailed"),
          error?.message || t("settings.aiProviderUnreachable")
        );
      }
    } finally {
      if (mountedRef.current) setTestingAi(false);
    }
  };

  const handleClearAllData = async () => {
    try {
      const result = await Promise.resolve(clearAllData?.());
      if (!mountedRef.current) return;
      setAiApiKey("");
      setAiBaseUrlDraft(null);
      setAiModelDraft(null);
      setAiProviderSettingsBaseUrl(null);
      setAiProviderSettingsRevision((revision) => revision + 1);
      if (!result || result.ok !== true) {
        Alert.alert(
          t("settings.cleanupIncomplete"),
          t("settings.cleanupIncompleteMessage")
        );
      }
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          t("settings.cleanupIncomplete"),
          error?.message || t("settings.cleanupIncompleteMessage")
        );
      }
    }
  };

  const updateReminderToggle = async (section, key, enabled) => {
    if (!enabled) {
      updateSetting(section, key, false);
      return;
    }

    try {
      const granted = await requestReminderPermissions();
      if (!mountedRef.current) return;
      if (!granted) {
        updateSetting(section, key, false);
        Alert.alert(
          t("settings.notificationsOff"),
          t("settings.notificationsOffMessage"),
          [
            { text: t("common.notNow"), style: "cancel" },
            {
              text: t("common.openSettings"),
              onPress: () => Linking.openSettings().catch(() => {}),
            },
          ]
        );
        return;
      }

      updateSetting("notifications", "reminderPermissionRequested", true);
      updateSetting(section, key, true);
    } catch (error) {
      if (!mountedRef.current) return;
      updateSetting(section, key, false);
      Alert.alert(
        t("settings.couldNotEnableReminders"),
        error?.message || t("settings.notificationPermissionFailed")
      );
    }
  };

  async function updateUsernameOnBackend(name) {
    if (!user) {
      throw new Error(t("settings.notLoggedIn"));
    }

    const token = await user.getIdToken();

    const resp = await fetchWithTimeout(
      `${API_BASE_URL}/api/users/me`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      },
      { timeoutMessage: t("settings.usernameUpdateTimedOut") }
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        text ||
          t("settings.updateNameFailed", {
            status: resp.status,
          })
      );
    }

    return resp.json().catch(() => ({}));
  }

  const openUsernameEditor = () => {
    setTempName(username);
    setModalVisible(true);
  };

  const saveName = async () => {
    const next = String(tempName || "").trim();

    if (!next) {
      Alert.alert(t("settings.nameRequired"), t("settings.nameRequiredMessage"));
      return;
    }

    setSavingName(true);

    // Update locally immediately.
    const prev = settings?.user?.name ?? "freeUser";
    updateSetting("user", "name", next);

    try {
      // Update backend.
      const updatedProfile = await updateUsernameOnBackend(next);
      const confirmedName = updatedProfile?.username || next;
      const firstRefresh = await refreshSession({ maxAgeMs: 0 }).catch(() => null);
      if (firstRefresh?.user?.username !== confirmedName) {
        await refreshSession({ maxAgeMs: 0 }).catch(() => null);
      }
      if (mountedRef.current) {
        updateSetting("user", "name", confirmedName);
        setModalVisible(false);
      }
    } catch (e) {
      if (!mountedRef.current) return;
      // Roll back local username if backend update fails.
      updateSetting("user", "name", prev);

      Alert.alert(
        t("settings.updateFailed"),
        e?.message || t("settings.couldNotUpdateUsername")
      );
    } finally {
      if (mountedRef.current) setSavingName(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t("settings.logOutAlertTitle"), t("settings.logOutAlertMessage"), [
      {
        text: t("common.cancel"),
        style: "cancel",
      },
      {
        text: t("common.logOut"),
        style: "destructive",
        onPress: () => {
          // Let iOS dismiss its native alert window before auth removes the
          // active tabs/native-stack hierarchy underneath it.
          InteractionManager.runAfterInteractions(() => {
            requestAnimationFrame(() => {
              if (!mountedRef.current || !user) return;

              void (async () => {
                let releaseAccountOperation = null;
                try {
                  releaseAccountOperation = beginAccountTeardown("logout");
                  const result = await signOut?.();
                  if (result?.providerCleanupError) {
                    console.warn(
                      "[logout] native provider cleanup warning",
                      result.providerCleanupError
                    );
                  }
                } catch (e) {
                  if (mountedRef.current) {
                    Alert.alert(
                      e?.code === "ACCOUNT_OPERATION_IN_PROGRESS"
                        ? t("settings.actionInProgress")
                        : t("settings.logoutFailed"),
                      e?.message || t("settings.couldNotLogOut")
                    );
                  }
                } finally {
                  releaseAccountOperation?.();
                }
              })();
            });
          });
        },
      },
    ]);
  };

  const openAppleSubscriptions = async () => {
    try {
      await Linking.openURL(APPLE_SUBSCRIPTIONS_URL);
    } catch (error) {
      Alert.alert(
        t("settings.couldNotOpenSubscriptions"),
        error?.message || t("settings.openSubscriptionsHint")
      );
    }
  };

  const openLegalDocument = async (url, title) => {
    try {
      await Linking.openURL(url);
    } catch (nextError) {
      Alert.alert(
        t("settings.couldNotOpenTitle", { title }),
        nextError?.message || t("settings.openInBrowser", { title })
      );
    }
  };

  const handlePurchaseApplePlan = async (plan) => {
    if (!plan?.productId || appleBusy) return;

    try {
      const result = await purchaseApplePlan(plan.productId);
      if (!mountedRef.current) return;
      if (result?.outcome === "cancelled") return;
      if (result?.outcome === "pending") {
        Alert.alert(
          t("settings.purchasePending"),
          t("settings.purchasePendingMessage")
        );
        return;
      }
      if (result?.outcome === "purchased") {
        Alert.alert(
          t("settings.subscriptionActive"),
          t("settings.subscriptionActiveMessage")
        );
      }
    } catch (nextError) {
      if (!mountedRef.current || nextError?.code === "APPLE_REQUEST_SUPERSEDED") {
        return;
      }
      Alert.alert(
        t("settings.purchaseNotCompleted"),
        nextError?.message || t("settings.couldNotCompleteApplePurchase")
      );
    }
  };

  const handleRestoreApplePurchases = async () => {
    if (appleBusy) return;

    try {
      const result = await restoreApplePurchases();
      if (!mountedRef.current) return;
      if (result?.verification || result?.evidence?.length) {
        Alert.alert(
          t("settings.purchasesRestored"),
          t("settings.purchasesRestoredMessage")
        );
      } else {
        Alert.alert(
          t("settings.noPurchasesFound"),
          t("settings.noPurchasesFoundMessage")
        );
      }
    } catch (nextError) {
      if (!mountedRef.current || nextError?.code === "APPLE_REQUEST_SUPERSEDED") {
        return;
      }
      Alert.alert(
        t("settings.restoreFailed"),
        nextError?.message || t("settings.couldNotRestorePurchases")
      );
    }
  };

  const handleRefreshAppleSubscription = async () => {
    if (appleBusy) return;

    try {
      await refreshAppleSubscription();
    } catch (nextError) {
      if (!mountedRef.current || nextError?.code === "APPLE_REQUEST_SUPERSEDED") {
        return;
      }
      Alert.alert(
        t("settings.refreshFailed"),
        nextError?.message || t("settings.couldNotRefreshSubscription")
      );
    }
  };

  const performAccountDeletion = async ({ password } = {}) => {
    if (!user || deletingAccount) return;

    let releaseAccountOperation = null;
    let deletionCoordinatorStarted = false;
    try {
      setDeletingAccount(true);
      releaseAccountOperation = beginAccountTeardown("delete-account");

      if (
        !storageHydrated ||
        !user.uid ||
        storageOwnerUid !== user.uid
      ) {
        throw new Error(
          t("settings.localDataStillLoading")
        );
      }

      // Firebase and the backend both require recent authentication for this
      // destructive operation. Apple confirmation also gives the backend one
      // final fresh authorization code if the original link was interrupted.
      await reauthenticateForAccountDeletion(user, { password });
      deletionCoordinatorStarted = true;
      await deleteAccount();
    } catch (error) {
      // Once deleteAccount starts, AuthProvider owns errors because this screen
      // is intentionally unmounted by the root teardown guard.
      if (mountedRef.current && !deletionCoordinatorStarted) {
        Alert.alert(
          error?.code === "auth/wrong-password" ||
            error?.code === "auth/invalid-credential"
            ? t("settings.passwordNotAccepted")
            : t("settings.couldNotConfirmDeletion"),
          error?.message || t("settings.retryDeletionHint")
        );
      }
    } finally {
      releaseAccountOperation?.();
      if (mountedRef.current) {
        setDeletingAccount(false);
        setDeletePassword("");
        setDeletePasswordModalVisible(false);
      }
    }
  };

  const handleDeleteAccount = () => {
    if (!user || deletingAccount) return;

    Alert.alert(
      t("settings.deleteAccountAlertTitle"),
      t("settings.deleteAccountAlertMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.continue"),
          style: "destructive",
          onPress: () => {
            void getAccountDeletionReauthenticationMethod(user)
              .then((method) => {
                if (!mountedRef.current) return;
                if (method === "password") {
                  setDeletePassword("");
                  setDeletePasswordModalVisible(true);
                  return;
                }
                void performAccountDeletion();
              })
              .catch((error) => {
                if (mountedRef.current) {
                  Alert.alert(
                    t("settings.couldNotConfirmSignIn"),
                    error?.message || t("settings.trySigningInAgain")
                  );
                }
              });
          },
        },
      ]
    );
  };

  const openSubMenu = (key) => {
    setCurrentSubMenu(key);
    setOpened(true);

    Animated.timing(anim, {
      toValue: -width,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const goBack = useCallback(() => {
    setOpened(false);

    Animated.timing(anim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setCurrentSubMenu(null));
  }, [anim]);

  const currentMenuCategory = SETTINGS_CATEGORIES.find(
    (category) => category.key === currentSubMenu
  );
  const currentMenuTitle = currentMenuCategory
    ? t(currentMenuCategory.titleKey)
    : t("tabs.settings");

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <HeaderWithHiddenButton
          title={opened ? currentMenuTitle : t("tabs.settings")}
          hideButton={!opened}
          onPress={goBack}
        />
      ),
    });
  }, [currentMenuTitle, goBack, navigation, opened, t, theme]);

  const CustomButton = ({
    title,
    onPress,
    fontSize: buttonFontSize,
    color,
  }) => (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !onPress }}
      style={{
        borderRadius: 12,
        marginTop: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: color ? `${color}18` : theme.actionButton,
        borderWidth: color ? StyleSheet.hairlineWidth : 0,
        borderColor: color || "transparent",
      }}
      disabled={!onPress}
    >
      <Text
        style={{
          fontSize: buttonFontSize,
          color: color || theme.actionButtonText || "#ffffff",
          fontWeight: "700",
          opacity: onPress ? 1 : 0.6,
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );

  const renderMainMenu = () => (
    <ScrollView
      style={stylesWithFont.menuPanel}
      contentContainerStyle={stylesWithFont.mainMenu}
      showsVerticalScrollIndicator={false}
    >
      {SETTINGS_CATEGORIES.map((cat) => (
        <TouchableOpacity
          key={cat.key}
          style={stylesWithFont.sectionHeader}
          onPress={() => openSubMenu(cat.key)}
          accessibilityRole="button"
          accessibilityLabel={t(cat.titleKey)}
          accessibilityHint={t("settings.categoryA11y", {
            title: t(cat.titleKey),
          })}
        >
          <View style={stylesWithFont.sectionIcon}>
            <Ionicons name={cat.icon} size={fontSize * 1.25} color={theme.accent} />
          </View>

          <Text style={stylesWithFont.sectionTitle}>
            {t(cat.titleKey)}
          </Text>

          <Ionicons
            name="chevron-forward"
            size={fontSize * 1.25}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // Urgency sliders: live update during sliding and monotonic clamp on release.
  const renderUrgencySliders = () => {
    const fallback = {
      expired: 0,
      eat_first: 2,
      use_soon: 7,
      lasts_a_while: 30,
      long_keeper: 180,
    };

    const U = urgencyDays || fallback;

    // Live updates during drag.
    const setLive = (key, val) => {
      const v = Number(val);

      setUrgencyDays((prev) => ({
        ...(prev || U || fallback),
        expired: 0,
        [key]: v,
      }));
    };

    // Clamp and enforce monotonic ordering after release.
    const setMonotonic = (patchFn) => {
      setUrgencyDays((prev) => {
        const cur = prev || U || fallback;
        const next = patchFn(cur);

        const eat_first = Math.max(
          1,
          Number(next.eat_first ?? cur.eat_first ?? 2)
        );

        const use_soon = Math.max(
          eat_first,
          Number(next.use_soon ?? cur.use_soon ?? 7)
        );

        const lasts_a_while = Math.max(
          use_soon,
          Number(
            next.lasts_a_while ?? cur.lasts_a_while ?? 30
          )
        );

        const long_keeper = Math.max(
          lasts_a_while,
          Number(next.long_keeper ?? cur.long_keeper ?? 180)
        );

        return {
          expired: 0,
          eat_first,
          use_soon,
          lasts_a_while,
          long_keeper,
        };
      });
    };

    return (
      <View style={stylesWithFont.settingColumn}>
        <Text
          style={[
            stylesWithFont.label,
            {
              fontWeight: "700",
              marginBottom: 10,
            },
          ]}
        >
          {t("settings.urgencyThresholdsTitle")}
        </Text>

        <View style={{ marginBottom: 12 }}>
          <Text style={stylesWithFont.label}>
            {t("settings.expiredDays")}
          </Text>

          <Text
            style={[
              stylesWithFont.value,
              {
                marginTop: 4,
              },
            ]}
          >
            {t("settings.autoWhenExpired")}
          </Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={stylesWithFont.label}>
            {t("settings.eatFirstLabel")} {U.eat_first} {t("settings.daysUnit")}
          </Text>

          <Slider
            style={{ width: "100%" }}
            value={U.eat_first}
            onValueChange={(val) => setLive("eat_first", val)}
            onSlidingComplete={(val) =>
              setMonotonic((cur) => ({
                ...cur,
                eat_first: val,
              }))
            }
            minimumValue={1}
            maximumValue={14}
            step={1}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.border}
          />
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={stylesWithFont.label}>
            {t("settings.useSoonLabel")} {U.use_soon} {t("settings.daysUnit")}
          </Text>

          <Slider
            style={{ width: "100%" }}
            value={U.use_soon}
            onValueChange={(val) => setLive("use_soon", val)}
            onSlidingComplete={(val) =>
              setMonotonic((cur) => ({
                ...cur,
                use_soon: val,
              }))
            }
            minimumValue={2}
            maximumValue={30}
            step={1}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.border}
          />
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={stylesWithFont.label}>
            {t("settings.lastsWhileLabel")} {U.lasts_a_while}{" "}
            {t("settings.daysUnit")}
          </Text>

          <Slider
            style={{ width: "100%" }}
            value={U.lasts_a_while}
            onValueChange={(val) =>
              setLive("lasts_a_while", val)
            }
            onSlidingComplete={(val) =>
              setMonotonic((cur) => ({
                ...cur,
                lasts_a_while: val,
              }))
            }
            minimumValue={7}
            maximumValue={90}
            step={1}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.border}
          />
        </View>

        <View style={{ marginBottom: 4 }}>
          <Text style={stylesWithFont.label}>
            {t("settings.longKeeperLabel")} {U.long_keeper}{" "}
            {t("settings.daysUnit")}
          </Text>

          <Slider
            style={{ width: "100%" }}
            value={U.long_keeper}
            onValueChange={(val) => setLive("long_keeper", val)}
            onSlidingComplete={(val) =>
              setMonotonic((cur) => ({
                ...cur,
                long_keeper: val,
              }))
            }
            minimumValue={30}
            maximumValue={365}
            step={5}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.border}
          />
        </View>
      </View>
    );
  };

  const renderSubMenu = (key) => {
    switch (key) {
      case "user":
      case "plan":
        return (
          <View style={stylesWithFont.subMenu}>
            {key === "user" ? (
              <>
            <TouchableOpacity
              style={stylesWithFont.settingRow}
              activeOpacity={0.75}
              onPress={openUsernameEditor}
              accessibilityRole="button"
              accessibilityLabel={t("settings.editUsernameA11y", {
                username,
              })}
            >
              <View style={stylesWithFont.sectionIcon}>
                <Ionicons
                  name="person-outline"
                  size={fontSize * 1.25}
                  color={theme.accent}
                />
              </View>
              <View style={stylesWithFont.accountCardCopy}>
                <Text style={stylesWithFont.accountFieldLabel}>
                  {t("settings.username")}
                </Text>
                <Text
                  style={stylesWithFont.accountValue}
                  numberOfLines={1}
                >
                  {username}
                </Text>
              </View>
              <View style={stylesWithFont.accountEditAction}>
                <Ionicons
                  name="create-outline"
                  size={Math.max(16, fontSize)}
                  color={theme.accent}
                />
                <Text style={stylesWithFont.accountEditText}>
                  {t("common.edit")}
                </Text>
              </View>
            </TouchableOpacity>

            {loggedIn ? (
              <View style={stylesWithFont.settingColumn}>
                <View style={stylesWithFont.accountCardHeader}>
                  <View style={stylesWithFont.sectionIcon}>
                    <Ionicons
                      name="mail-outline"
                      size={fontSize * 1.25}
                      color={theme.accent}
                    />
                  </View>
                  <View style={stylesWithFont.accountCardCopy}>
                    <Text style={stylesWithFont.accountCardTitle}>
                      {t("settings.signInDetails")}
                    </Text>
                    <Text style={stylesWithFont.accountCardSubtitle}>
                      {t("settings.signInDetailsBody")}
                    </Text>
                  </View>
                </View>
                <View style={stylesWithFont.subscriptionDetails}>
                  <View style={stylesWithFont.subscriptionDetailRow}>
                    <Text style={stylesWithFont.subscriptionDetailLabel}>
                      {t("settings.email")}
                    </Text>
                    <Text
                      style={stylesWithFont.subscriptionDetailValue}
                    >
                      {signedInEmail}
                      {signedInEmailNote ? `\n${signedInEmailNote}` : ""}
                    </Text>
                  </View>
                  <View style={stylesWithFont.subscriptionDetailRow}>
                    <Text style={stylesWithFont.subscriptionDetailLabel}>
                      {t("settings.signInMethods")}
                    </Text>
                    <Text style={stylesWithFont.subscriptionDetailValue}>
                      {signInMethodLabel}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
              </>
            ) : null}

            {key === "plan" ? (
              <>
            <View style={stylesWithFont.settingColumn}>
              <View style={stylesWithFont.accountCardHeader}>
                <View style={stylesWithFont.sectionIcon}>
                  <Ionicons
                    name="card-outline"
                    size={fontSize * 1.25}
                    color={theme.accent}
                  />
                </View>
                <View style={stylesWithFont.accountCardCopy}>
                  <Text style={stylesWithFont.accountCardTitle}>
                    {t("settings.currentPlan")}
                  </Text>
                  <Text style={stylesWithFont.accountCardSubtitle}>
                    {t("settings.currentPlanBody")}
                  </Text>
                </View>
                {accountSessionLoading ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : null}
              </View>

              <View style={stylesWithFont.subscriptionCard}>
                <View
                  style={[
                    stylesWithFont.subscriptionStatusBadge,
                    { borderColor: accountAccessStatusColor },
                  ]}
                >
                  <View
                    style={[
                      stylesWithFont.subscriptionStatusDot,
                      { backgroundColor: accountAccessStatusColor },
                    ]}
                  />
                  <Text
                    style={[
                      stylesWithFont.subscriptionStatusText,
                      { color: accountAccessStatusColor },
                    ]}
                  >
                    {accountAccessStatusLabel}
                  </Text>
                </View>

                <Text style={stylesWithFont.subscriptionPlan}>
                  {accountPlanLabel}
                </Text>

                {!accountSessionLoading && quota ? (
                  <View style={stylesWithFont.subscriptionDetails}>
                    <View style={stylesWithFont.subscriptionDetailRow}>
                      <Text style={stylesWithFont.subscriptionDetailLabel}>
                        {t("settings.dailyAiAllowance")}
                      </Text>
                      <Text style={stylesWithFont.subscriptionDetailValue}>
                        {quota.applies
                          ? t("settings.tokensLeft", {
                              used: formatQuotaCount(quota.remaining),
                              limit: formatQuotaCount(quota.limit),
                            })
                          : t("settings.noDailyQuota")}
                      </Text>
                    </View>
                    {quota.applies && quotaReset ? (
                      <View style={stylesWithFont.subscriptionDetailRow}>
                        <Text style={stylesWithFont.subscriptionDetailLabel}>
                          {t("settings.resets")}
                        </Text>
                        <Text style={stylesWithFont.subscriptionDetailValue}>
                          {quotaReset}
                          {quota.timezone
                            ? t("settings.resetsTimezoneSuffix", {
                                timezone: quota.timezone,
                              })
                            : ""}
                        </Text>
                      </View>
                    ) : null}
                    {entitlement?.active && subscriptionDate ? (
                      <View style={stylesWithFont.subscriptionDetailRow}>
                        <Text style={stylesWithFont.subscriptionDetailLabel}>
                          {subscription?.willAutoRenew
                            ? t("settings.nextRenewal")
                            : t("settings.accessUntil")}
                        </Text>
                        <Text style={stylesWithFont.subscriptionDetailValue}>
                          {subscriptionDate}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {accountSessionError ? (
                  <>
                    <View style={stylesWithFont.subscriptionErrorRow}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={Math.max(16, fontSize)}
                        color={theme.danger}
                      />
                      <Text style={stylesWithFont.subscriptionError}>
                        {accountSessionError}
                      </Text>
                    </View>
                    <CustomButton
                      title={
                        accountSessionLoading
                          ? t("settings.retrying")
                          : t("settings.retryAccountCheck")
                      }
                      onPress={
                        accountSessionLoading
                          ? null
                          : () => refreshSession().catch(() => {})
                      }
                      fontSize={fontSize}
                      color={theme.accent}
                    />
                  </>
                ) : null}
              </View>
              {entitlement?.active || subscription?.productId ? (
                <CustomButton
                  title={t("settings.manageAppleSubscription")}
                  onPress={openAppleSubscriptions}
                  fontSize={fontSize}
                  color={theme.accent}
                />
              ) : null}
              {Platform.OS === "ios" ? (
                <CustomButton
                  title={
                    appleOperation === "restore"
                      ? t("settings.restoringPurchases")
                      : t("settings.restorePurchases")
                  }
                  onPress={
                    applePurchasesAvailable && !appleBusy
                      ? handleRestoreApplePurchases
                      : null
                  }
                  fontSize={fontSize}
                  color={theme.accent}
                />
              ) : null}
              <Text style={stylesWithFont.subscriptionFootnote}>
                {t("settings.paidAccessEnabled")}
              </Text>
            </View>

            <View style={stylesWithFont.settingColumn}>
              <TouchableOpacity
                style={stylesWithFont.disclosureRow}
                onPress={() => setShowPlanDetails((visible) => !visible)}
                accessibilityRole="button"
                accessibilityLabel={t("settings.technicalDetailsA11y")}
                accessibilityState={{ expanded: showPlanDetails }}
              >
                <View style={stylesWithFont.sectionIcon}>
                  <Ionicons
                    name="information-circle-outline"
                    size={fontSize * 1.25}
                    color={theme.accent}
                  />
                </View>
                <View style={stylesWithFont.accountCardCopy}>
                  <Text style={stylesWithFont.accountCardTitle}>
                    {t("settings.technicalDetails")}
                  </Text>
                  <Text style={stylesWithFont.accountCardSubtitle}>
                    {t("settings.technicalDetailsBody")}
                  </Text>
                </View>
                <Ionicons
                  name={showPlanDetails ? "chevron-up" : "chevron-down"}
                  size={fontSize * 1.1}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>

              {showPlanDetails ? (
                <>
              <View style={stylesWithFont.subscriptionCard}>
                <View
                  style={[
                    stylesWithFont.subscriptionStatusBadge,
                    { borderColor: subscriptionStatusColor },
                  ]}
                >
                  <View
                    style={[
                      stylesWithFont.subscriptionStatusDot,
                      { backgroundColor: subscriptionStatusColor },
                    ]}
                  />
                  <Text
                    style={[
                      stylesWithFont.subscriptionStatusText,
                      { color: subscriptionStatusColor },
                    ]}
                  >
                    {subscriptionStatusLabel}
                  </Text>
                </View>

                <Text style={stylesWithFont.subscriptionPlan}>
                  {subscriptionPlanLabel}
                </Text>

                <View style={stylesWithFont.subscriptionDetails}>
                  <View style={stylesWithFont.subscriptionDetailRow}>
                    <Text style={stylesWithFont.subscriptionDetailLabel}>
                      {t("settings.accessVerification")}
                    </Text>
                    <Text style={stylesWithFont.subscriptionDetailValue}>
                      {entitlement?.active
                        ? entitlement?.verified
                          ? t("settings.serverVerified")
                          : t("settings.storeKitUnverified")
                        : t("settings.freeAccess")}
                    </Text>
                  </View>
                  {effectiveModel ? (
                    <View style={stylesWithFont.subscriptionDetailRow}>
                      <Text style={stylesWithFont.subscriptionDetailLabel}>
                        {t("settings.aiModel")}
                      </Text>
                      <Text style={stylesWithFont.subscriptionDetailValue}>
                        {effectiveModel}
                      </Text>
                    </View>
                  ) : null}
                  {subscription?.productId ? (
                    <>
                    <View style={stylesWithFont.subscriptionDetailRow}>
                      <Text style={stylesWithFont.subscriptionDetailLabel}>
                        {t("settings.appleProduct")}
                      </Text>
                      <Text
                        style={stylesWithFont.subscriptionDetailValue}
                        numberOfLines={2}
                      >
                        {subscription.productId}
                      </Text>
                    </View>
                    <View style={stylesWithFont.subscriptionDetailRow}>
                      <Text style={stylesWithFont.subscriptionDetailLabel}>
                        {t("settings.renewal")}
                      </Text>
                      <Text style={stylesWithFont.subscriptionDetailValue}>
                        {subscription?.willAutoRenew
                          ? t("settings.renewsAutomatically")
                          : t("settings.willNotRenew")}
                      </Text>
                    </View>
                    {subscriptionDate ? (
                      <View style={stylesWithFont.subscriptionDetailRow}>
                        <Text style={stylesWithFont.subscriptionDetailLabel}>
                          {subscription?.willAutoRenew
                            ? t("settings.nextRenewal")
                            : t("settings.accessUntil")}
                        </Text>
                        <Text style={stylesWithFont.subscriptionDetailValue}>
                          {subscriptionDate}
                        </Text>
                      </View>
                    ) : null}
                    </>
                  ) : null}
                </View>

                {subscriptionError ? (
                  <View style={stylesWithFont.subscriptionErrorRow}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={Math.max(16, fontSize)}
                      color={theme.danger}
                    />
                    <Text style={stylesWithFont.subscriptionError}>
                      {subscriptionError}
                    </Text>
                  </View>
                ) : null}

                {appleError ? (
                  <View style={stylesWithFont.subscriptionErrorRow}>
                    <Ionicons
                      name="cloud-offline-outline"
                      size={Math.max(16, fontSize)}
                      color={theme.danger}
                    />
                    <Text style={stylesWithFont.subscriptionError}>
                      {appleError}
                    </Text>
                  </View>
                ) : null}
              </View>

              <CustomButton
                title={
                  appleOperation === "refresh"
                    ? t("settings.refreshingSubscription")
                    : t("settings.refreshSubscriptionStatus")
                }
                onPress={
                  applePurchasesAvailable && !appleBusy
                    ? handleRefreshAppleSubscription
                    : null
                }
                fontSize={fontSize}
                color={theme.accent}
              />
                </>
              ) : null}

              {entitlement?.active ? (
                <TouchableOpacity
                  style={stylesWithFont.planDisclosure}
                  onPress={() => setShowAvailablePlans((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.availablePlansA11y")}
                  accessibilityState={{ expanded: showAvailablePlans }}
                >
                  <Text style={stylesWithFont.accountCardTitle}>
                    {t("settings.viewOrChangePlans")}
                  </Text>
                  <Ionicons
                    name={showAvailablePlans ? "chevron-up" : "chevron-down"}
                    size={fontSize * 1.1}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>
              ) : (
                <Text style={stylesWithFont.accountInputLabel}>
                  {t("settings.availablePlans")}
                </Text>
              )}

              {!entitlement?.active || showAvailablePlans ? (
                <>
              {appleProductsLoading && !applePlans.length ? (
                <View style={stylesWithFont.accountActivity}>
                  <ActivityIndicator color={theme.accent} />
                </View>
              ) : null}
              {!appleProductsLoading && !applePlans.length ? (
                <Text style={stylesWithFont.helpText}>
                  {apple?.enabled === false
                    ? t("settings.appleNotConfigured")
                    : t("settings.noApplePlans")}
                </Text>
              ) : null}
              {applePlans.map((plan) => {
                const currentPlan =
                  entitlement?.active &&
                  entitlement?.verified &&
                  entitlement?.productId === plan.productId;
                const periodLabel = formatSubscriptionPeriod(plan.period);
                const priceLabel = plan.displayPrice
                  ? periodLabel
                    ? t("settings.planPriceEvery", {
                        price: plan.displayPrice,
                        period: periodLabel,
                      })
                    : plan.displayPrice
                  : periodLabel;
                const canPurchase =
                  applePurchasesAvailable &&
                  plan.storeKitAvailable &&
                  !appleBusy &&
                  !currentPlan;

                return (
                  <View
                    key={plan.productId}
                    style={stylesWithFont.applePlanCard}
                  >
                    <View style={stylesWithFont.applePlanHeader}>
                      <View style={stylesWithFont.applePlanCopy}>
                        <Text style={stylesWithFont.applePlanName}>
                          {plan.displayName}
                        </Text>
                        {priceLabel ? (
                          <Text style={stylesWithFont.applePlanPrice}>
                            {priceLabel}
                          </Text>
                        ) : null}
                      </View>
                      {currentPlan ? (
                        <View style={stylesWithFont.currentPlanBadge}>
                          <Text style={stylesWithFont.currentPlanText}>
                            {t("settings.current")}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {plan.description ? (
                      <Text style={stylesWithFont.applePlanDescription}>
                        {plan.description}
                      </Text>
                    ) : null}
                    {plan.displayPrice && periodLabel ? (
                      <Text style={stylesWithFont.appleRenewalDisclosure}>
                        {t("settings.autoRenewsAt")} {plan.displayPrice}{" "}
                        {t("settings.every")} {periodLabel}{" "}
                        {t("settings.renewalFootnote")}
                      </Text>
                    ) : null}
                    <CustomButton
                      title={
                        currentPlan
                          ? t("settings.currentPlanButton")
                          : appleOperation === "purchase"
                            ? t("settings.processingPurchase")
                            : entitlement?.active
                              ? t("settings.changeToPlan", {
                                  plan: plan.displayName,
                                })
                              : t("settings.subscribeToPlan", {
                                  plan: plan.displayName,
                                })
                      }
                      onPress={
                        canPurchase
                          ? () => handlePurchaseApplePlan(plan)
                          : null
                      }
                      fontSize={fontSize}
                      color={theme.accent}
                    />
                    {!plan.storeKitAvailable && Platform.OS === "ios" ? (
                      <Text style={stylesWithFont.applePlanUnavailable}>
                        {t("settings.productUnavailable")}
                      </Text>
                    ) : null}
                  </View>
                );
              })}

              {appleProductsError ? (
                <View style={stylesWithFont.subscriptionErrorRow}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={Math.max(16, fontSize)}
                    color={theme.danger}
                  />
                  <Text style={stylesWithFont.subscriptionError}>
                    {appleProductsError}
                  </Text>
                </View>
              ) : null}
                </>
              ) : null}

              <View style={stylesWithFont.appleLegalLinks}>
                <TouchableOpacity
                  onPress={() =>
                    openLegalDocument(TERMS_OF_USE_URL, "Terms of Use")
                  }
                  accessibilityRole="link"
                >
                  <Text style={stylesWithFont.appleLegalLinkText}>
                    {t("settings.termsOfUse")}
                  </Text>
                </TouchableOpacity>
                {PRIVACY_POLICY_URL ? (
                  <TouchableOpacity
                    onPress={() =>
                      openLegalDocument(
                        PRIVACY_POLICY_URL,
                        "Privacy Policy"
                      )
                    }
                    accessibilityRole="link"
                  >
                    <Text style={stylesWithFont.appleLegalLinkText}>
                      {t("settings.privacyPolicy")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={stylesWithFont.subscriptionFootnote}>
                {t("settings.purchasesLinkedNote")}
              </Text>
            </View>
              </>
            ) : null}

            {key === "user" ? (
              <>
            {loggedIn ? (
              <>
                <View style={stylesWithFont.settingColumn}>
                  <View style={stylesWithFont.accountCardHeader}>
                    <View style={stylesWithFont.sectionIcon}>
                      <Ionicons
                        name="log-out-outline"
                        size={fontSize * 1.25}
                        color={theme.accent}
                      />
                    </View>
                    <View style={stylesWithFont.accountCardCopy}>
                      <Text style={stylesWithFont.accountCardTitle}>
                        {t("settings.session")}
                      </Text>
                      <Text style={stylesWithFont.accountCardSubtitle}>
                        {t("settings.signOutOnDevice")}
                      </Text>
                    </View>
                  </View>
                  <CustomButton
                    title={t("common.logOut")}
                    onPress={
                      deletingAccount || accountBusy ? null : handleLogout
                    }
                    fontSize={fontSize}
                    color={theme.accent}
                  />
                </View>

                <View style={stylesWithFont.settingColumn}>
                  <View style={stylesWithFont.accountCardHeader}>
                    <View
                      style={[
                        stylesWithFont.sectionIcon,
                        { backgroundColor: `${theme.danger}18` },
                      ]}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={fontSize * 1.25}
                        color={theme.danger}
                      />
                    </View>
                    <View style={stylesWithFont.accountCardCopy}>
                      <Text style={stylesWithFont.accountDangerTitle}>
                        {t("settings.deleteAccount")}
                      </Text>
                      <Text style={stylesWithFont.accountCardSubtitle}>
                        {t("settings.deleteAccountBody")}
                      </Text>
                    </View>
                  </View>
                  <CustomButton
                    title={
                      deletingAccount
                        ? t("settings.deletingAccountEllipsis")
                        : t("settings.deleteAccountButton")
                    }
                    onPress={
                      deletingAccount || accountBusy
                        ? null
                        : handleDeleteAccount
                    }
                    fontSize={fontSize}
                    color={theme.danger}
                  />
                  {deletingAccount ? (
                    <View style={stylesWithFont.accountActivity}>
                      <ActivityIndicator color={theme.danger} />
                    </View>
                  ) : null}
                </View>
              </>
            ) : (
              <View style={stylesWithFont.settingColumn}>
                <View style={stylesWithFont.accountCardHeader}>
                  <View style={stylesWithFont.sectionIcon}>
                    <Ionicons
                      name="log-in-outline"
                      size={fontSize * 1.25}
                      color={theme.accent}
                    />
                  </View>
                  <View style={stylesWithFont.accountCardCopy}>
                    <Text style={stylesWithFont.accountCardTitle}>
                      {t("settings.pantrioAccount")}
                    </Text>
                    <Text style={stylesWithFont.accountCardSubtitle}>
                      {t("settings.signInToSync")}
                    </Text>
                  </View>
                </View>
                <CustomButton
                  title={t("settings.logInSignUpTitle")}
                  onPress={() => router.push("/(auth)/sign-in")}
                  fontSize={fontSize}
                  color={theme.accent}
                />
              </View>
            )}

            <Modal
              visible={modalVisible}
              animationType="fade"
              transparent={true}
              onRequestClose={() => {
                if (!savingName) {
                  setModalVisible(false);
                }
              }}
            >
              <View style={stylesWithFont.modalBackground}>
                <View style={stylesWithFont.modalContainer}>
                  <View style={stylesWithFont.accountCardHeader}>
                    <View style={stylesWithFont.sectionIcon}>
                      <Ionicons
                        name="person-outline"
                        size={fontSize * 1.25}
                        color={theme.accent}
                      />
                    </View>
                    <View style={stylesWithFont.accountCardCopy}>
                      <Text style={stylesWithFont.accountCardTitle}>
                        {t("settings.editUsernameTitle")}
                      </Text>
                      <Text style={stylesWithFont.accountCardSubtitle}>
                        {t("settings.editUsernameBody")}
                      </Text>
                    </View>
                  </View>

                  <Text style={stylesWithFont.accountInputLabel}>
                    {t("settings.username")}
                  </Text>
                  <TextInput
                    style={stylesWithFont.accountInput}
                    value={tempName}
                    onChangeText={setTempName}
                    placeholder={t("settings.usernamePlaceholder")}
                    placeholderTextColor={theme.textPlaceholder}
                    returnKeyType="done"
                    onSubmitEditing={saveName}
                    editable={!savingName}
                    autoFocus
                  />

                  {savingName ? (
                    <View style={stylesWithFont.accountActivity}>
                      <ActivityIndicator color={theme.accent} />
                    </View>
                  ) : null}

                  <CustomButton
                    title={
                      savingName
                        ? t("settings.saving")
                        : t("settings.saveUsername")
                    }
                    onPress={savingName ? null : saveName}
                    fontSize={fontSize}
                  />
                  <CustomButton
                    title={t("common.cancel")}
                    onPress={
                      savingName ? null : () => setModalVisible(false)
                    }
                    fontSize={fontSize}
                    color={theme.textSecondary}
                  />
                </View>
              </View>
            </Modal>

            <Modal
              visible={deletePasswordModalVisible}
              animationType="fade"
              transparent
              onRequestClose={() => {
                if (!deletingAccount) {
                  setDeletePasswordModalVisible(false);
                  setDeletePassword("");
                }
              }}
            >
              <View style={stylesWithFont.modalBackground}>
                <View style={stylesWithFont.modalContainer}>
                  <Text style={stylesWithFont.accountCardTitle}>
                    {t("settings.confirmPassword")}
                  </Text>
                  <Text style={stylesWithFont.accountCardSubtitle}>
                    {t("settings.confirmPasswordBody")}
                  </Text>
                  <Text style={stylesWithFont.accountInputLabel}>
                    {t("settings.passwordPlaceholder")}
                  </Text>
                  <TextInput
                    style={stylesWithFont.accountInput}
                    value={deletePassword}
                    onChangeText={setDeletePassword}
                    placeholder={t("settings.passwordPlaceholder")}
                    placeholderTextColor={theme.textPlaceholder}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    editable={!deletingAccount}
                    onSubmitEditing={() => {
                      if (deletePassword && !deletingAccount) {
                        void performAccountDeletion({
                          password: deletePassword,
                        });
                      }
                    }}
                    autoFocus
                  />
                  <CustomButton
                    title={
                      deletingAccount
                        ? t("settings.confirming")
                        : t("settings.deleteAccountButton")
                    }
                    onPress={
                      deletePassword && !deletingAccount
                        ? () =>
                            void performAccountDeletion({
                              password: deletePassword,
                            })
                        : null
                    }
                    fontSize={fontSize}
                    color={theme.danger}
                  />
                  <CustomButton
                    title={t("common.cancel")}
                    onPress={
                      deletingAccount
                        ? null
                        : () => {
                            setDeletePasswordModalVisible(false);
                            setDeletePassword("");
                          }
                    }
                    fontSize={fontSize}
                    color={theme.textSecondary}
                  />
                </View>
              </View>
            </Modal>
              </>
            ) : null}
          </View>
        );

      case "preferences":
        return (
          <View style={stylesWithFont.subMenu}>
            <TouchableOpacity
              style={stylesWithFont.settingRow}
              activeOpacity={0.75}
              onPress={() => setLanguageModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t("settings.languageA11y", {
                language: currentLanguageLabel,
              })}
            >
              <View style={stylesWithFont.settingCopy}>
                <Text style={stylesWithFont.label}>
                  {t("settings.language")}
                </Text>
                <Text style={stylesWithFont.helpText}>
                  {t("settings.languageBody")}
                </Text>
              </View>
              <View style={stylesWithFont.languageValue}>
                <Text style={stylesWithFont.value}>
                  {currentLanguageLabel}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={Math.max(16, fontSize)}
                  color={theme.textSecondary}
                />
              </View>
            </TouchableOpacity>

            <Text style={stylesWithFont.menuSectionLabel}>
              {t("settings.appearance")}
            </Text>
            <View style={stylesWithFont.settingRow}>
              <Text style={stylesWithFont.label}>
                {t("settings.useSystemTheme")}
              </Text>

              <Switch
                accessibilityLabel={t("settings.useSystemThemeA11y")}
                value={!!settings?.ux?.systemTheme}
                onValueChange={(val) =>
                  updateSetting("ux", "systemTheme", val)
                }
                trackColor={{
                  true: theme.actionButton,
                  false: theme.border,
                }}
              />
            </View>

            <View
              style={[
                stylesWithFont.settingRow,
                settings?.ux?.systemTheme ? stylesWithFont.disabledSetting : null,
              ]}
            >
              <View style={stylesWithFont.settingCopy}>
                <Text style={stylesWithFont.label}>
                  {t("settings.darkMode")}
                </Text>
                {settings?.ux?.systemTheme ? (
                  <Text style={stylesWithFont.helpText}>
                    {t("settings.darkModeBody")}
                  </Text>
                ) : null}
              </View>

              <Switch
                accessibilityLabel={t("settings.darkModeA11y")}
                value={!!settings?.ux?.darkMode}
                disabled={!!settings?.ux?.systemTheme}
                onValueChange={(val) =>
                  updateSetting("ux", "darkMode", val)
                }
                trackColor={{
                  true: theme.actionButton,
                  false: theme.border,
                }}
              />
            </View>

            <View style={stylesWithFont.settingRow}>
              <View style={stylesWithFont.settingCopy}>
                <Text style={stylesWithFont.label}>
                  {t("settings.chatgptStyleChat")}
                </Text>
                <Text style={stylesWithFont.helpText}>
                  {t("settings.chatgptStyleChatBody")}
                </Text>
              </View>

              <Switch
                accessibilityLabel={t("settings.chatgptStyleChat")}
                value={!!settings?.chat?.chatgptStyle}
                onValueChange={(val) =>
                  updateSetting("chat", "chatgptStyle", val)
                }
                trackColor={{
                  true: theme.actionButton,
                  false: theme.border,
                }}
              />
            </View>

            <View style={stylesWithFont.settingRow}>
              <View style={stylesWithFont.sliderSetting}>
                <Text style={stylesWithFont.label}>
                  {t("settings.fontSizeLabel")} {displayedFontSize}
                </Text>

                <Slider
                  accessibilityLabel={t("settings.fontSizeA11y")}
                  accessibilityValue={{
                    min: 12,
                    max: 24,
                    now: displayedFontSize,
                    text: t("settings.fontSizeValue", {
                      size: displayedFontSize,
                    }),
                  }}
                  style={{ width: "100%", marginTop: 8 }}
                  value={displayedFontSize}
                  onValueChange={setFontSizeDraft}
                  onSlidingComplete={(val) => {
                    updateSetting("ux", "fontSize", val);
                    setFontSizeDraft(null);
                  }}
                  minimumValue={12}
                  maximumValue={24}
                  step={1}
                  minimumTrackTintColor={theme.accent}
                  maximumTrackTintColor={theme.border}
                />
              </View>
            </View>

            <Text style={stylesWithFont.menuSectionLabel}>
              {t("settings.recipeSuggestions")}
            </Text>
            <View style={stylesWithFont.settingColumn}>
              <Text style={stylesWithFont.accountCardTitle}>
                {t("settings.recipeProfile")}
              </Text>
              <Text style={stylesWithFont.helpText}>
                {t("settings.recipeProfileBody")}
              </Text>
            </View>

            <PreferenceListEditor
              key={`preferred-cuisines:${commaSeparatedList(
                explicitRecipePreferences.preferredCuisines
              )}`}
              label={t("settings.preferredCuisines")}
              help={t("settings.preferredCuisinesHelp")}
              value={explicitRecipePreferences.preferredCuisines}
              onChange={(preferredCuisines) =>
                updateExplicitRecipePreferences({ preferredCuisines })
              }
              placeholder={t("settings.preferredCuisinesPlaceholder")}
              styles={stylesWithFont}
              theme={theme}
            />

            <PreferenceListEditor
              key={`dietary-patterns:${commaSeparatedList(
                explicitRecipePreferences.dietaryPatterns
              )}`}
              label={t("settings.dietaryPatterns")}
              help={t("settings.dietaryPatternsHelp")}
              value={explicitRecipePreferences.dietaryPatterns}
              onChange={(dietaryPatterns) =>
                updateExplicitRecipePreferences({ dietaryPatterns })
              }
              placeholder={t("settings.dietaryPatternsPlaceholder")}
              styles={stylesWithFont}
              theme={theme}
            />

            <PreferenceListEditor
              key={`disliked-cuisines:${commaSeparatedList(
                explicitRecipePreferences.dislikedCuisines
              )}`}
              label={t("settings.cuisinesToAvoid")}
              help={t("settings.cuisinesToAvoidHelp")}
              value={explicitRecipePreferences.dislikedCuisines}
              onChange={(dislikedCuisines) =>
                updateExplicitRecipePreferences({ dislikedCuisines })
              }
              placeholder={t("settings.cuisinesToAvoidPlaceholder")}
              styles={stylesWithFont}
              theme={theme}
            />

            <PreferenceListEditor
              key={`allergens:${commaSeparatedList(
                explicitRecipePreferences.allergens
              )}`}
              label={t("settings.allergens")}
              help={t("settings.allergensHelp")}
              value={explicitRecipePreferences.allergens}
              onChange={(allergens) =>
                updateExplicitRecipePreferences({ allergens })
              }
              placeholder={t("settings.allergensPlaceholder")}
              styles={stylesWithFont}
              theme={theme}
            />

            <PreferenceListEditor
              key={`excluded-ingredients:${commaSeparatedList(
                explicitRecipePreferences.excludedIngredients
              )}`}
              label={t("settings.alwaysExcludeIngredients")}
              help={t("settings.alwaysExcludeIngredientsHelp")}
              value={explicitRecipePreferences.excludedIngredients}
              onChange={(excludedIngredients) =>
                updateExplicitRecipePreferences({ excludedIngredients })
              }
              placeholder={t("settings.alwaysExcludeIngredientsPlaceholder")}
              styles={stylesWithFont}
              theme={theme}
            />

            <PreferenceListEditor
              key={`disliked-ingredients:${commaSeparatedList(
                explicitRecipePreferences.dislikedIngredients
              )}`}
              label={t("settings.dislikedIngredients")}
              help={t("settings.dislikedIngredientsHelp")}
              value={explicitRecipePreferences.dislikedIngredients}
              onChange={(dislikedIngredients) =>
                updateExplicitRecipePreferences({ dislikedIngredients })
              }
              placeholder={t("settings.dislikedIngredientsPlaceholder")}
              styles={stylesWithFont}
              theme={theme}
            />

            <View style={stylesWithFont.settingColumn}>
              <Text style={stylesWithFont.accountCardTitle}>
                {t("settings.mealStyle")}
              </Text>
              <Text style={stylesWithFont.helpText}>
                {t("settings.mealStyleBody")}
              </Text>
              <View style={stylesWithFont.preferenceChoiceRow}>
                {RECIPE_ENERGY_OPTIONS.map((option) => {
                  const selected =
                    explicitRecipePreferences.preferredEnergy === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        stylesWithFont.preferenceChoice,
                        selected && stylesWithFont.preferenceChoiceSelected,
                      ]}
                      onPress={() =>
                        updateExplicitRecipePreferences({
                          preferredEnergy: option.value,
                        })
                      }
                      accessibilityRole="radio"
                      accessibilityLabel={t("settings.mealStyleA11y", {
                        option: t(option.labelKey),
                      })}
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          stylesWithFont.preferenceChoiceText,
                          selected &&
                            stylesWithFont.preferenceChoiceTextSelected,
                        ]}
                      >
                        {t(option.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={stylesWithFont.settingColumn}>
              <NumberPreferenceEditor
                key={`max-calories:${String(
                  explicitRecipePreferences.maxCaloriesPerServing ?? ""
                )}`}
                label={t("settings.maxCaloriesPerServing")}
                help={t("settings.maxCaloriesHelp")}
                value={explicitRecipePreferences.maxCaloriesPerServing}
                onChange={(maxCaloriesPerServing) =>
                  updateExplicitRecipePreferences({ maxCaloriesPerServing })
                }
                placeholder={t("settings.maxCaloriesPlaceholder")}
                minimum={100}
                maximum={2500}
                styles={stylesWithFont}
                theme={theme}
              />
              <NumberPreferenceEditor
                key={`max-prep:${String(
                  explicitRecipePreferences.maxPrepMinutes ?? ""
                )}`}
                label={t("settings.maxRecipeTime")}
                help={t("settings.maxRecipeTimeHelp")}
                value={explicitRecipePreferences.maxPrepMinutes}
                onChange={(maxPrepMinutes) =>
                  updateExplicitRecipePreferences({ maxPrepMinutes })
                }
                placeholder={t("settings.maxRecipeTimePlaceholder")}
                minimum={5}
                maximum={480}
                styles={stylesWithFont}
                theme={theme}
              />
              <NumberPreferenceEditor
                key={`default-servings:${String(
                  explicitRecipePreferences.defaultServings ?? 2
                )}`}
                label={t("settings.defaultServings")}
                help={t("settings.defaultServingsHelp")}
                value={explicitRecipePreferences.defaultServings ?? 2}
                onChange={(defaultServings) =>
                  updateExplicitRecipePreferences({ defaultServings })
                }
                placeholder={t("settings.defaultServingsPlaceholder")}
                minimum={1}
                maximum={12}
                allowEmpty={false}
                fallback={2}
                styles={stylesWithFont}
                theme={theme}
              />
            </View>

            <View style={stylesWithFont.settingColumn}>
              <Text style={stylesWithFont.helpText}>
                {t("settings.resetRecipePreferencesBody")}
              </Text>
              <CustomButton
                title={t("settings.resetRecipePreferencesTitle")}
                onPress={confirmRecipePreferenceReset}
                fontSize={fontSize}
                color={theme.danger}
              />
            </View>

            <Text style={stylesWithFont.menuSectionLabel}>
              {t("settings.notifications")}
            </Text>
            <View style={stylesWithFont.settingRow}>
              <Text style={stylesWithFont.label}>
                {t("settings.dailyReminders")}
              </Text>

              <Switch
                accessibilityLabel={t("settings.dailyRemindersA11y")}
                value={
                  !!settings?.notifications?.dailyReminders
                }
                onValueChange={(val) =>
                  void updateReminderToggle(
                    "notifications",
                    "dailyReminders",
                    val
                  )
                }
                trackColor={{
                  true: theme.actionButton,
                  false: theme.border,
                }}
              />
            </View>

            <Text style={stylesWithFont.menuSectionLabel}>
              {t("settings.expirationReminders")}
            </Text>
            <View style={stylesWithFont.settingRow}>
              <Text style={stylesWithFont.label}>
                {t("settings.expirationAlerts")}
              </Text>

              <Switch
                accessibilityLabel={t("settings.expirationAlertsA11y")}
                value={
                  !!settings?.expiration?.expirationAlerts
                }
                onValueChange={(val) =>
                  void updateReminderToggle(
                    "expiration",
                    "expirationAlerts",
                    val
                  )
                }
                trackColor={{
                  true: theme.accent,
                  false: theme.border,
                }}
              />
            </View>

            <View style={stylesWithFont.settingRow}>
              <View style={stylesWithFont.sliderSetting}>
                <Text style={stylesWithFont.label}>
                  {t("settings.notify")} {remindDays}{" "}
                  {t("settings.daysBefore")}
                </Text>

                <Slider
                  accessibilityLabel={t("settings.remindDaysBeforeA11y")}
                  accessibilityValue={{
                    min: 1,
                    max: 31,
                    now: remindDays,
                    text: t("settings.remindDaysBefore", {
                      count: remindDays,
                    }),
                  }}
                  style={{ width: "100%", marginTop: 8 }}
                  value={settings?.expiration?.remindDays ?? 5}
                  onSlidingComplete={(val) =>
                    updateSetting("expiration", "remindDays", val)
                  }
                  onValueChange={(val) => setRemindDays(val)}
                  minimumValue={1}
                  maximumValue={31}
                  step={1}
                  minimumTrackTintColor={theme.accent}
                  maximumTrackTintColor={theme.border}
                />
              </View>
            </View>

            <View style={stylesWithFont.settingRow}>
              <View style={stylesWithFont.settingCopy}>
                <Text style={stylesWithFont.label}>
                  {t("settings.customUrgencyThresholds")}
                </Text>
                <Text style={stylesWithFont.helpText}>
                  {customUrgency
                    ? t("settings.customUrgencyOn")
                    : t("settings.customUrgencyOff")}
                </Text>
              </View>

              <Switch
                accessibilityLabel={t("settings.customUrgencyThresholdsA11y")}
                value={customUrgency}
                onValueChange={(val) =>
                  updateSetting("expiration", "customUrgency", val)
                }
                trackColor={{
                  true: theme.accent,
                  false: theme.border,
                }}
              />
            </View>

            {customUrgency ? (
              <>
                <TouchableOpacity
                  style={stylesWithFont.settingRow}
                  onPress={() =>
                    setShowUrgencyThresholds((visible) => !visible)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.advancedThresholdsA11y")}
                  accessibilityState={{ expanded: showUrgencyThresholds }}
                >
                  <View style={stylesWithFont.settingCopy}>
                    <Text style={stylesWithFont.accountCardTitle}>
                      {t("settings.advancedThresholds")}
                    </Text>
                    <Text style={stylesWithFont.helpText}>
                      {t("settings.advancedThresholdsBody")}
                    </Text>
                  </View>
                  <Ionicons
                    name={
                      showUrgencyThresholds
                        ? "chevron-up"
                        : "chevron-down"
                    }
                    size={fontSize * 1.1}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>

                {showUrgencyThresholds ? renderUrgencySliders() : null}
              </>
            ) : (
              <View style={stylesWithFont.settingRow}>
                <Text style={stylesWithFont.helpText}>
                  {t("settings.urgencyPreset")}
                </Text>
              </View>
            )}

            <Modal
              visible={languageModalVisible}
              animationType="fade"
              transparent
              onRequestClose={() => setLanguageModalVisible(false)}
            >
              <View style={stylesWithFont.modalBackground}>
                <View style={stylesWithFont.modalContainer}>
                  <Text style={stylesWithFont.accountCardTitle}>
                    {t("settings.languagePickerTitle")}
                  </Text>
                  {SUPPORTED_LANGUAGES.map((lang) => {
                    const selected = lang.code === i18next.language;
                    return (
                      <TouchableOpacity
                        key={lang.code}
                        style={[
                          stylesWithFont.languageOptionRow,
                          selected
                            ? stylesWithFont.languageOptionSelected
                            : null,
                        ]}
                        activeOpacity={0.75}
                        onPress={() => {
                          void setAppLanguage(lang.code);
                          setLanguageModalVisible(false);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={t("settings.languageSelectA11y", {
                          language: lang.label,
                        })}
                      >
                        <Text style={stylesWithFont.languageOptionLabel}>
                          {lang.label}
                        </Text>
                        {selected ? (
                          <Ionicons
                            name="checkmark"
                            size={Math.max(18, fontSize)}
                            color={theme.accent}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                  <CustomButton
                    title={t("common.done")}
                    onPress={() => setLanguageModalVisible(false)}
                    fontSize={fontSize}
                    color={theme.textSecondary}
                  />
                </View>
              </View>
            </Modal>
          </View>
        );

      case "privacy":
        return (
          <View style={stylesWithFont.subMenu}>
            <View style={stylesWithFont.settingRow}>
              <View style={stylesWithFont.settingCopy}>
                <Text style={stylesWithFont.label}>
                  {t("settings.incognitoMode")}
                </Text>
                <Text style={stylesWithFont.helpText}>
                  {t("settings.incognitoBody")}
                </Text>
              </View>

              <Switch
                accessibilityLabel={t("settings.incognitoModeA11y")}
                value={!!settings?.privacy?.incognito}
                onValueChange={(val) =>
                  updateSetting(
                    "privacy",
                    "incognito",
                    val
                  )
                }
                trackColor={{
                  true: theme.actionButton,
                  false: theme.border,
                }}
              />
            </View>

            <View style={stylesWithFont.settingColumn}>
              <Text style={stylesWithFont.accountCardTitle}>
                {t("settings.storedData")}
              </Text>
              <Text style={stylesWithFont.helpText}>
                {t("settings.storedDataBody")}
              </Text>

              <CustomButton
                title={t("settings.resetDataOnDevice")}
                onPress={() => {
                  Alert.alert(
                    t("settings.resetDeviceDataAlertTitle"),
                    t("settings.resetDeviceDataAlertMessage"),
                    [
                      {
                        text: t("common.cancel"),
                        style: "cancel",
                      },
                      {
                        text: t("settings.resetDeviceDataButton"),
                        style: "destructive",
                        onPress: handleClearAllData,
                      },
                    ]
                  );
                }}
                fontSize={fontSize}
                color={theme.danger}
              />

              <CustomButton
                title={t("settings.clearChatMessages")}
                onPress={() => {
                  Alert.alert(
                    t("settings.clearChatAlertTitle"),
                    t("settings.clearChatAlertMessage"),
                    [
                      {
                        text: t("common.cancel"),
                        style: "cancel",
                      },
                      {
                        text: t("settings.clearButton"),
                        style: "destructive",
                        onPress: () => {
                          clearChatData(
                            storageOwnerUid,
                            setMessages,
                            setSummary
                          );
                          resetConversations();
                        },
                      },
                    ]
                  );
                }}
                fontSize={fontSize}
                color={theme.danger}
              />
            </View>
          </View>
        );

      case "advanced":
        return (
          <View style={stylesWithFont.subMenu}>
            <View style={stylesWithFont.settingColumn}>
              <Text style={stylesWithFont.label}>
                {t("settings.selectAi")}
              </Text>
              <Text style={stylesWithFont.helpText}>
                {t("settings.selectAiBody")}
              </Text>

              {[
                {
                  value: "pantrio",
                  label: t("settings.pantrioCloudAi"),
                  detail: t("settings.pantrioCloudAiDetail"),
                },
                {
                  value: "apple",
                  label: t("settings.appleIntelligence"),
                  detail:
                    appleAvailability?.reason ||
                    t("settings.checkingThisDevice"),
                },
                {
                  value: "custom",
                  label: t("settings.myOwnAiApi"),
                  detail: t("settings.myOwnAiApiDetail"),
                },
              ].map((option) => {
                const appleUnsupported =
                  option.value === "apple" &&
                  APPLE_AI_UNSUPPORTED_STATUSES.has(appleAvailability?.status);
                const disabled =
                  option.value === "apple" &&
                  (checkingAppleAi || !appleAvailability || appleUnsupported);

                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      stylesWithFont.aiProviderChoice,
                      disabled && stylesWithFont.aiProviderChoiceDisabled,
                    ]}
                    onPress={() => selectAiProvider(option.value)}
                    disabled={disabled}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{
                      disabled,
                      selected: aiProvider === option.value,
                    }}
                  >
                    <Ionicons
                      name={
                        appleUnsupported
                          ? "lock-closed-outline"
                          : aiProvider === option.value
                            ? "radio-button-on"
                            : "radio-button-off"
                      }
                      size={fontSize + 4}
                      color={disabled ? theme.textSecondary : theme.accent}
                    />
                    <View style={stylesWithFont.aiProviderCopy}>
                      <Text style={stylesWithFont.aiProviderLabel}>
                        {option.label}
                      </Text>
                      <Text style={stylesWithFont.helpText}>
                        {option.detail}
                      </Text>
                    </View>
                    {checkingAppleAi && option.value === "apple" ? (
                      <ActivityIndicator size="small" color={theme.accent} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            {aiProvider === "custom" ? (
            <View style={stylesWithFont.settingColumn}>
              <Text style={stylesWithFont.inputLabel}>
                {t("settings.apiProvider")}
              </Text>
              <DropDownPicker
                open={aiProviderOpen}
                value={aiBaseUrl}
                items={aiProviderItems}
                setOpen={setAiProviderOpen}
                setValue={setAiBaseUrl}
                disabled={savingAi || testingAi}
                placeholder={t("settings.apiProviderPlaceholder")}
                listMode="SCROLLVIEW"
                style={stylesWithFont.dropdown}
                dropDownContainerStyle={stylesWithFont.dropdownMenu}
                textStyle={stylesWithFont.dropdownText}
                placeholderStyle={stylesWithFont.dropdownPlaceholder}
                arrowIconStyle={{ tintColor: theme.textSecondary }}
                tickIconStyle={{ tintColor: theme.accent }}
                zIndex={3000}
              />

              <Text style={stylesWithFont.inputLabel}>
                {t("settings.apiUrl")}
              </Text>
              <TextInput
                style={stylesWithFont.aiInput}
                value={aiBaseUrl}
                onChangeText={setAiBaseUrl}
                editable={!savingAi && !testingAi && !loadingAiProviderSettings}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="url"
                keyboardType="url"
                placeholder={t("settings.apiUrlPlaceholder")}
                placeholderTextColor={theme.textPlaceholder}
              />

              <Text style={stylesWithFont.inputLabel}>
                {t("settings.model")}
              </Text>
              <TextInput
                style={stylesWithFont.aiInput}
                value={loadingAiProviderSettings ? "" : aiModel}
                onChangeText={setAiModelDraft}
                editable={!savingAi && !testingAi && !loadingAiProviderSettings}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t("settings.modelPlaceholder")}
                placeholderTextColor={theme.textPlaceholder}
              />

              <Text style={stylesWithFont.inputLabel}>
                {t("settings.apiKey")}
              </Text>
              <TextInput
                style={stylesWithFont.aiInput}
                value={loadingAiProviderSettings ? "" : aiApiKey}
                onChangeText={setAiApiKey}
                editable={!savingAi && !testingAi && !loadingAiProviderSettings}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder={t("settings.apiKeyPlaceholder")}
                placeholderTextColor={theme.textPlaceholder}
              />

              <CustomButton
                title={
                  savingAi
                    ? t("settings.saving")
                    : t("settings.saveAiProvider")
                }
                onPress={
                  savingAi || testingAi || loadingAiProviderSettings
                    ? null
                    : saveAiProvider
                }
                fontSize={fontSize}
              />
              <CustomButton
                title={
                  testingAi
                    ? t("settings.testingConnection")
                    : t("settings.testConnection")
                }
                onPress={
                  savingAi || testingAi || loadingAiProviderSettings
                    ? null
                    : testAiProvider
                }
                fontSize={fontSize}
                color={theme.accent}
              />
              <Text style={stylesWithFont.securityText}>
                {t("settings.providerInfoBody")}
              </Text>
            </View>
            ) : null}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View
      style={{
        flex: 1,
        overflow: "hidden",
        backgroundColor: theme.background,
      }}
    >
      <Animated.View
        style={{
          flexDirection: "row",
          width: width * 2,
          transform: [{ translateX: anim }],
        }}
      >
        {renderMainMenu()}

        {currentSubMenu && (
          <ScrollView
            style={stylesWithFont.menuPanel}
            contentContainerStyle={stylesWithFont.subMenuScroll}
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
          >
            {renderSubMenu(currentSubMenu)}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const dynamicStyles = (theme, fontSize) =>
  StyleSheet.create({
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 13,
      paddingHorizontal: 14,
      backgroundColor: theme.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 16,
      marginBottom: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },

    mainMenu: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 36,
    },
    menuPanel: {
      width,
      flexGrow: 0,
      flexShrink: 0,
    },
    sectionIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${theme.accent}18`,
    },

    sectionTitle: {
      flex: 1,
      fontSize,
      fontWeight: "600",
      marginLeft: 12,
      color: theme.textPrimary,
    },

    settingRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 15,
      backgroundColor: theme.card,
      borderRadius: 16,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },

    settingColumn: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: theme.card,
      borderRadius: 16,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    settingCopy: {
      flex: 1,
      minWidth: 0,
      marginRight: 12,
    },
    languageValue: {
      flexDirection: "row",
      alignItems: "center",
      marginLeft: 12,
    },
    sliderSetting: {
      flex: 1,
      minWidth: 0,
    },
    disabledSetting: {
      opacity: 0.6,
    },

    accountCardHeader: {
      flexDirection: "row",
      alignItems: "center",
    },
    disclosureRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
    },
    planDisclosure: {
      minHeight: 44,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    accountCardCopy: {
      flex: 1,
      minWidth: 0,
      marginLeft: 12,
    },
    accountFieldLabel: {
      fontSize: Math.max(11, fontSize - 3),
      fontWeight: "700",
      letterSpacing: 0.7,
      textTransform: "uppercase",
      color: theme.textSecondary,
    },
    accountValue: {
      marginTop: 3,
      fontSize: fontSize + 2,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    accountEditAction: {
      flexDirection: "row",
      alignItems: "center",
      marginLeft: 12,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: `${theme.accent}18`,
    },
    accountEditText: {
      marginLeft: 5,
      fontSize: Math.max(12, fontSize - 2),
      fontWeight: "700",
      color: theme.accent,
    },
    accountCardTitle: {
      fontSize,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    accountCardSubtitle: {
      marginTop: 3,
      fontSize: Math.max(11, fontSize - 3),
      lineHeight: Math.max(16, fontSize + 1),
      color: theme.textSecondary,
    },
    accountDangerTitle: {
      fontSize,
      fontWeight: "700",
      color: theme.danger,
    },
    accountActivity: {
      alignItems: "center",
      paddingTop: 12,
    },
    accountInputLabel: {
      marginTop: 18,
      marginBottom: 7,
      fontSize: Math.max(12, fontSize - 2),
      fontWeight: "700",
      color: theme.textPrimary,
    },
    accountInput: {
      minHeight: 48,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 12,
      fontSize,
      color: theme.textPrimary,
      backgroundColor: theme.background,
    },

    subscriptionCard: {
      marginTop: 14,
      padding: 14,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    subscriptionStatusBadge: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 999,
    },
    subscriptionStatusDot: {
      width: 7,
      height: 7,
      marginRight: 7,
      borderRadius: 4,
    },
    subscriptionStatusText: {
      fontSize: Math.max(12, fontSize - 2),
      fontWeight: "700",
    },
    subscriptionPlan: {
      marginTop: 12,
      fontSize: fontSize + 1,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    subscriptionDetails: {
      marginTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    subscriptionDetailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    subscriptionDetailLabel: {
      flex: 1,
      marginRight: 12,
      fontSize: Math.max(11, fontSize - 3),
      fontWeight: "600",
      color: theme.textSecondary,
    },
    subscriptionDetailValue: {
      flex: 1.7,
      fontSize: Math.max(11, fontSize - 3),
      fontWeight: "600",
      textAlign: "right",
      color: theme.textPrimary,
    },
    subscriptionErrorRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 12,
      padding: 10,
      borderRadius: 10,
      backgroundColor: `${theme.danger}12`,
    },
    subscriptionError: {
      flex: 1,
      marginLeft: 8,
      fontSize: Math.max(11, fontSize - 3),
      lineHeight: Math.max(16, fontSize + 1),
      color: theme.danger,
    },
    subscriptionFootnote: {
      marginTop: 8,
      paddingHorizontal: 2,
      fontSize: Math.max(11, fontSize - 3),
      lineHeight: Math.max(16, fontSize + 1),
      textAlign: "center",
      color: theme.textSecondary,
    },
    applePlanCard: {
      marginTop: 10,
      padding: 14,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    applePlanHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    applePlanCopy: {
      flex: 1,
      minWidth: 0,
      marginRight: 10,
    },
    applePlanName: {
      fontSize: fontSize + 1,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    menuSectionLabel: {
      marginTop: 4,
      marginBottom: 8,
      paddingHorizontal: 2,
      fontSize: Math.max(12, fontSize - 2),
      fontWeight: "700",
      color: theme.textSecondary,
    },
    applePlanPrice: {
      marginTop: 4,
      fontSize: Math.max(12, fontSize - 2),
      fontWeight: "600",
      color: theme.accent,
    },
    applePlanDescription: {
      marginTop: 10,
      fontSize: Math.max(11, fontSize - 3),
      lineHeight: Math.max(16, fontSize + 1),
      color: theme.textSecondary,
    },
    appleRenewalDisclosure: {
      marginTop: 10,
      fontSize: Math.max(10, fontSize - 4),
      lineHeight: Math.max(15, fontSize),
      color: theme.textSecondary,
    },
    currentPlanBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: `${theme.accent}18`,
    },
    currentPlanText: {
      fontSize: Math.max(11, fontSize - 3),
      fontWeight: "700",
      color: theme.accent,
    },
    applePlanUnavailable: {
      marginTop: 8,
      fontSize: Math.max(11, fontSize - 3),
      textAlign: "center",
      color: theme.textSecondary,
    },
    appleLegalLinks: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 22,
      marginTop: 14,
      marginBottom: 2,
    },
    appleLegalLinkText: {
      fontSize: Math.max(11, fontSize - 3),
      fontWeight: "700",
      textDecorationLine: "underline",
      color: theme.accent,
    },

    label: {
      fontSize,
      color: theme.textPrimary,
    },

    value: {
      fontSize,
      color: theme.textSecondary,
    },

    subMenu: {
      flex: 1,
    },
    subMenuScroll: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 40,
    },

    modalBackground: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.modalBackground,
    },

    modalContainer: {
      width: "88%",
      maxWidth: 420,
      padding: 20,
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      flexDirection: "column",
      justifyContent: "space-around",
    },
    languageOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    languageOptionSelected: {
      backgroundColor: `${theme.accent}18`,
      borderColor: theme.accent,
    },
    languageOptionLabel: {
      fontSize,
      fontWeight: "600",
      color: theme.textPrimary,
    },

    input: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      marginBottom: 10,
      fontSize,
      color: theme.textPrimary,
    },
    inputLabel: {
      marginTop: 14,
      marginBottom: 5,
      fontSize: Math.max(12, fontSize - 2),
      fontWeight: "600",
      color: theme.textPrimary,
    },
    preferenceInput: {
      minHeight: 46,
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 12,
      fontSize,
      color: theme.textPrimary,
      backgroundColor: theme.background,
    },
    compactPreferenceField: {
      marginBottom: 18,
    },
    preferenceChoiceRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
    preferenceChoice: {
      minHeight: 42,
      minWidth: 72,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 999,
      backgroundColor: theme.background,
    },
    preferenceChoiceSelected: {
      borderColor: theme.accent,
      backgroundColor: `${theme.accent}18`,
    },
    preferenceChoiceText: {
      fontSize: Math.max(12, fontSize - 2),
      fontWeight: "600",
      color: theme.textSecondary,
    },
    preferenceChoiceTextSelected: {
      color: theme.accent,
    },
    aiInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize,
      color: theme.textPrimary,
      backgroundColor: theme.background,
    },
    dropdown: {
      minHeight: 48,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: theme.background,
    },
    dropdownMenu: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 12,
      backgroundColor: theme.card,
    },
    dropdownText: {
      fontSize,
      color: theme.textPrimary,
    },
    dropdownPlaceholder: {
      color: theme.textPlaceholder,
    },
    selectedUrl: {
      marginTop: 7,
      paddingHorizontal: 2,
      fontSize: Math.max(11, fontSize - 3),
      color: theme.textSecondary,
    },
    helpText: {
      fontSize: Math.max(12, fontSize - 2),
      lineHeight: Math.max(17, fontSize + 3),
      color: theme.textSecondary,
    },
    securityText: {
      marginTop: 8,
      fontSize: Math.max(11, fontSize - 3),
      lineHeight: Math.max(16, fontSize + 1),
      color: theme.textSecondary,
    },
    aiProviderChoice: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    aiProviderChoiceDisabled: {
      opacity: 0.5,
    },
    aiProviderCopy: {
      flex: 1,
      marginLeft: 12,
    },
    aiProviderLabel: {
      marginBottom: 3,
      fontSize,
      fontWeight: "700",
      color: theme.textPrimary,
    },
  });
