import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import "react-native-get-random-values";
import { GptProvider } from "../../api/gpt";
import { useAuth } from "../../auth/useAuth";
import ConversationDrawer from "../../components/ConversationListModal";
import { IconHeader } from "../../components/Header";
import {
  AccountSessionProvider,
  useAccountSession,
} from "../../context/AccountSessionContext";
import {
  ChatContext,
  GlobalContext,
  GlobalProvider,
} from "../../context/GlobalContext";
import { AppleSubscriptionProvider } from "../../context/SubscriptionContext";
import { canExposeAccountData } from "../../context/refreshPolicy";

function ChatTabHeader() {
  const { t } = useTranslation();
  const {
    activeConversationId,
    activeConversationTitle,
    createConversation,
    setConversationsVisible,
    archiveConversation,
    deleteConversation,
  } = useContext(ChatContext);

  const confirmDeleteActiveChat = () => {
    if (!activeConversationId) return;
    Alert.alert(
      t("conversations.deleteChatTitle"),
      t("conversations.deleteChatBody", {
        title: activeConversationTitle,
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("conversations.deleteChat"),
          style: "destructive",
          onPress: () => deleteConversation(activeConversationId),
        },
      ]
    );
  };

  const openActiveChatMenu = () => {
    if (!activeConversationId) return;
    Alert.alert(t("conversations.chatMenu"), activeConversationTitle, [
      {
        text: t("conversations.archiveChat"),
        onPress: () => archiveConversation(activeConversationId),
      },
      {
        text: t("conversations.deleteChat"),
        style: "destructive",
        onPress: confirmDeleteActiveChat,
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  const rightItems = [
    {
      icon: "add-circle-outline",
      label: t("conversations.newChat"),
      onPress: () => createConversation(),
      rotateOnPress: true,
    },
  ];
  if (activeConversationId) {
    rightItems.push({
      icon: "ellipsis-horizontal",
      label: t("conversations.chatMenu"),
      onPress: openActiveChatMenu,
    });
  }

  return (
    <IconHeader
      title={activeConversationTitle}
      leftItems={[
        {
          icon: "menu-outline",
          label: t("conversations.openConversations"),
          onPress: () => setConversationsVisible(true),
        },
      ]}
      rightItems={rightItems}
    />
  );
}

function SessionBackedGlobalProvider({ authUser, children }) {
  const { t } = useTranslation();
  const {
    session,
    initializing,
    loading,
    error,
    refreshSession,
    beginAccountTeardown,
  } = useAccountSession();
  const { accountDeletionPending, signOut } = useAuth();
  const [actionError, setActionError] = useState("");
  const [working, setWorking] = useState(false);

  if (!canExposeAccountData(session, accountDeletionPending)) {
    const waiting = initializing || loading || accountDeletionPending;
    const retry = async () => {
      if (working) return;
      setActionError("");
      setWorking(true);
      try {
        await refreshSession({ maxAgeMs: 0 });
      } catch (nextError) {
        setActionError(
          String(nextError?.message || t("tabsLayout.couldNotVerifyAccountAccess"))
        );
      } finally {
        setWorking(false);
      }
    };
    const logout = async () => {
      if (working) return;
      setActionError("");
      setWorking(true);
      let releaseAccountOperation = null;
      try {
        releaseAccountOperation = beginAccountTeardown("logout");
        await signOut();
      } catch (nextError) {
        setActionError(String(nextError?.message || t("tabsLayout.couldNotLogOut")));
      } finally {
        releaseAccountOperation?.();
        setWorking(false);
      }
    };

    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 28,
          backgroundColor: "#F7F8FA",
        }}
        accessibilityLabel={
          waiting
            ? t("tabsLayout.verifyingAccountAccess")
            : t("tabsLayout.accountAccessUnavailable")
        }
      >
        {waiting ? (
          <>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text
              style={{ marginTop: 14, color: "#30343B", textAlign: "center" }}
            >
              {accountDeletionPending
                ? t("tabsLayout.finishingAccountDeletion")
                : t("tabsLayout.verifyingAccountAccessEllipsis")}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="cloud-offline-outline" size={44} color="#B3261E" />
            <Text
              style={{
                marginTop: 16,
                color: "#1E2229",
                fontSize: 20,
                fontWeight: "700",
                textAlign: "center",
              }}
            >
              {t("tabsLayout.accountAccessCouldNotBeVerified")}
            </Text>
            <Text
              style={{
                marginTop: 10,
                color: "#5F6672",
                fontSize: 15,
                lineHeight: 22,
                textAlign: "center",
              }}
            >
              {actionError || error || t("tabsLayout.checkConnection")}
            </Text>
            <Pressable
              onPress={() => void retry()}
              disabled={working}
              accessibilityRole="button"
              accessibilityLabel={t("tabsLayout.retryAccountVerification")}
              style={({ pressed }) => ({
                marginTop: 22,
                minWidth: 128,
                alignItems: "center",
                paddingHorizontal: 22,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: "#2563EB",
                opacity: working ? 0.5 : pressed ? 0.75 : 1,
              })}
            >
              {working ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                  {t("common.retry")}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => void logout()}
              disabled={working}
              accessibilityRole="button"
              accessibilityLabel={t("tabsLayout.logOutOfThisAccount")}
              style={({ pressed }) => ({
                marginTop: 12,
                minWidth: 128,
                alignItems: "center",
                paddingHorizontal: 22,
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#AEB4BE",
                opacity: working ? 0.5 : pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ color: "#30343B", fontWeight: "700" }}>
                {t("common.logOut")}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return (
    <GlobalProvider
      authUser={authUser}
      accountProfile={session.user}
      accountProfileLoading={false}
    >
      {children}
    </GlobalProvider>
  );
}

function ThemedTabs() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const {
    retryStorageHydration,
    storageHydrated,
    storageHydrationErrors,
    storagePurgeResult,
    theme,
  } = useContext(GlobalContext);
  const { beginAccountTeardown, initializing } = useAccountSession();
  const {
    conversationsVisible,
    setConversationsVisible,
    conversations,
    activeConversationId,
    selectConversation,
    createConversation,
    archiveConversation,
    restoreConversation,
    deleteConversation,
  } = useContext(ChatContext);
  const { width: windowWidth } = useWindowDimensions();
  const drawerWidth = Math.min(windowWidth * 0.82, 380);
  const [drawerProgress] = useState(() => new Animated.Value(0));
  const mountedRef = useRef(false);
  const recoveryLogoutLockedRef = useRef(false);
  const [recoveryLogoutError, setRecoveryLogoutError] = useState("");
  const [recoveryLoggingOut, setRecoveryLoggingOut] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    Animated.timing(drawerProgress, {
      toValue: conversationsVisible ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [conversationsVisible, drawerProgress]);

  const logoutFromRecovery = async () => {
    if (recoveryLogoutLockedRef.current) return;
    recoveryLogoutLockedRef.current = true;
    setRecoveryLogoutError("");
    setRecoveryLoggingOut(true);

    let releaseAccountOperation = null;
    try {
      releaseAccountOperation = beginAccountTeardown("logout");
      const result = await signOut();
      if (result?.providerCleanupError) {
        console.warn(
          "[recovery logout] native provider cleanup warning",
          result.providerCleanupError
        );
      }
    } catch (error) {
      if (mountedRef.current) {
        setRecoveryLogoutError(
          String(error?.message || t("tabsLayout.couldNotLogOutTryAgain"))
        );
      }
    } finally {
      releaseAccountOperation?.();
      recoveryLogoutLockedRef.current = false;
      if (mountedRef.current) setRecoveryLoggingOut(false);
    }
  };

  const storageRecoveryRequired =
    Object.keys(storageHydrationErrors || {}).length > 0 ||
    storagePurgeResult?.pendingRetry === true;

  // Account and UID-scoped device state must both resolve before any tab can
  // mutate defaults that may otherwise race a late storage read.
  if (initializing || !storageHydrated) {
    return (
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        accessibilityLabel={t("tabsLayout.loadingAccountData")}
      >
        <ActivityIndicator size="large" color={theme.actionButton} />
      </View>
    );
  }

  if (storageRecoveryRequired) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 28,
          backgroundColor: theme.background,
        }}
        accessibilityLabel={t("tabsLayout.localDataRecoveryRequired")}
      >
        <Ionicons
          name="warning-outline"
          size={44}
          color={theme.warning || theme.danger}
        />
        <Text
          style={{
            marginTop: 16,
            color: theme.textPrimary,
            fontSize: 20,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          {t("tabsLayout.localDataNeedsAttention")}
        </Text>
        <Text
          style={{
            marginTop: 10,
            color: theme.textSecondary,
            fontSize: 15,
            lineHeight: 22,
            textAlign: "center",
          }}
        >
          {t("tabsLayout.localDataMessage")}
        </Text>
        <Pressable
          onPress={() => {
            setRecoveryLogoutError("");
            retryStorageHydration();
          }}
          disabled={recoveryLoggingOut}
          accessibilityRole="button"
          accessibilityLabel={t("tabsLayout.retryLoadingLocalData")}
          style={({ pressed }) => ({
            marginTop: 22,
            minWidth: 128,
            alignItems: "center",
            paddingHorizontal: 22,
            paddingVertical: 12,
            borderRadius: 10,
            backgroundColor: theme.actionButton,
            opacity: recoveryLoggingOut ? 0.5 : pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>
            {t("common.retry")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void logoutFromRecovery()}
          disabled={recoveryLoggingOut}
          accessibilityRole="button"
          accessibilityLabel={t("tabsLayout.logOutOfThisAccount")}
          style={({ pressed }) => ({
            marginTop: 12,
            minWidth: 128,
            alignItems: "center",
            paddingHorizontal: 22,
            paddingVertical: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.border,
            opacity: recoveryLoggingOut ? 0.5 : pressed ? 0.75 : 1,
          })}
        >
          {recoveryLoggingOut ? (
            <ActivityIndicator color={theme.textPrimary} />
          ) : (
            <Text
              style={{
                color: theme.textPrimary,
                fontSize: 16,
                fontWeight: "700",
              }}
            >
              {t("common.logOut")}
            </Text>
          )}
        </Pressable>
        {recoveryLogoutError ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{
              marginTop: 12,
              color: theme.danger || "#B3261E",
              fontSize: 14,
              lineHeight: 20,
              textAlign: "center",
            }}
          >
            {recoveryLogoutError}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Animated.View
        style={{
          flex: 1,
          transform: [
            {
              translateX: drawerProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, drawerWidth],
              }),
            },
          ],
        }}
      >
        <Tabs
          screenOptions={{
            headerShown: true,
            tabBarActiveTintColor: theme.actionButton,
            tabBarInactiveTintColor: theme.textSecondary,
            tabBarStyle: { backgroundColor: theme.card, borderColor: theme.border, },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              headerShown: false,
              title: t("tabs.home"),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="home-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="chat"
            options={{
              header: () => <ChatTabHeader />,
              title: t("tabs.chat"),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="chatbubble-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="fridge"
            options={{
              title: t("tabs.fridge"),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="cube-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="list"
            options={{
              title: t("tabs.shoppingList"),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="cart-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: t("tabs.settings"),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="settings-outline" size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </Animated.View>

      <ConversationDrawer
        progress={drawerProgress}
        open={conversationsVisible}
        drawerWidth={drawerWidth}
        onClose={() => setConversationsVisible(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelect={(id) => {
          const item = (Array.isArray(conversations) ? conversations : []).find(
            (conversation) => conversation.id === id
          );
          if (item?.status === "archived" || item?.archivedAt) {
            restoreConversation(id);
          }
          selectConversation(id);
          setConversationsVisible(false);
        }}
        onArchive={(id) => archiveConversation(id)}
        onRestore={(id) => restoreConversation(id)}
        onDelete={(id) => deleteConversation(id)}
        onNewChat={() => {
          createConversation();
          setConversationsVisible(false);
        }}
      />

      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 20,
          left: drawerProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-30, drawerWidth - 30],
          }),
        }}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();

  // The protected root stack removes this layout after sign-out. Keep this
  // guard for the brief render in which the auth update is propagating.
  if (!user) return null;

  return (
    <AppleSubscriptionProvider key={user.uid} accountId={user.uid} enabled>
      <AccountSessionProvider authUser={user}>
        <SessionBackedGlobalProvider authUser={user}>
          <GptProvider>
            <ThemedTabs />
          </GptProvider>
        </SessionBackedGlobalProvider>
      </AccountSessionProvider>
    </AppleSubscriptionProvider>
  );
}
