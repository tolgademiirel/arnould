/* ============================================================
   sync.js — Firebase ile cihazlar arası bulut senkronu
   - GİRİŞ: Firebase native signInWithRedirect. Uygulama Firebase
     Hosting'ten (arnouldweb.web.app) sunulduğu için app origin === authDomain
     → çapraz-alan/ITP sorunu YOK; iOS Safari VE kurulu (standalone) PWA'da
     çalışır. Firebase bekleyen redirect'i IndexedDB'de saklar; standalone
     aynı origin'de bu depoyu paylaştığı için token geri döner.
   - Tüm durum tek kullanıcı belgesinde (users/{uid}) JSON blob.
   - localStorage daima yerel gerçektir; updatedAt ile last-write-wins uzlaşır.
   ES modülüdür: klasik scriptlerden (window.App) SONRA çalışır.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAwfh5XNo2rvn3ZMMyk_lDdNq-cugVbeFc",
  // authDomain = uygulamanın sunulduğu origin (Firebase Hosting) → same-origin auth.
  // firebaseapp.com kullanıyoruz çünkü /__/auth/handler redirect URI'si OAuth
  // client'ta zaten kayıtlı (web.app için ek kayıt gerekirdi). Kullanıcı da bu
  // adresten (arnouldweb.firebaseapp.com) açmalı → app origin === authDomain.
  authDomain: "arnouldweb.firebaseapp.com",
  projectId: "arnouldweb",
  storageBucket: "arnouldweb.firebasestorage.app",
  messagingSenderId: "889161863929",
  appId: "1:889161863929:web:cb3f4b52ae6c78f0078828",
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const App = (window.App = window.App || {});
const Store = App.Store;

let userDocRef = null;
let unsub = null;
let pushTimer = null;
let currentUser = null;
let onRemote = function () {};

function toast(msg) { if (App.UI && App.UI.toast) App.UI.toast(msg); }

/* ---------- Giriş / çıkış (tam-sayfa yönlendirme, same-origin) ---------- */
async function signIn() {
  try {
    await signInWithRedirect(auth, provider);
  } catch (e) {
    console.error("Giriş hatası:", e && e.code, e);
    toast("Giriş yapılamadı: " + ((e && e.code) || "bilinmeyen hata"));
  }
}
async function doSignOut() {
  try { await signOut(auth); toast("Çıkış yapıldı"); } catch (e) { console.warn(e); }
}

// Sayfa açılışında yönlendirme dönüşünü tamamla (hata olursa kodu göster)
getRedirectResult(auth).catch(function (e) {
  console.error("Yönlendirme dönüş hatası:", e && e.code, e);
  if (e && e.code) toast("Giriş yapılamadı: " + e.code);
});

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

/* ---------- Dışa aç ---------- */
App.Sync = {
  signIn: signIn,
  signOut: doSignOut,
  isSignedIn: function () { return !!currentUser; },
};

if (Store && Store.setSaveHook) Store.setSaveHook(schedulePush);
onRemote = (typeof App.onRemoteData === "function") ? App.onRemoteData : function () {};
