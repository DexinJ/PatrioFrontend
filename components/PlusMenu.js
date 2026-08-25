import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import i18next from "i18next";
import React, { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { persistChatAttachment } from "../api/chatAttachments";
import { GlobalContext } from "../context/GlobalContext";

const MAX_IMAGE_DIMENSION = 1_600;
// const MAX_IMAGE_DATA_URL_LENGTH = 4 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_IMAGE_EDGE = 30_000;
const MAX_SOURCE_IMAGE_PIXELS = 100_000_000;

export default function PlusMenu({ onSend }) {
  const { t } = useTranslation();
  const { settings, storageOwnerUid, theme } = useContext(GlobalContext);
  const fontSize = settings?.ux?.fontSize || 16;
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function prepareJpegAttachment(asset) {
    if (!asset || typeof asset.uri !== "string" || !asset.uri.trim()) {
      throw new Error(i18next.t("plusMenu.imageMissingFile"));
    }

    const sourceBytes = Number(asset.fileSize);
    if (Number.isFinite(sourceBytes) && sourceBytes > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error(i18next.t("plusMenu.imageTooLarge"));
    }

    const width = Number(asset.width);
    const height = Number(asset.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error(i18next.t("plusMenu.imageInvalidDimensions"));
    }
    if (
      width > MAX_SOURCE_IMAGE_EDGE ||
      height > MAX_SOURCE_IMAGE_EDGE ||
      width * height > MAX_SOURCE_IMAGE_PIXELS
    ) {
      throw new Error(i18next.t("plusMenu.imageTooManyPixels"));
    }

    const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
    const longestEdge = Math.max(width, height);

    if (longestEdge > MAX_IMAGE_DIMENSION) {
      const scale = MAX_IMAGE_DIMENSION / longestEdge;
      ctx.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      });
    }

    const imageRef = await ctx.renderAsync();
    const result = await imageRef.saveAsync({
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.65,
      base64: true,
    });
    if (!result.base64) throw new Error(i18next.t("plusMenu.base64Failed"));
    const dataUrl = `data:image/jpeg;base64,${result.base64}`;
    // if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    //   throw new Error("The selected image is too large to send.");
    // }
    const displayUri = settings?.privacy?.incognito
      ? result.uri
      : await persistChatAttachment(storageOwnerUid, result.uri);
    return { displayUri, requestUri: dataUrl };
  }

  const takePhoto = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (!mountedRef.current) return;
      if (status !== "granted") {
        if (mountedRef.current) {
          Alert.alert(
            t("plusMenu.cameraPermissionTitle"),
            t("plusMenu.cameraPermissionMessage")
          );
        }
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });

      if (!mountedRef.current) return;
      if (!result.canceled) {
        const asset = result.assets[0];
        const attachment = await prepareJpegAttachment(asset);
        if (!mountedRef.current) return;
        await Promise.resolve(
          onSend?.({
            text: null,
            imageUri: attachment.displayUri,
            imageRequestUri: attachment.requestUri,
            isUser: true,
          })
        );
      }
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          t("plusMenu.imageTitle"),
          error?.message || t("plusMenu.photoPrepFailed")
        );
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        setMenuOpen(false);
      }
    }
  };

  const pickPhoto = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mountedRef.current) return;
      if (status !== "granted") {
        if (mountedRef.current) {
          Alert.alert(
            t("plusMenu.photoPermissionTitle"),
            t("plusMenu.photoPermissionMessage")
          );
        }
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });

      if (!mountedRef.current) return;
      if (!result.canceled) {
        const asset = result.assets[0];
        const attachment = await prepareJpegAttachment(asset);
        if (!mountedRef.current) return;
        await Promise.resolve(
          onSend?.({
            text: null,
            imageUri: attachment.displayUri,
            imageRequestUri: attachment.requestUri,
            isUser: true,
          })
        );
      }
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          t("plusMenu.imageTitle"),
          error?.message || t("plusMenu.imagePrepFailed")
        );
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        setMenuOpen(false);
      }
    }
  };

  return (
    <View>
      {/* Floating + button */}
        <TouchableOpacity
        style={[
            styles.plusButton,
            {
            padding: fontSize * 0.6,
            backgroundColor: theme.actionButton, // ✅ use from theme
            },
        ]}
        onPress={() => setMenuOpen((open) => !open)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={
          menuOpen ? t("plusMenu.closeMenu") : t("plusMenu.addPhoto")
        }
        accessibilityState={{ disabled: busy, expanded: menuOpen }}
        >
        <Ionicons
            name="add"
            size={fontSize * 1.2}
            color="#fff" // always white for contrast
        />
        </TouchableOpacity>

      {/* Dropdown menu */}
      {menuOpen && (
        <View
          style={[
            styles.menu,
            { backgroundColor: theme.card, minWidth: Math.max(fontSize * 10, 140) },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.menuItem,
              {
                paddingVertical: fontSize * 0.6,
                paddingHorizontal: fontSize * 0.5,
                backgroundColor: theme.background,
              },
            ]}
            onPress={takePhoto}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("plusMenu.takeAPhoto")}
            accessibilityState={{ disabled: busy }}
          >
            <Ionicons name="camera" size={fontSize} color={theme.textPrimary} />
            <Text style={[styles.menuText, { fontSize, color: theme.textPrimary }]} numberOfLines={1}>
              {t("plusMenu.takeAPhoto")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.menuItem,
              {
                paddingVertical: fontSize * 0.6,
                paddingHorizontal: fontSize * 0.5,
                backgroundColor: theme.background,
              },
            ]}
            onPress={pickPhoto}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("plusMenu.chooseFromGallery")}
            accessibilityState={{ disabled: busy }}
          >
            <Ionicons name="image" size={fontSize} color={theme.textPrimary} />
            <Text style={[styles.menuText, { fontSize, color: theme.textPrimary }]} numberOfLines={1}>
              {t("plusMenu.pickFromGallery")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plusButton: {
    borderRadius: 20,
    marginRight: 5,
  },
  menu: {
    position: "absolute",
    bottom: 50,
    left: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
  },
  menuText: {
    marginLeft: 12,
    flexGrow: 1,
    flexShrink: 0,
  },
});
