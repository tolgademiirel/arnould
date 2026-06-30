/* ============================================================
   sync.js — Firebase ile cihazlar arası bulut senkronu
   - Giriş: POPUPSUZ, tam-sayfa Google yönlendirmesi (OIDC implicit).
     Google'a gidilir, ID token URL fragment'ında (#id_token=...) geri döner,
     signInWithCredential ile Firebase oturumu açılır. Safari/iPhone dahil
     her tarayıcıda çalışır (popup/üçüncü-taraf çerez gerektirmez).
   - Tüm durum tek kullanıcı belgesinde (users/{uid}) JSON blob.
   - localStorage daima yerel gerçektir; bulutla updatedAt'e göre uzlaşır
     (en son değişiklik kazanır).
   ES modülüdür: klasik scriptlerden (window.App) SONRA çalışır.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAwfh5XNo2rvn3ZMMyk_lDdNq-cugVbeFc",
  authDomain: "arnouldweb.firebaseapp.com",
  projectId: "arnouldweb",
  storageBucket: "arnouldweb.firebasestorage.app",
  messagingSenderId: "889161863929",
  appId: "1:889161863929:web:cb3f4b52ae6c78f0078828",
};

// OAuth Web Client ID (Google Cloud → arnouldweb → Credentials)
const OAUTH_CLIENT_ID = "889161863929-9h87mdfeuh11taaju5okeblei7cda513.apps.googleusercontent.com";
const NONCE_KEY = "arnould_oauth_nonce";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const App = (window.App = window.App || {});
const Store = App.Store;

let userDocRef = null;
let unsub = null;
let pushTimer = null;
let currentUser = null;
let onRemote = function () {};

function toast(msg) { if (App.UI && App.UI.toast) App.UI.toast(msg); }

/* ---------- Giriş (popupsuz, tam-sayfa yönlendirme) ---------- */
function randNonce() {
  var a = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
}
// Geri dönüş adresi (Google'da "Authorized redirect URIs"e bu eklenmiş olmalı).
// index.html ile / sonu aynı yere normalize edilir.
function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, "");
}
function buildAuthUrl(nonce) {
  var p = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "id_token",
    scope: "openid email profile",
    nonce: nonce,
    prompt: "select_account",
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}
function signIn() {
  var nonce = randNonce();
  // localStorage (sessionStorage değil): standalone PWA ↔ Safari sıçramasında korunur
  try { localStorage.setItem(NONCE_KEY, nonce); } catch (e) {}
  location.href = buildAuthUrl(nonce);
}
async function doSignOut() {
  try { await signOut(auth); toast("Çıkış yapıldı"); } catch (e) { console.warn(e); }
}

// Google'dan dönüşte URL fragment'ındaki id_token'ı işle
function handleOAuthRedirect() {
  if (!location.hash || location.hash.indexOf("id_token=") === -1) {
    // Hata da fragment veya query'de gelebilir
    if (location.hash.indexOf("error=") !== -1) {
      var ep = new URLSearchParams(location.hash.substring(1));
      toast("Giriş yapılamadı: " + (ep.get("error") || "hata"));
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
    return;
  }
  var hp = new URLSearchParams(location.hash.substring(1));
  var idToken = hp.get("id_token");
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} // token'ı URL'den temizle
  if (!idToken) return;
  // nonce doğrula (replay koruması)
  try {
    var payload = JSON.parse(decodeURIComponent(escape(atob(
      idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    ))));
    var expected = localStorage.getItem(NONCE_KEY);
    try { localStorage.removeItem(NONCE_KEY); } catch (e2) {}
    if (expected && payload.nonce && payload.nonce !== expected) {
      console.warn("nonce uyuşmadı"); return;
    }
  } catch (e) { /* çözümlenemezse yine de devam et */ }
  var cred = GoogleAuthProvider.credential(idToken);
  signInWithCredential(auth, cred).catch(function (e) {
    console.error("Giriş hatası:", e && e.code, e);
    toast("Giriş yapılamadı: " + ((e && e.code) || "bilinmeyen hata"));
  });
}

/* ---------- Buluta yazma (debounce) ---------- */
function schedulePush() {
  if (!userDocRef) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 800);
}
async function pushNow() {
  if (!userDocRef) return;
  try {
    var state = Store.getState();
    await setDoc(userDocRef, { blob: JSON.stringify(state), updatedAt: state.updatedAt || 0 });
  } catch (e) { /* çevrimdışı: sonraki açılışta uzlaşılır */ }
}

/* ---------- Buluttan benimseme ---------- */
function adopt(data) {
  try {
    var remote = JSON.parse(data.blob);
    Store.applyRemote(remote);
    onRemote();
  } catch (e) { console.warn("Bulut verisi okunamadı:", e); }
}

/* ---------- İlk uzlaşma (giriş anında) ---------- */
async function reconcile() {
  var snap;
  try { snap = await getDoc(userDocRef); } catch (e) { return; }
  var localU = (Store.getState().updatedAt) || 0;
  if (!snap.exists()) { await pushNow(); return; }
  var data = snap.data();
  var cloudU = (data && data.updatedAt) || 0;
  if (cloudU > localU) adopt(data);
  else if (localU > cloudU) await pushNow();
}

/* ---------- Gerçek zamanlı dinleme ---------- */
function startRealtime() {
  if (unsub) unsub();
  unsub = onSnapshot(userDocRef, function (snap) {
    if (!snap.exists()) return;
    if (snap.metadata.hasPendingWrites) return;
    var data = snap.data();
    var localU = (Store.getState().updatedAt) || 0;
    if (((data && data.updatedAt) || 0) > localU) adopt(data);
  }, function () {});
}

/* ---------- Menü arayüzü ---------- */
function setUI(user) {
  var signinBtn = document.getElementById("signinBtn");
  var acct = document.getElementById("syncAccount");
  var emailEl = document.getElementById("syncEmail");
  if (!signinBtn || !acct) return;
  if (user) {
    signinBtn.hidden = true;
    acct.hidden = false;
    if (emailEl) emailEl.textContent = user.email || user.displayName || "Hesap";
    var menu = document.getElementById("menuPop");
    if (menu) menu.hidden = true;
  } else {
    signinBtn.hidden = false;
    acct.hidden = true;
  }
}

/* ---------- Oturum durumu ---------- */
onAuthStateChanged(auth, async function (user) {
  currentUser = user;
  setUI(user);
  if (user) {
    userDocRef = doc(db, "users", user.uid);
    await reconcile();
    startRealtime();
    toast("Senkron etkin");
  } else {
    if (unsub) { unsub(); unsub = null; }
    userDocRef = null;
  }
});

// Sayfa açılışında Google dönüşünü işle
handleOAuthRedirect();

/* ---------- Dışa aç ---------- */
App.Sync = {
  signIn: signIn,
  signOut: doSignOut,
  isSignedIn: function () { return !!currentUser; },
};

if (Store && Store.setSaveHook) Store.setSaveHook(schedulePush);
onRemote = (typeof App.onRemoteData === "function") ? App.onRemoteData : function () {};
