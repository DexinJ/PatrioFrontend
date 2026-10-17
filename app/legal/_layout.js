// app/legal/_layout.js
// The legal notices screen lives in the root stack, outside the `(tabs)`
// group that normally mounts `GlobalProvider`. React context does not cross
// navigator boundaries, so without a provider here `useContext(GlobalContext)`
// returns undefined and destructuring `theme` crashes the screen
// ("Cannot read property 'theme' of undefined"). Provide the shared context for
// this route.
//
// The authenticated user is passed in so the provider hydrates that account's
// stored settings, which is what makes this page honour the chosen theme and
// font size instead of always rendering the defaults. The route is only
// reachable while signed in: app/_layout.js declares it inside the
// `Boolean(user)` Stack.Protected group. (The `(auth)` group mounts the same
// provider without a user, which is correct there - nobody is signed in yet.)
import { Stack } from "expo-router";
import { GlobalProvider } from "../../context/GlobalContext";
import { useAuth } from "../../auth/useAuth";

export default function LegalLayout() {
  const { user } = useAuth();

  return (
    <GlobalProvider authUser={user ?? null}>
      <Stack screenOptions={{ headerShown: false }} />
    </GlobalProvider>
  );
}
