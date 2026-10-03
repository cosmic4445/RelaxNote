const VERSION = "12.19.0";
const BASE = "https://www.gstatic.com/firebasejs/" + VERSION + "/";

async function boot() {
  const api = { configured: false, error: "", user: null };
  window.rnAuth = api;
  try {
    const cfg = await (await fetch("/api/config")).json();
    if (!cfg.configured) {
      api.error = "Sign-in is not set up on this server yet.";
      return;
    }
    const appMod = await import(BASE + "firebase-app.js");
    const authMod = await import(BASE + "firebase-auth.js");
    const app = appMod.initializeApp(cfg.firebase);
    const auth = authMod.getAuth(app);
    api.configured = true;

    api.signUp = async (name, email, password) => {
      const cred = await authMod.createUserWithEmailAndPassword(auth, email, password);
      await authMod.updateProfile(cred.user, { displayName: name });
      await authMod.sendEmailVerification(cred.user);
      await cred.user.getIdToken(true);
    };
    api.signIn = (email, password) => authMod.signInWithEmailAndPassword(auth, email, password);
    api.google = () => authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
    api.signOut = () => authMod.signOut(auth);
    api.reset = email => authMod.sendPasswordResetEmail(auth, email);
    api.resend = () => authMod.sendEmailVerification(auth.currentUser);
    api.refresh = async () => {
      if (!auth.currentUser) return;
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
    };
    api.token = async () => (auth.currentUser ? auth.currentUser.getIdToken() : null);

    authMod.onAuthStateChanged(auth, user => {
      api.user = user;
      window.dispatchEvent(new CustomEvent("rnauth-change", { detail: !!user }));
    });
  } catch (e) {
    api.configured = false;
    api.error = "Could not load sign-in. Check your internet connection and reload.";
  } finally {
    window.dispatchEvent(new Event("rnauth-ready"));
  }
}

boot();
