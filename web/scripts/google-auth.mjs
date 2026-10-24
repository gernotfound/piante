// Adapted as a small, dependency-free module from LogBook's Google popup
// failure classification. Do not import LogBook's PWA/guest migration state.
export function classifyGooglePopupFailure(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code === "auth/popup-blocked" ||
      code === "auth/operation-not-supported-in-this-environment") return "redirect";
  if (code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request") return "cancelled";
  if (code === "auth/network-request-failed") return "network";
  return "error";
}

export async function signInGoogle(auth, api) {
  const provider = new api.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await api.signInWithPopup(auth, provider);
    return "signed_in";
  } catch(error) {
    const reason = classifyGooglePopupFailure(error);
    if (reason === "cancelled") return "cancelled";
    if (reason === "redirect") {
      await api.signInWithRedirect(auth, provider);
      return "redirect_started";
    }
    if (reason === "network") {
      throw new Error("Connessione assente: controlla la rete e riprova.");
    }
    throw new Error("Accesso Google non riuscito. Controlla le autorizzazioni e riprova.");
  }
}
