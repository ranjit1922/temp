// main.js
// App core: IndexedDB wrapper, todos in-memory, settings storage, and exports used by ui.js

const DB_NAME = "TodoAppDB";
const DB_VERSION = 1;
const TODOS_STORE = "todos";
const SETTINGS_STORE = "settings";

let db = null;
let todos = []; // in-memory cache

/* -------------------------
   IndexedDB helpers
------------------------- */
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = (e) => reject(e.target.error);
    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    req.onupgradeneeded = (e) => {
      const _db = e.target.result;
      if (!_db.objectStoreNames.contains(TODOS_STORE)) {
        const store = _db.createObjectStore(TODOS_STORE, { keyPath: "id" });
        store.createIndex("completed", "completed", { unique: false });
        store.createIndex("priority", "priority", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!_db.objectStoreNames.contains(SETTINGS_STORE)) {
        _db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };
  });
}

function withStore(storeName, mode, callback) {
  return openDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction([storeName], mode);
        const store = tx.objectStore(storeName);
        let called = false;

        tx.oncomplete = () => {
          if (!called) {
            called = true;
            resolve();
          }
        };
        tx.onerror = () => {
          if (!called) {
            called = true;
            reject(tx.error);
          }
        };

        // callback can return a Promise or value; we resolve when tx completes
        try {
          const value = callback(store);
          // If callback returned a promise, let it run; still resolve after tx completes.
          Promise.resolve(value).catch(() => { /* ignore here; tx.onerror will surface */ });
        } catch (err) {
          reject(err);
        }
      })
  );
}

function getAllFromStore(storeName) {
  return openDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction([storeName], "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function putToStore(storeName, value) {
  return openDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function deleteFromStore(storeName, key) {
  return openDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}

function clearStore(storeName) {
  return openDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}

/* -------------------------
   Initialization & loading
------------------------- */
export async function initDB() {
  await openDB();
}

export async function loadTodos() {
  try {
    const result = await getAllFromStore(TODOS_STORE);
    // normalize / migrate old todos
    todos = (result || []).map((t) => ({
      id: String(t.id),
      title: t.title || "",
      description: t.description || "",
      notes: t.notes || "",
      priority: t.priority || "medium",
      completed: !!t.completed,
      selected: !!t.selected, // default false if absent
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || t.createdAt || new Date().toISOString(),
    }));
    // sort by createdAt desc
    todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return todos;
  } catch (err) {
    console.error("loadTodos error:", err);
    todos = [];
    return [];
  }
}

/* -------------------------
   Accessors & CRUD
------------------------- */
export function getTodos() {
  return todos;
}

export async function addTodo(todo) {
  if (!todo || !todo.id) throw new Error("todo must have an id");
  await putToStore(TODOS_STORE, todo);
  // keep in-memory consistent
  todos.unshift(todo);
  return todo;
}

export async function updateTodo(todo) {
  if (!todo || !todo.id) throw new Error("todo must have an id");
  todo.updatedAt = new Date().toISOString();
  await putToStore(TODOS_STORE, todo);
  // update in-memory
  const idx = todos.findIndex((t) => t.id === todo.id);
  if (idx > -1) {
    todos[idx] = todo;
  } else {
    todos.unshift(todo);
  }
  return todo;
}

export async function deleteTodo(id) {
  if (!id) throw new Error("id required");
  await deleteFromStore(TODOS_STORE, id);
  todos = todos.filter((t) => t.id !== id);
}

/* -------------------------
   Bulk / utility ops
------------------------- */
export async function clearCompleted() {
  // delete completed items from DB
  const toDelete = todos.filter((t) => t.completed).map((t) => t.id);
  for (const id of toDelete) {
    await deleteFromStore(TODOS_STORE, id);
  }
  todos = todos.filter((t) => !t.completed);
}

export async function clearAllData() {
  await clearStore(TODOS_STORE);
  await clearStore(SETTINGS_STORE);
  // also clear client-side caches
  todos = [];
  try {
    localStorage.clear();
  } catch (e) {
    // ignore
  }
}

/**
 * Export selected todos by ids as a Blob (JSON). UI will trigger download.
 * If ids omitted, export all.
 */
export async function exportTodosAsJSON(ids = null) {
  const items = ids && ids.length ? todos.filter((t) => ids.includes(t.id)) : todos;
  const json = JSON.stringify(items, null, 2);
  return new Blob([json], { type: "application/json" });
}

/* -------------------------
   Settings (simple key/value)
------------------------- */
export async function setSetting(key, value) {
  if (!key) throw new Error("setting key required");
  const payload = { key, value };
  await putToStore(SETTINGS_STORE, payload);
  return payload;
}

export async function getSetting(key) {
  if (!key) return null;
  const all = await getAllFromStore(SETTINGS_STORE);
  const rec = (all || []).find((r) => r.key === key);
  return rec ? rec.value : null;
}

/* -------------------------
   Theme helpers
------------------------- */
export async function setTheme(themeName) {
  // themeName can be 'auto'|'light'|'dark'|'solar'|'pastel'|'high-contrast'
  // persist
  try {
    await setSetting("theme", themeName);
  } catch (e) {
    // fallback to localStorage if IndexedDB write fails
    try {
      localStorage.setItem("theme", themeName);
    } catch {}
  }

  // apply effective theme to document
  let effective = themeName;
  if (themeName === "auto") {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    effective = prefersDark ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", effective);
  return effective;
}

export async function getTheme() {
  let value = null;
  try {
    value = await getSetting("theme");
  } catch (e) {
    try {
      value = localStorage.getItem("theme");
    } catch {}
  }
  return value || "light";
}

/* -------------------------
   Export default helpers (optional)
------------------------- */
export default {
  initDB,
  loadTodos,
  getTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  clearCompleted,
  clearAllData,
  exportTodosAsJSON,
  setTheme,
  getTheme,
};