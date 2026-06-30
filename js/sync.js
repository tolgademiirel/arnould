/* ============================================================
   sync.js — Firebase ile cihazlar arası bulut senkronu
   - Google ile giriş (web: popup, mobil/standalone: redirect)
   - Tüm durum tek bir kullanıcı belgesinde (users/{uid}) JSON blob
   - localStorage daima yerel gerçektir; bulutla updatedAt'e göre uzlaşır
     (en son değişiklik kazanır). Çevrimdışı yapılan değişiklikler bir
     sonraki çevrimiçi açılışta buluta itilir.
   ES modülüdür: klasik scriptlerden (window.App) SONRA çalışır.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged
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

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const provider = new GoogleAuthProvider();

const App = (window.App = window.App || {});
const Store = App.Store;

let userDocRef = null;
let unsub = null;
let pushTimer = null;
let currentUser = null;
let onRemote = function () {};

function toast(msg) { if (App.UI && App.UI.toast) App.UI.toast(msg); }

function isMobileOrStandalone() {
  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  return standalone || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/* ---------- Giriş / çıkış ---------- */
async function signIn() {
  // POPUP'ı her platformda öncele: signInWithRedirect, uygulama alan adı
  // (github.io) ile authDomain (firebaseapp.com) farklı olduğunda mobil
  // tarayıcılarda çerez/depolama kısıtları yüzünden oturumu kaybediyor.
  // Popup aynı origin'e postMessage ile döndüğü için çapraz-alana bağımlı değil.
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    var code = (e && e.code) || "";
    console.error("ARNOULD giriş hatası:", code, e);
    // Popup engellendi/desteklenmiyor (örn. kurulu PWA standalone) → redirect'e düş
    if (/popup-blocked|popup-closed|cancelled-popup|operation-not-supported|web-storage-unsupported/i.test(code)) {
      try { await signInWithRedirect(auth, provider); return; }
      catch (e2) { console.error("Yönlendirme de başarısız:", e2); code = (e2 && e2.code) || code; }
    }
    toast("Giriş yapılamadı: " + (code || "bilinmeyen hata"));
  }
}
async function doSignOut() {
  try { await signOut(auth); toast("Çıkış yapıldı"); }
  catch (e) { console.warn(e); }
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
  } catch (e) {
    // Çevrimdışı: localStorage zaten kaydetti; sonraki açılışta uzlaşılır
  }
}

/* ---------- Buluttan benimseme ---------- */
function adopt(data) {
  try {
    var remote = JSON.parse(data.blob);
    Store.applyRemote(remote);   // sessiz: updatedAt korunur, tekrar push yok
    onRemote();                  // arayüzü yeniden çiz
  } catch (e) { console.warn("Bulut verisi okunamadı:", e); }
}

/* ---------- İlk uzlaşma (giriş anında) ---------- */
async function reconcile() {
  var snap;
  try { snap = await getDoc(userDocRef); }
  catch (e) { return; } // çevrimdışı: yerelle devam
  var localU = (Store.getState().updatedAt) || 0;
  if (!snap.exists()) { await pushNow(); return; }          // bulut boş → yereli yükle
  var data = snap.data();
  var cloudU = (data && data.updatedAt) || 0;
  if (cloudU > localU) adopt(data);                          // bulut daha yeni → benimse
  else if (localU > cloudU) await pushNow();                 // yerel daha yeni → yükle
}

/* ---------- Gerçek zamanlı dinleme (diğer cihazlar) ---------- */
function startRealtime() {
  if (unsub) unsub();
  unsub = onSnapshot(userDocRef, function (snap) {
    if (!snap.exists()) return;
    if (snap.metadata.hasPendingWrites) return; // kendi yazımız
    var data = snap.data();
    var localU = (Store.getState().updatedAt) || 0;
    if (((data && data.updatedAt) || 0) > localU) adopt(data);
  }, function () { /* hata: yoksay */ });
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

// Mobil yönlendirme dönüşü (varsa) — hata olursa kodu göster
getRedirectResult(auth).catch(function (e) {
  console.error("Yönlendirme dönüş hatası:", e && e.code, e);
  if (e && e.code) toast("Giriş yapılamadı: " + e.code);
});

/* ---------- Dışa aç ---------- */
App.Sync = {
  signIn: signIn,
  signOut: doSignOut,
  isSignedIn: function () { return !!currentUser; },
};

// Kaydetme kancası: her gerçek değişiklikte buluta it
if (Store && Store.setSaveHook) Store.setSaveHook(schedulePush);
// Uzaktan veri gelince yeniden çizim için app.js'in sağladığı geri çağrı
onRemote = (typeof App.onRemoteData === "function") ? App.onRemoteData : function () {};
