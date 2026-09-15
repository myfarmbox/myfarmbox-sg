/* MyFarmBox Singapore — customer authentication */
(() => {
  "use strict";

  const SUPABASE_URL = "https://fhpmjktulcztkvzoxoss.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_O2_Mx3_blbVU9Q8gZ40IrA_bDaN8FnF";

  function client() {
    if (!window.supabase) throw new Error("Sign-in is temporarily unavailable.");
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  const supabase = client();
  const defaultRedirectUrl = () => `${window.location.origin}/checkout/`;

  window.MFBAuth = {
    getUser: async () => {
      // After an OAuth redirect, the browser may need a moment to persist
      // the returned session before page code asks for it.
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) return data.session.user;
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }
      return null;
    },
    signInWithGoogle: async (redirectTo = defaultRedirectUrl()) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
      });
      if (error) throw error;
    },
    sendMagicLink: async (email, redirectTo = defaultRedirectUrl()) => {
      const { error } = await supabase.auth.signInWithOtp({
        email: String(email || "").trim(),
        options: { emailRedirectTo: redirectTo }
      });
      if (error) throw error;
    },
    signOut: () => supabase.auth.signOut(),
    onChange: callback => supabase.auth.onAuthStateChange((_event, session) => callback(session?.user || null))
  };
})();
