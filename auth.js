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
  const checkoutUrl = () => `${window.location.origin}/checkout/`;

  window.MFBAuth = {
    getUser: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      return data.user || null;
    },
    signInWithGoogle: async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: checkoutUrl() }
      });
      if (error) throw error;
    },
    sendMagicLink: async email => {
      const { error } = await supabase.auth.signInWithOtp({
        email: String(email || "").trim(),
        options: { emailRedirectTo: checkoutUrl() }
      });
      if (error) throw error;
    },
    signOut: () => supabase.auth.signOut(),
    onChange: callback => supabase.auth.onAuthStateChange((_event, session) => callback(session?.user || null))
  };
})();
