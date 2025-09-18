// ui.js
// Module that manages DOM rendering, event binding and user interactions.
// Depends on exported functions from main.js and parseMarkdown from markdown.js

import {
  initDB,
  loadTodos,
  getTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  clearAllData,
  clearCompleted,
  exportTodosAsJSON, // optional helper in main.js; fallback handled below
  setTheme,
  getTheme,
} from "./main.js";
import { parseMarkdown } from "./markdown.js";

/* --- State --- */
let currentFilter = "all"; // "all" | "active" | "completed"
let containerElements = {}; // cached DOM elements

/* --- Initialization --- */
export async function initUI() {
  cacheElements();
  bindStaticEventListeners();

  try {
    await initDB();
    await loadTodos();
  } catch (err) {
    console.error("DB init/load error:", err);
    // proceed; UI will show empty state
  }

  applyInitialTheme();
  renderTodos();
  updateStats();
}

/* --- Element cache & helpers --- */
function cacheElements() {
  containerElements = {
    todoList: document.getElementById("todo-list"),
    todoTemplate: document.getElementById("todo-template"),
    addBtn: document.getElementById("add-todo-btn"),
    addModal: document.getElementById("add-todo-modal"),
    addForm: document.getElementById("add-todo-modal-form"),
    closeAdd: document.getElementById("close-add-modal"),
    cancelAdd: document.getElementById("cancel-add-modal"),
    editModal: document.getElementById("edit-todo-modal"),
    editForm: document.getElementById("edit-todo-modal-form"),
    closeEdit: document.getElementById("close-edit-modal"),
    cancelEdit: document.getElementById("cancel-edit-modal"),
    selectAll: document.getElementById("select-all"),
    bulkActions: document.querySelector(".bulk-actions"),
    deleteSelected: document.getElementById("delete-selected"),
    completeSelected: document.getElementById("complete-selected"),
    deselectAll: document.getElementById("deselect-all"),
    clearCompletedBtn: document.getElementById("clear-completed"),
    exportSelectedBtn: document.getElementById("export-selected"),
    filterBtns: document.querySelectorAll(".filter-btn"),
    themeToggle: document.getElementById("theme-toggle"),
    themeSetting: document.getElementById("theme-setting"),
    settingsBtn: document.getElementById("settings-btn"),
    settingsPanel: document.getElementById("settings-panel"),
    closeSettings: document.getElementById("close-settings"),
    clearAllDataBtn: document.getElementById("clear-all-data"),
    todoCount: document.getElementById("todo-count"),
    completedCount: document.getElementById("completed-count"),
    // modal inputs
    addTitle: document.getElementById("modal-todo-title"),
    addPriority: document.getElementById("modal-priority-select"),
    addDescription: document.getElementById("modal-description"),
    addNotes: document.getElementById("modal-notes"),
    editTitle: document.getElementById("edit-todo-title"),
    editPriority: document.getElementById("edit-priority-select"),
    editDescription: document.getElementById("edit-description"),
    editNotes: document.getElementById("edit-notes"),
  };
}

/* --- Static event bindings (buttons that don't change per-todo) --- */
function bindStaticEventListeners() {
  // Add modal open
  containerElements.addBtn.addEventListener("click", openAddModal);

  // Add modal form
  containerElements.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleAddTodo();
  });
  containerElements.closeAdd.addEventListener("click", closeAddModal);
  containerElements.cancelAdd.addEventListener("click", closeAddModal);
  containerElements.addModal.addEventListener("click", (e) => {
    if (e.target.id === "add-todo-modal") closeAddModal();
  });

  // Edit modal form
  containerElements.editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSaveEdit();
  });
  containerElements.closeEdit.addEventListener("click", closeEditModal);
  containerElements.cancelEdit.addEventListener("click", closeEditModal);
  containerElements.editModal.addEventListener("click", (e) => {
    if (e.target.id === "edit-todo-modal") closeEditModal();
  });

  // Bulk controls
  containerElements.selectAll.addEventListener("change", (e) => {
    handleSelectAll(e.target.checked);
  });
  containerElements.deleteSelected.addEventListener("click", handleDeleteSelected);
  containerElements.completeSelected.addEventListener("click", handleCompleteSelected);
  containerElements.deselectAll.addEventListener("click", handleDeselectAll);
  containerElements.clearCompletedBtn.addEventListener("click", handleClearCompleted);
  containerElements.exportSelectedBtn.addEventListener("click", handleExportSelected);

  // Filters
  containerElements.filterBtns.forEach((btn) =>
    btn.addEventListener("click", (e) => {
      setFilter(e.target.dataset.filter);
    })
  );

  // Theme & settings
  containerElements.themeToggle.addEventListener("click", toggleTheme);
  containerElements.themeSetting.addEventListener("change", (e) => {
    setTheme(e.target.value);
  });
  containerElements.settingsBtn.addEventListener("click", () => {
    containerElements.settingsPanel.style.display = "flex";
  });
  containerElements.closeSettings.addEventListener("click", () => {
    containerElements.settingsPanel.style.display = "none";
  });
  containerElements.settingsPanel.addEventListener("click", (e) => {
    if (e.target.id === "settings-panel") containerElements.settingsPanel.style.display = "none";
  });

  // Clear all data
  containerElements.clearAllDataBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to clear all todos and settings?")) return;
    try {
      await clearAllData();
      await loadTodos();
      renderTodos();
      updateStats();
      containerElements.settingsPanel.style.display = "none";
    } catch (err) {
      console.error("clearAllData error:", err);
      alert("Failed to clear data.");
    }
  });

  // keyboard Escape to close modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAddModal();
      closeEditModal();
      containerElements.settingsPanel.style.display = "none";
    }
  });
}

/* --- Theme helpers --- */
function applyInitialTheme() {
  const saved = getTheme ? getTheme() : localStorage.getItem("theme") || "light";
  if (saved) {
    setTheme(saved);
    if (containerElements.themeSetting) containerElements.themeSetting.value = saved;
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
  if (containerElements.themeSetting) containerElements.themeSetting.value = next;
}

/* --- Render / Re-render --- */
export function renderTodos() {
  const todos = getTodos ? getTodos() : [];
  const list = containerElements.todoList;
  const template = containerElements.todoTemplate;

  // Clear list
  list.innerHTML = "";

  // Filter
  let filtered = todos;
  if (currentFilter === "active") filtered = todos.filter((t) => !t.completed);
  else if (currentFilter === "completed") filtered = todos.filter((t) => t.completed);

  // Render items
  filtered.forEach((todo) => {
    const node = template.content.cloneNode(true);
    const li = node.querySelector(".todo-item");
    const checkboxSelect = node.querySelector(".todo-select");
    const completeToggle = node.querySelector(".complete-toggle");
    const editBtn = node.querySelector(".edit-btn");
    const dupBtn = node.querySelector(".duplicate-btn");
    const delBtn = node.querySelector(".delete-btn");
    const expandBtn = node.querySelector(".expand-btn");

    // dataset & classes
    li.dataset.id = todo.id;
    li.dataset.priority = todo.priority || "medium";
    if (todo.completed) li.classList.add("completed");

    // content
    node.querySelector(".todo-text").textContent = todo.title || "";
    const badge = node.querySelector(".priority-badge");
    badge.textContent = (todo.priority || "").toUpperCase();
    badge.className = `priority-badge ${todo.priority || "medium"}`;

    node.querySelector(".todo-timestamp").textContent = formatDate(todo.createdAt);

    // description/notes (use markdown)
    const descEl = node.querySelector(".todo-description");
    const notesEl = node.querySelector(".todo-notes");

    if (todo.description) {
      descEl.innerHTML = parseMarkdown(todo.description);
    } else {
      descEl.style.display = "none";
    }
    if (todo.notes) {
      notesEl.innerHTML = parseMarkdown(todo.notes);
    } else {
      notesEl.style.display = "none";
    }

    // details visibility
    const detailsEl = node.querySelector(".todo-details");
    if (!todo.description && !todo.notes) {
      detailsEl.style.display = "none";
      expandBtn.style.display = "none";
    } else {
      detailsEl.style.display = "none";
      expandBtn.textContent = "▼";
    }

    // selection (not persisted necessarily)
    checkboxSelect.checked = !!todo.selected;
    checkboxSelect.addEventListener("change", (e) => {
      todo.selected = e.target.checked;
      // optional: persist selection by calling updateTodo(todo) if main supports it
      updateBulkControlsVisibility();
    });

    // complete toggle
    completeToggle.addEventListener("click", async () => {
      try {
        todo.completed = !todo.completed;
        await updateTodo(todo);
        await loadTodos();
        renderTodos();
        updateStats();
      } catch (err) {
        console.error("toggleComplete error:", err);
        alert("Failed to toggle complete.");
      }
    });

    // delete per item
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete this todo?")) return;
      try {
        await deleteTodo(todo.id);
        await loadTodos();
        renderTodos();
        updateStats();
        updateBulkControlsVisibility();
      } catch (err) {
        console.error("deleteTodo error:", err);
        alert("Failed to delete.");
      }
    });

    // edit
    editBtn.addEventListener("click", () => openEditModal(todo.id));

    // duplicate
    dupBtn.addEventListener("click", async () => {
      try {
        const clone = {
          id: Date.now().toString(),
          title: todo.title + " (copy)",
          description: todo.description,
          notes: todo.notes,
          priority: todo.priority,
          completed: false,
          selected: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await addTodo(clone);
        await loadTodos();
        renderTodos();
        updateStats();
      } catch (err) {
        console.error("duplicate error:", err);
        alert("Failed to duplicate.");
      }
    });

    // expand details
    expandBtn.addEventListener("click", () => {
      const details = li.querySelector(".todo-details");
      if (!details) return;
      if (details.style.display === "none" || details.style.display === "") {
        details.style.display = "block";
        expandBtn.textContent = "▲";
      } else {
        details.style.display = "none";
        expandBtn.textContent = "▼";
      }
    });

    list.appendChild(node);
  });

  updateSelectAllCheckbox();
  updateBulkControlsVisibility();
}

/* --- Filters & bulk helpers --- */
function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll(".filter-btn").forEach((btn) => btn.classList.remove("active"));
  const btn = document.querySelector(`.filter-btn[data-filter="${filter}"]`);
  if (btn) btn.classList.add("active");
  renderTodos();
  updateStats();
}

function handleSelectAll(checked) {
  const todos = getTodos();
  // apply to currently visible todos only (to match UI expectation)
  let visible = todos;
  if (currentFilter === "active") visible = todos.filter((t) => !t.completed);
  else if (currentFilter === "completed") visible = todos.filter((t) => t.completed);

  visible.forEach((t) => (t.selected = checked));
  // optional: don't persist selection to DB to avoid extra writes
  renderTodos();
  updateBulkControlsVisibility();
}

function updateSelectAllCheckbox() {
  const checkboxes = containerElements.todoList.querySelectorAll(".todo-select");
  const checkedCount = Array.from(checkboxes).filter((cb) => cb.checked).length;
  const total = checkboxes.length;
  const selAll = containerElements.selectAll;
  if (!selAll) return;
  if (total === 0) {
    selAll.checked = false;
    selAll.indeterminate = false;
  } else if (checkedCount === 0) {
    selAll.checked = false;
    selAll.indeterminate = false;
  } else if (checkedCount === total) {
    selAll.checked = true;
    selAll.indeterminate = false;
  } else {
    selAll.checked = false;
    selAll.indeterminate = true;
  }
}

function getSelectedIds() {
  const todos = getTodos();
  return todos.filter((t) => t.selected).map((t) => t.id);
}

/* --- Bulk actions --- */
async function handleDeleteSelected() {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  if (!confirm(`Delete ${ids.length} selected todo(s)?`)) return;
  try {
    for (const id of ids) {
      await deleteTodo(id);
    }
    await loadTodos();
    renderTodos();
    updateStats();
  } catch (err) {
    console.error("deleteSelected error:", err);
    alert("Failed to delete selected.");
  }
}

async function handleCompleteSelected() {
  const todos = getTodos();
  const selected = todos.filter((t) => t.selected);
  if (selected.length === 0) return;
  try {
    for (const t of selected) {
      if (!t.completed) {
        t.completed = true;
        await updateTodo(t);
      }
      t.selected = false;
    }
    await loadTodos();
    renderTodos();
    updateStats();
  } catch (err) {
    console.error("completeSelected error:", err);
    alert("Failed to complete selected.");
  }
}

function handleDeselectAll() {
  const todos = getTodos();
  todos.forEach((t) => (t.selected = false));
  renderTodos();
  updateBulkControlsVisibility();
}

async function handleClearCompleted() {
  if (!confirm("Clear all completed todos?")) return;
  try {
    await clearCompleted();
    await loadTodos();
    renderTodos();
    updateStats();
  } catch (err) {
    console.error("clearCompleted error:", err);
    alert("Failed to clear completed.");
  }
}

async function handleExportSelected() {
  const ids = getSelectedIds();
  if (ids.length === 0) return alert("No todos selected to export.");

  try {
    // try to ask main for a JSON export helper; fallback to building JSON here
    if (typeof exportTodosAsJSON === "function") {
      const blob = await exportTodosAsJSON(ids);
      triggerDownload(blob, `todos-${Date.now()}.json`);
    } else {
      const todos = getTodos().filter((t) => ids.includes(t.id));
      const json = JSON.stringify(todos, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      triggerDownload(blob, `todos-${Date.now()}.json`);
    }
  } catch (err) {
    console.error("exportSelected error:", err);
    alert("Failed to export selected.");
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* --- Modal handlers --- */
function openAddModal() {
  containerElements.addForm.reset();
  containerElements.addPriority.value = "medium";
  containerElements.addModal.style.display = "flex";
  document.body.style.overflow = "hidden";
  setTimeout(() => containerElements.addTitle && containerElements.addTitle.focus(), 50);
}

function closeAddModal() {
  containerElements.addModal.style.display = "none";
  document.body.style.overflow = "";
}

async function handleAddTodo() {
  const title = containerElements.addTitle.value.trim();
  if (!title) {
    containerElements.addTitle.focus();
    return;
  }

  const todo = {
    id: Date.now().toString(),
    title,
    description: containerElements.addDescription.value.trim(),
    notes: containerElements.addNotes.value.trim(),
    priority: containerElements.addPriority.value || "medium",
    completed: false,
    selected: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await addTodo(todo);
    await loadTodos();
    renderTodos();
    updateStats();
    updateBulkControlsVisibility();
    closeAddModal();
  } catch (err) {
    console.error("addTodo error:", err);
    alert("Failed to add todo.");
  }
}

function openEditModal(todoId) {
  const todo = getTodos().find((t) => t.id === todoId);
  if (!todo) return;
  containerElements.editTitle.value = todo.title || "";
  containerElements.editPriority.value = todo.priority || "medium";
  containerElements.editDescription.value = todo.description || "";
  containerElements.editNotes.value = todo.notes || "";
  containerElements.editModal.dataset.todoId = todoId;
  containerElements.editModal.style.display = "flex";
  document.body.style.overflow = "hidden";
  setTimeout(() => containerElements.editTitle && containerElements.editTitle.focus(), 50);
}

function closeEditModal() {
  containerElements.editModal.style.display = "none";
  containerElements.editModal.dataset.todoId = "";
  document.body.style.overflow = "";
}

async function handleSaveEdit() {
  const todoId = containerElements.editModal.dataset.todoId;
  if (!todoId) return closeEditModal();

  const title = containerElements.editTitle.value.trim();
  if (!title) {
    containerElements.editTitle.focus();
    return;
  }

  const updates = {
    title,
    priority: containerElements.editPriority.value || "medium",
    description: containerElements.editDescription.value.trim(),
    notes: containerElements.editNotes.value.trim(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const todo = getTodos().find((t) => t.id === todoId);
    if (!todo) throw new Error("todo not found");
    Object.assign(todo, updates);
    await updateTodo(todo);
    await loadTodos();
    renderTodos();
    updateStats();
    closeEditModal();
  } catch (err) {
    console.error("saveEdit error:", err);
    alert("Failed to save changes.");
  }
}

/* --- Visibility & stats --- */
function updateBulkControlsVisibility() {
  const todos = getTodos();
  const total = todos.length;
  const selectedCount = todos.filter((t) => t.selected).length;
  const completedCount = todos.filter((t) => t.completed).length;

  // show/hide whole bulk area
  if (containerElements.bulkActions) {
    containerElements.bulkActions.style.display = total > 0 ? "flex" : "none";
  }

  // buttons enabled/disabled
  if (containerElements.deleteSelected) containerElements.deleteSelected.disabled = selectedCount === 0;
  if (containerElements.completeSelected) containerElements.completeSelected.disabled = selectedCount === 0;
  if (containerElements.deselectAll) containerElements.deselectAll.disabled = selectedCount === 0;
  if (containerElements.clearCompletedBtn) containerElements.clearCompletedBtn.disabled = completedCount === 0;
  if (containerElements.exportSelectedBtn) containerElements.exportSelectedBtn.disabled = selectedCount === 0;
}

function updateStats() {
  const todos = getTodos();
  const totalCount = todos.length;
  const completedCount = todos.filter((t) => t.completed).length;

  if (containerElements.todoCount) {
    containerElements.todoCount.textContent = `${totalCount} todo${totalCount !== 1 ? "s" : ""}`;
  }
  if (containerElements.completedCount) {
    containerElements.completedCount.textContent = `${completedCount} completed`;
  }

  // show/hide bulkActions (re-apply)
  updateBulkControlsVisibility();
}

/* --- Utilities --- */
function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}