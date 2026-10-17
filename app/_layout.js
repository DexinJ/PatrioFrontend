// app/_layout.js
import * as Sentry from '@sentry/react-native';
import { Stack } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-get-random-values";
import { AuthProvider, useAuth } from "../auth/useAuth";
import {
  SUPPORTED_LANGUAGES,
  applyLanguageCode,
  getDeviceLanguageCode,
  getSavedLanguageCode,
} from "../i18n";
import { setAuthEmailSendReporter } from "../utils/authEmailSend";
import { initDiagnosticsIfEnabled } from "../utils/diagnostics";

// Sentry is initialised by utils/diagnostics once the stored "share
// diagnostics" preference has been read, so an opt-out is honoured from the
// first event. The error boundary and `Sentry.wrap` below do not need a client
// to be present, so they stay mounted from the first render.

// Auth email sends are non-blocking by design, so their rejections never reach
// an error boundary. They are reported here instead, tagged by scope so a
// "user says no email arrived" report can be matched to a cause.
setAuthEmailSendReporter((error, { scope, code }) =>
  Sentry.captureException(error, {
    tags: { area: "auth-email", scope, code: code || "none" },
  })
);

function RootErrorFallback({ resetError }) {
  const { t } = useTranslation();
  return (
    <View style={styles.errorFallback} accessibilityRole="alert">
      <Text style={styles.errorTitle}>{t("root.ranIntoProblem")}</Text>
      <Text style={styles.errorMessage}>
        {t("root.savedDataSafe")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={resetError}
        style={styles.retryButton}
      >
        <Text style={styles.retryButtonText}>{t("root.tryAgain")}</Text>
      </Pressable>
    </View>
  );
}

function AuthRecoveryFallback({
  error,
  onRetry,
  onSignOut,
  onClearDeviceData,
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.errorFallback} accessibilityRole="alert">
      <Text style={styles.errorTitle}>{t("root.couldNotVerifyAccount")}</Text>
      <Text style={styles.errorMessage}>
        {error?.message || t("root.checkConnection")}
      </Text>
      <View style={styles.recoveryActions}>
        {!error?.signedOutRecovery ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onSignOut}
          style={styles.signOutButton}
        >
          <Text style={styles.signOutButtonText}>
            {error?.signedOutRecovery
              ? t("root.continueToSignIn")
              : t("root.signOut")}
          </Text>
        </Pressable>
        {onClearDeviceData ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t("root.clearDeviceDataA11y")}
            onPress={onClearDeviceData}
            style={styles.clearDataButton}
          >
            <Text style={styles.clearDataButtonText}>
              {t("root.clearDeviceDataAndSignOut")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function AppNavigator({
  user,
  loading,
  accountDeletionPending,
  accountDeletionPhase,
}) {
  const { t } = useTranslation();
  if (accountDeletionPending) {
    const clearingLocalData = accountDeletionPhase === "purging-local-data";
    return (
      <View
        style={styles.deletionOverlay}
        accessibilityRole="progressbar"
        accessibilityLabel={t("root.deletingAccountA11y")}
        accessibilityLiveRegion="polite"
      >
        <ActivityIndicator size="large" color="#0A8E91" />
        <Text style={styles.deletionTitle}>{t("root.deletingAccount")}</Text>
        <Text style={styles.deletionMessage}>
          {clearingLocalData
            ? t("root.clearingAccountData")
            : t("root.keepPantrioOpen")}
        </Text>
      </View>
    );
  }

  // While the session is being restored, neither Stack.Protected group below is
  // mounted. If the navigator rendered now, expo-router would drop the `(tabs)`
  // route from the initial state and fall back to the first remaining route —
  // the legal notices page — so a cold start would open on /legal/licenses
  // instead of the home tab. Waiting means the navigator mounts once with a
  // destination (the initial URL resolves to `(tabs)/index`).
  if (loading) {
    return (
      <View style={styles.container}>
        <View
          style={styles.loadingOverlay}
          accessibilityLabel={t("root.checkingSignInStatus")}
        >
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!loading && !user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!loading && Boolean(user)}>
          <Stack.Screen name="(tabs)" />
          {/* Declared here so it is only ever reachable inside the signed-in
              app; an undeclared page would stay in the root navigator and be
              picked as the startup fallback (that was the /legal/licenses
              cold-start bug). */}
          <Stack.Screen name="legal" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

function RootLayoutContent() {
  const { t } = useTranslation();
  const {
    accountDeletionPending,
    accountDeletionPhase,
    accountDeletionError,
    authRecoveryError,
    clearPendingDeletionDataFromRecovery,
    consumeAccountDeletionError,
    consumePostAuthNotice,
    loading,
    postAuthNotice,
    retryAuthRecovery,
    signOutFromRecovery,
    user,
  } = useAuth();

  const confirmRecoveryDataClear = () => {
    Alert.alert(
      t("root.clearDeviceDataTitle"),
      t("root.clearDeviceDataMessage"),
      [
        { text: t("common.keepData"), style: "cancel" },
        {
          text: t("root.clearDeviceData"),
          style: "destructive",
          onPress: () => {
            void clearPendingDeletionDataFromRecovery().catch((error) => {
              Alert.alert(
                t("root.cleanupIncomplete"),
                error?.message || t("root.someAccountDataNotRemoved")
              );
            });
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (accountDeletionPending || !accountDeletionError) return;
    consumeAccountDeletionError();
    Alert.alert(
      accountDeletionError?.code === "RECENT_AUTH_REQUIRED"
        ? t("root.signInConfirmationExpired")
        : t("root.deleteFailed"),
      accountDeletionError?.message || t("root.couldNotDeleteAccount")
    );
  }, [
    accountDeletionError,
    accountDeletionPending,
    consumeAccountDeletionError,
    t,
  ]);

  useEffect(() => {
    const noticeAudienceMatches = user
      ? postAuthNotice?.audienceUid === user.uid
      : !postAuthNotice?.audienceUid;
    if (
      accountDeletionPending ||
      authRecoveryError ||
      loading ||
      !postAuthNotice ||
      !noticeAudienceMatches
    ) {
      return undefined;
    }

    let active = true;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!active) return;
      consumePostAuthNotice();
      Alert.alert(postAuthNotice.title, postAuthNotice.message);
    });

    return () => {
      active = false;
      task.cancel?.();
    };
  }, [
    accountDeletionPending,
    authRecoveryError,
    consumePostAuthNotice,
    loading,
    postAuthNotice,
    user,
  ]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {authRecoveryError && !accountDeletionPending ? (
        <AuthRecoveryFallback
          error={authRecoveryError}
          onRetry={retryAuthRecovery}
          onSignOut={signOutFromRecovery}
          onClearDeviceData={
            authRecoveryError.accountDeletionRecoveryRequired
              ? confirmRecoveryDataClear
              : null
          }
        />
      ) : (
        <AppNavigator
          user={user}
          loading={loading}
          accountDeletionPending={accountDeletionPending}
          accountDeletionPhase={accountDeletionPhase}
        />
      )}
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(function Layout() {
  // Restore the language preference: explicit user choice > device locale > en.
  // The diagnostics preference is read in the same pass, before any event can
  // be sent; see utils/diagnostics.
  useEffect(() => {
    let active = true;
    (async () => {
      await initDiagnosticsIfEnabled();
      const saved = await getSavedLanguageCode();
      if (!active) return;
      const deviceCode = getDeviceLanguageCode();
      const code = SUPPORTED_LANGUAGES.some((l) => l.code === saved)
        ? saved
        : SUPPORTED_LANGUAGES.some((l) => l.code === deviceCode)
          ? deviceCode
          : "en";
      applyLanguageCode(code);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <RootErrorFallback resetError={resetError} />
      )}
    >
      <AuthProvider>
        <RootLayoutContent />
      </AuthProvider>
    </Sentry.ErrorBoundary>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingOverlay: {
    // React Native 0.86 dropped `absoluteFillObject`; the spread was a no-op,
    // which pushed this cover out of the flex column instead of over the app.
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    backgroundColor: "#ffffff",
    justifyContent: "center",
  },
  deletionOverlay: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  deletionTitle: {
    color: "#182022",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 18,
    textAlign: "center",
  },
  deletionMessage: {
    color: "#526064",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 9,
    textAlign: "center",
  },
  errorFallback: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  errorTitle: {
    color: "#182022",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  errorMessage: {
    color: "#526064",
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#0A8E91",
    borderRadius: 12,
    marginTop: 24,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  recoveryActions: {
    alignItems: "center",
    width: "100%",
  },
  signOutButton: {
    borderColor: "#0A8E91",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  signOutButtonText: {
    color: "#0A7376",
    fontSize: 16,
    fontWeight: "700",
  },
  clearDataButton: {
    borderColor: "#B42318",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  clearDataButtonText: {
    color: "#B42318",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
});
