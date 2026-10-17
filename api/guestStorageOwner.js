// api/guestStorageOwner.js
//
// Device-local guest identity for the account-free path. Deliberately thin:
// it touches AsyncStorage, which the Node unit tests cannot load, so every rule
// that can be pure lives in guestStoragePolicy.cjs instead.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { v4 as uuidv4 } from "uuid";

import { buildGuestStorageOwnerId } from "./guestStoragePolicy.cjs";

const GUEST_DEVICE_ID_KEY = "@pantrio:guestDeviceId:v1";
const GUEST_MODE_ENABLED_KEY = "@pantrio:guestModeEnabled:v1";

// Startup can ask three times at once (the auth bootstrap, the navigation gate,
// and GlobalContext hydration). One shared promise stops them from racing to
// write different device ids, which would silently split guest data across two
// namespaces that each look correct in isolation.
let guestOwnerPromise = null;

async function readOrCreateDeviceId() {
  const stored = await AsyncStorage.getItem(GUEST_DEVICE_ID_KEY);
  const existing = String(stored || "").trim();
  if (existing) return existing;

  const created = uuidv4();
  await AsyncStorage.setItem(GUEST_DEVICE_ID_KEY, created);
  return created;
}

export function getGuestStorageOwnerId() {
  if (!guestOwnerPromise) {
    guestOwnerPromise = readOrCreateDeviceId()
      .then((deviceId) => buildGuestStorageOwnerId(deviceId))
      .catch((error) => {
        // Never cache a rejection: the next call must retry, or a transient
        // storage failure would strand the app with no storage owner and no
        // way back without reinstalling.
        guestOwnerPromise = null;
        throw error;
      });
  }
  return guestOwnerPromise;
}

export async function isGuestModeEnabled() {
  const stored = await AsyncStorage.getItem(GUEST_MODE_ENABLED_KEY);
  return stored === "true";
}

// Ordering is enforced here rather than trusted to the call site: the device id
// is committed before the preference that resumes guest mode. If the app is
// killed between the two, the next launch shows onboarding again and the data is
// still intact under the same id. The reverse order would resume a guest
// session with no owner, which the data layer can only answer with read-only
// storage and the local-data recovery screen.
export async function enableGuestMode() {
  const ownerId = await getGuestStorageOwnerId();
  await AsyncStorage.setItem(GUEST_MODE_ENABLED_KEY, "true");
  return ownerId;
}

// Leaves guest mode without deleting anything. Signing in calls this so that a
// later sign-out does not silently drop the user back into device data.
export async function disableGuestMode() {
  await AsyncStorage.removeItem(GUEST_MODE_ENABLED_KEY);
}

// Removes the guest identity itself. Data removal is a separate call
// (purgeStoredUserData), so "leave guest mode" and "erase this device's guest
// data" can never be confused for one another.
export async function clearGuestStorageOwner() {
  guestOwnerPromise = null;
  await AsyncStorage.removeItem(GUEST_MODE_ENABLED_KEY);
  await AsyncStorage.removeItem(GUEST_DEVICE_ID_KEY);
}
