// script.js
// Entry point. Lazy-loads ui.js and shows a loading spinner overlay during init and long actions.

let uiModule = null;
let initPromise = null;

/* -------------------------
   Overlay helpers
------------------------- */
function showLoader(message = "") {
  let loader = document.getElementById("app-loader");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "app-loader";
    loader.style.position = "fixed";
    loader.style.top = "0";
    loader.style.left = "0";
    loader.style.width = "100%";
    loader.style.height = "100%";
    loader.style.background = "rgba(0,0,0,0.4)";
    loader.style.display = "flex";
    loader.style.flexDirection = "column";
    loader.style.alignItems = "center";
    loader.style.justifyContent = "center";
    loader.style.zIndex = "9999";
    loader.innerHTML = `
      <div class="loader-spinner" style="
        width:48px;
        height:48px;
        border:4px solid #fff;
        border-top:4px solid transparent;
        border-radius:50%;
        animation:spin 1s linear infinite;
      "></div>
      <div id="loader-msg" style="margin-top:12px;color:#fff;font-size:1rem;"></div>
      <style>
        @keyframes spin { 
          0% { transform: rotate(0deg); } 
          100% { transform: rotate(360deg); } 
        }
      </style>
    `;
    document.body.appendChild(loader);
  }
  const msgEl = loader.querySelector("#loader-msg");
  if (msgEl) msgEl.textContent = message;
  loader.style.display = "flex";
}

function hideLoader() {
  const loader = document.getElementById("app-loader");
  if (loader) loader.style.display = "none";
}

/* -------------------------
   Lazy loading
------------------------- */
async function loadUI() {
  if (uiModule) return uiModule;
  if (!initPromise) {
    showLoader("Loading app…");
    initPromise = import("./ui.js")
      .then((mod) => {
        uiModule = mod;
        return uiModule.initUI();
      })
      .finally(() => hideLoader());
  }
  await initPromise;
  return uiModule;
}

/* -------------------------
   Attach global loader hooks
------------------------- */
function attachLoaderHooks() {
  if (!uiModule) return;

  // Wrap long ops to show loader
  const longOps = ["clearAllData", "exportSelected", "handleClearCompleted"];

  longOps.forEach((fn) => {
    if (typeof uiModule[fn] === "function") {
      const original = uiModule[fn];
      uiModule[fn] = async function (...args) {
        showLoader("Working…");
        try {
          return await original.apply(this, args);
        } finally {
          hideLoader();
        }
      };
    }
  });
}

/* -------------------------
   Bootstrap
------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const addBtn = document.getElementById("add-todo-btn");
  const themeToggle = document.getElementById("theme-toggle");
  const settingsBtn = document.getElementById("settings-btn");

  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      await loadUI();
      attachLoaderHooks();
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", async () => {
      await loadUI();
      attachLoaderHooks();
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", async () => {
      await loadUI();
      attachLoaderHooks();
    });
  }

  // Preload when list comes into view
  const listEl = document.getElementById("todo-list");
  if (listEl && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(async (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        await loadUI();
        attachLoaderHooks();
        observer.disconnect();
      }
    });
    observer.observe(listEl);
  }
});

/* -------------------------
   Manual start fallback
------------------------- */
window.App = {
  async start() {
    const mod = await loadUI();
    attachLoaderHooks();
    return mod;
  },
};