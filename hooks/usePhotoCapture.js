import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import i18next from "i18next";
import { useContext, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { persistChatAttachment } from "../api/chatAttachments";
import { GlobalContext } from "../context/GlobalContext";

const MAX_IMAGE_DIMENSION = 1_600;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_IMAGE_EDGE = 30_000;
const MAX_SOURCE_IMAGE_PIXELS = 100_000_000;

/**
 * Camera / library photo capture for chat messages.
 *
 * Extracted from `components/PlusMenu.js` so the composer's attach menu and the
 * empty-chat "add from a photo" suggestion share one implementation of the
 * permission prompts, the downscale, and the message payload.
 *
 * - `onCapture(payload)` receives a ready-to-send message:
 *   `{ text: null, imageUri, imageRequestUri, isUser: true }`.
 * - `onFinished()` runs after every attempt, successful or not, so the caller
 *   can close its menu.
 */
export default function usePhotoCapture({ onCapture, onFinished } = {}) {
  const { t } = useTranslation();
  const { settings, storageOwnerUid } = useContext(GlobalContext);
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
    const displayUri = settings?.privacy?.incognito
      ? result.uri
      : await persistChatAttachment(storageOwnerUid, result.uri);
    return { displayUri, requestUri: dataUrl };
  }

  async function captureFromLibrary(launch) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    try {
      const { status } = await launch.requestPermission();
      if (!mountedRef.current) return;
      if (status !== "granted") {
        if (mountedRef.current) {
          Alert.alert(launch.permissionTitle, launch.permissionMessage);
        }
        return;
      }

      const result = await launch.pick();

      if (!mountedRef.current) return;
      if (!result.canceled) {
        const attachment = await prepareJpegAttachment(result.assets[0]);
        if (!mountedRef.current) return;
        await Promise.resolve(
          onCapture?.({
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
          error?.message || launch.failureMessage
        );
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        onFinished?.();
      }
    }
  }

  const takePhoto = () =>
    captureFromLibrary({
      requestPermission: () => ImagePicker.requestCameraPermissionsAsync(),
      permissionTitle: t("plusMenu.cameraPermissionTitle"),
      permissionMessage: t("plusMenu.cameraPermissionMessage"),
      pick: () =>
        ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 }),
      failureMessage: t("plusMenu.photoPrepFailed"),
    });

  const pickPhoto = () =>
    captureFromLibrary({
      // The system picker is out-of-process, so it needs no library permission.
      // Asking for one anyway triggers the full-access prompt that Guideline
      // 5.1.1(iii) tells apps to avoid, and denying it would block a flow that
      // works without it. Report "granted" and let the picker handle access.
      requestPermission: async () => ({ status: "granted" }),
      permissionTitle: t("plusMenu.photoPermissionTitle"),
      permissionMessage: t("plusMenu.photoPermissionMessage"),
      pick: () =>
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.7,
        }),
      failureMessage: t("plusMenu.imagePrepFailed"),
    });

  return { busy, takePhoto, pickPhoto };
}
