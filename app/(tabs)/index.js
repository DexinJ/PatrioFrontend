import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GlobalContext } from "../../context/GlobalContext";

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { fridgeItems, shoppingListItems, theme, settings } = useContext(GlobalContext);

  const totalItems = fridgeItems.length;
  const expiringCount = fridgeItems.filter(item => item.expired === "almost").length;
  const expiredCount = fridgeItems.filter(item => item.expired === "expired").length;
  const totalShopping = shoppingListItems.length;
  const fontSize = settings.ux.fontSize || 16;
  const hasExpired = expiredCount > 0;
  const hasExpiring = expiringCount > 0;
  
  const cardState = hasExpired
    ? "expired"
    : hasExpiring
    ? "expiring"
    : "ok";
  
    const cardConfig = {
      ok: {
        bg: theme.shoppingItemBackground, // green
        icon: "checkmark-circle-outline",
        iconColor: theme.actionButton,
        text: t("home.allItemsFresh"),
      },
      expiring: {
        bg: theme.warningBackground,
        icon: "alert-circle-outline",
        iconColor: theme.warning,
        text: t("home.expiringSoon", { count: expiringCount }),
      },
      expired: {
        bg: theme.dangerBackground,
        icon: "warning-outline",
        iconColor: theme.danger,
        text: hasExpiring
          ? t("home.expiredAndExpiring", {
              expiredCount,
              expiringCount,
            })
          : t("home.expired", { count: expiredCount }),
      },
    };
    

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingVertical: 20 }}>
        <View style={{ flex: 1, alignItems: "center" }}>
          {/* Greeting */}
          <Text style={{ fontSize: fontSize * 1.4, fontWeight: "bold", marginBottom: 5, textAlign: "center", color: theme.textPrimary }}>
            {t("home.welcomeBackName", { name: settings.user.name })}
          </Text>
          <Text style={{ fontSize: fontSize, marginBottom: 20, textAlign: "center", color: theme.textSecondary }}>
            {t("home.whatsHappening")}
          </Text>
      
          {/* Dashboard Cards */}
          <View style={{ width: "100%", marginBottom: 30 }}>
            <TouchableOpacity style={[styles.card, { backgroundColor: theme.card }]} onPress={() => router.push("/fridge")}>
              <Ionicons name="cube-outline" size={fontSize * 2} color={theme.actionButton} />
              <Text style={[styles.cardText, { fontSize, color: theme.textPrimary }]}>
                {t("home.itemsInFridge", { count: totalItems })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.card,
                { backgroundColor: cardConfig[cardState].bg },
              ]}
              onPress={() => router.push("/fridge")}
            >
              <Ionicons
                name={cardConfig[cardState].icon}
                size={fontSize * 2}
                color={cardConfig[cardState].iconColor}
              />

              <Text
                style={[
                  styles.cardText,
                  {
                    fontSize,
                    color: theme.textPrimary,
                    textAlign: "center",
                  },
                ]}
              >
                {cardConfig[cardState].text}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.card, { backgroundColor: theme.card }]} onPress={() => router.push("/list")}>
              <Ionicons name="cart-outline" size={fontSize * 2} color={theme.accent} />
              <Text style={[styles.cardText, { fontSize, color: theme.textPrimary }]}>
                {t("home.onShoppingList", { count: totalShopping })}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Actions */}
          <View style={{ flexDirection: "row", justifyContent: "space-around", width: "100%" }}>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.actionButton }]} onPress={() => router.push("/fridge")}>
              <Ionicons name="add-circle-outline" size={fontSize * 1.5} color="#fff" />
              <Text style={[styles.actionText, { fontSize }]}>{t("home.addItem")}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.actionButton }]} onPress={() => router.push("/chat")}>
              <Ionicons name="chatbubble-ellipses-outline" size={fontSize * 1.5} color="#fff" />
              <Text style={[styles.actionText, { fontSize }]}>{t("home.openChat")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 15,
    elevation: 3,
  },
  cardText: { marginTop: 8, fontWeight: "600", textAlign: "center" },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    marginHorizontal: 5,
    justifyContent: "center",
  },
  actionText: { color: "#fff", marginLeft: 8, fontWeight: "600" },
});
