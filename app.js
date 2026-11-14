const STORAGE_KEY = "pennywise.v2";
const colors = ["#659979", "#e8a878", "#8090b4", "#e2c36d", "#81b9ae", "#d4dfd5", "#c18fa6", "#9dba83"];
const categoryIcons = {
  Food: "⌂", Rent: "⌂", Transport: "↗", Bills: "⌁", Shopping: "◇", Health: "✚",
  Entertainment: "♫", Salary: "↘", Freelance: "✳", Groceries: "⌂", Utilities: "⌁",
  Travel: "↗", Education: "▤", Gifts: "♡", Other: "✳",
};
const defaultCategories = [
  { name: "Food", type: "expense" }, { name: "Rent", type: "expense" },
  { name: "Transport", type: "expense" }, { name: "Bills", type: "expense" },
  { name: "Shopping", type: "expense" }, { name: "Health", type: "expense" },
  { name: "Entertainment", type: "expense" }, { name: "Groceries", type: "expense" },
  { name: "Travel", type: "expense" }, { name: "Education", type: "expense" },
  { name: "Other", type: "expense" }, { name: "Salary", type: "income" },
  { name: "Freelance", type: "income" }, { name: "Gifts", type: "income" },
];

const today = new Date();
const localISODate = (date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};
const currentMonth = () => localISODate(today).slice(0, 7);
const makeSeedTransactions = () => {
  const month = currentMonth();
  const lastDay = today.getDate();
  const date = (day) => `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  return [
    { id: crypto.randomUUID(), name: "Monthly salary", type: "income", amount: 7800000, category: "Salary", account: "Main bank", date: date(1), note: "Monthly salary" },
    { id: crypto.randomUUID(), name: "Apartment rent", type: "expense", amount: 2200000, category: "Rent", account: "Main bank", date: date(2), note: "Apartment rent" },
    { id: crypto.randomUUID(), name: "Grocery run", type: "expense", amount: 245000, category: "Groceries", account: "Main bank", date: date(4), note: "Grocery run" },
    { id: crypto.randomUUID(), name: "Coffee & catch-up", type: "expense", amount: 68000, category: "Food", account: "Everyday wallet", date: date(6), note: "Coffee & catch-up" },
    { id: crypto.randomUUID(), name: "Metro card", type: "expense", amount: 120000, category: "Transport", account: "Everyday wallet", date: date(8), note: "Metro card" },
    { id: crypto.randomUUID(), name: "Freelance project", type: "income", amount: 1250000, category: "Freelance", account: "Main bank", date: date(10), note: "Freelance project" },
    { id: crypto.randomUUID(), name: "Internet bill", type: "expense", amount: 99900, category: "Bills", account: "Main bank", date: date(12), note: "Internet bill" },
    { id: crypto.randomUUID(), name: "Dinner with friends", type: "expense", amount: 185000, category: "Food", account: "Everyday wallet", date: date(14), note: "Dinner with friends" },
    { id: crypto.randomUUID(), name: "New book", type: "expense", amount: 75000, category: "Shopping", account: "Main bank", date: date(16), note: "New book" },
  ];
};

function freshState() {
  return {
    currency: "INR",
    accounts: [
      { id: crypto.randomUUID(), name: "Main bank", type: "Bank", balance: 5250000 },
      { id: crypto.randomUUID(), name: "Everyday wallet", type: "Wallet", balance: 485000 },
    ],
    categories: defaultCategories.map((category) => ({ ...category })),
    transactions: makeSeedTransactions(),
    budgets: { overall: 4000000, categories: { Food: 650000, Rent: 2200000, Transport: 350000, Bills: 400000, Shopping: 400000, Groceries: 700000 } },
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return freshState();
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.accounts)) throw new Error("Saved data has an unexpected format.");
    return { ...freshState(), ...parsed, budgets: { overall: 0, categories: {}, ...parsed.budgets } };
  } catch (error) {
    console.error("Could not load saved Pennywise data:", error);
    return freshState();
  }
}

let state = loadState();
let activeMonth = currentMonth();
let activeType = "expense";
let undoTimer;
let lastDeleted = null;
let editingTransactionId = null;
let pendingImport = null;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const amountFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const currencySymbol = () => ({ INR: "₹", USD: "$", EUR: "€", GBP: "£" }[state.currency] || state.currency + " ");
const money = (amount) => `${currencySymbol()}${amountFormatter.format(Math.abs(amount || 0) / 100)}`;
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const saveState = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { console.error("Could not save Pennywise data:", error); showToast("Couldn't save changes on this device."); }
};
const monthTransactions = () => state.transactions.filter((item) => item.date.startsWith(activeMonth));
const sum = (items) => items.reduce((total, item) => total + Number(item.amount || 0), 0);
const categorySpent = (category, items = monthTransactions()) => sum(items.filter((item) => item.type === "expense" && item.category === category));
const symbolForCategory = (category) => categoryIcons[category] || category.charAt(0).toUpperCase() || "✳";

function showToast(message, undo = false) {
  const toast = $("#toast");
  clearTimeout(undoTimer);
  toast.innerHTML = `${escapeHTML(message)}${undo ? ' <button id="undo-delete" class="toast-undo">Undo</button>' : ""}`;
  toast.classList.add("show");
  if (undo) $("#undo-delete").addEventListener("click", undoDelete);
  undoTimer = setTimeout(() => toast.classList.remove("show"), 4200);
}

function render() {
  const items = monthTransactions();
  const income = sum(items.filter((item) => item.type === "income"));
  const expenses = sum(items.filter((item) => item.type === "expense"));
  const netBalance = state.accounts.reduce((total, account) => total + Number(account.balance || 0), 0);
  const savings = income - expenses;
  $("#balance-value").textContent = money(netBalance);
  $("#income-value").textContent = money(income);
  $("#expense-value").textContent = money(expenses);
  $("#savings-value").textContent = money(savings);
  $("#income-count").textContent = `${items.filter((item) => item.type === "income").length} entries`;
  $("#expense-count").textContent = `${items.filter((item) => item.type === "expense").length} entries`;
  $("#savings-rate").textContent = `${income ? Math.round((savings / income) * 100) : 0}% savings rate`;
  $("#month-picker").value = activeMonth;
  $$(".currency-prefix").forEach((el) => { el.textContent = currencySymbol(); });
  $("#currency-prefix").textContent = currencySymbol();
  renderSpending(items, expenses);
  renderBudget(items, expenses);
  renderTransactions();
  renderAccounts();
  updateCategoryOptions();
}

function renderSpending(items, total) {
  const expenses = items.filter((item) => item.type === "expense");
  const totals = new Map();
  expenses.forEach((item) => totals.set(item.category, (totals.get(item.category) || 0) + Number(item.amount)));
  const sorted = [...totals].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5);
  const remainder = sorted.slice(5).reduce((sumValue, [, amount]) => sumValue + amount, 0);
  if (remainder) top.push(["Other", remainder]);
  const segments = top.map(([, value], index) => `${colors[index % colors.length]} ${(top.slice(0, index).reduce((subtotal, [, prev]) => subtotal + prev, 0) / (total || 1) * 100).toFixed(2)}% ${((top.slice(0, index + 1).reduce((subtotal, [, prev]) => subtotal + prev, 0) / (total || 1)) * 100).toFixed(2)}%`);
  $("#spending-donut").style.background = total ? `conic-gradient(${segments.join(", ")})` : "#edf1ed";
  $("#donut-total").textContent = money(total);
  $("#category-legend").innerHTML = top.length
    ? top.map(([name, value], index) => `<div class="legend-item"><span class="legend-dot" style="background:${colors[index % colors.length]}"></span><span>${escapeHTML(name)}</span><strong>${money(value)}</strong></div>`).join("")
    : '<div class="legend-empty">Add an expense to see your breakdown.</div>';
}

function budgetStatus(spent, limit) {
  const ratio = limit ? spent / limit : 0;
  if (limit && ratio > 1) return { text: "Over budget", state: "over", percent: 100 };
  if (limit && ratio >= 0.8) return { text: "Getting close", state: "warning", percent: ratio * 100 };
  return { text: limit ? "On track" : "No budget", state: "", percent: limit ? ratio * 100 : 0 };
}

function renderBudget(items, expenses) {
  const limit = Number(state.budgets.overall || 0);
  const status = budgetStatus(expenses, limit);
  const remaining = limit - expenses;
  $("#budget-spent").textContent = money(expenses);
  $("#budget-limit").textContent = money(limit);
  $("#budget-caption").textContent = new Date(`${activeMonth}-02T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) + " spending plan";
  $("#overall-progress").style.width = `${Math.max(0, Math.min(100, status.percent))}%`;
  $("#overall-progress").parentElement.className = `progress-track budget-track ${status.state}`;
  $("#budget-status").textContent = status.text;
  $("#budget-status").className = `budget-status ${status.state}`;
  $("#budget-remaining").textContent = limit ? `${remaining >= 0 ? money(remaining) + " left" : money(-remaining) + " over"} this month` : "Set a monthly budget to get started";
  $("#budget-page-limit").textContent = money(limit);
  $("#budget-page-spent").textContent = money(expenses);
  $("#budget-page-remaining").textContent = money(limit ? Math.max(remaining, 0) : 0);

  const configured = Object.entries(state.budgets.categories || {}).filter(([, amount]) => Number(amount) > 0);
  const miniRows = configured.slice(0, 4);
  $("#mini-budget-list").innerHTML = miniRows.length
    ? miniRows.map(([name, categoryLimit]) => {
      const spent = categorySpent(name, items);
      const progress = budgetStatus(spent, Number(categoryLimit));
      return `<div class="mini-budget-row"><span>${escapeHTML(name)}</span><div class="mini-track ${progress.state}"><span style="width:${Math.min(100, progress.percent)}%"></span></div><strong>${money(spent)} / ${money(categoryLimit)}</strong></div>`;
    }).join("")
    : '<p class="legend-empty">Add category budgets for a more detailed plan.</p>';

  const entries = Object.entries(state.budgets.categories || {}).filter(([, amount]) => Number(amount) > 0);
  $("#full-budget-list").innerHTML = entries.map(([name, categoryLimit], index) => {
    const spent = categorySpent(name, items);
    const progress = budgetStatus(spent, Number(categoryLimit));
    const left = Number(categoryLimit) - spent;
    return `<article class="budget-card"><div class="budget-card-head"><div class="budget-category"><span class="category-icon">${escapeHTML(symbolForCategory(name))}</span>${escapeHTML(name)}</div><span class="budget-status ${progress.state}">${progress.text}</span></div><div class="budget-amounts"><strong>${money(spent)}</strong> spent of ${money(categoryLimit)}</div><div class="progress-track ${progress.state}"><span style="width:${Math.min(100, progress.percent)}%"></span></div><div class="budget-card-foot"><span>${left >= 0 ? `${money(left)} left` : `${money(-left)} over`}</span><span>${Math.round(Number(categoryLimit) ? spent / Number(categoryLimit) * 100 : 0)}%</span></div></article>`;
  }).join("");
  $("#budget-empty").classList.toggle("visible", !limit && entries.length === 0);
}

function formatDate(isoDate) {
  const parsed = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? isoDate : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function transactionRow(item) {
  const icon = item.type === "income" ? "↘" : symbolForCategory(item.category);
  const sign = item.type === "income" ? "+" : "−";
  return `<tr><td><div class="transaction-name"><span class="transaction-icon ${item.type}">${escapeHTML(icon)}</span><span>${escapeHTML(item.name || item.note || item.category)}${item.note && item.name !== item.note ? `<span class="transaction-note">${escapeHTML(item.note)}</span>` : ""}</span></div></td><td><span class="category-tag">${escapeHTML(item.category)}</span></td><td>${escapeHTML(formatDate(item.date))}</td><td>${escapeHTML(item.account)}</td><td class="amount-cell ${item.type}">${sign}${money(item.amount)}</td><td class="row-actions"><button class="delete-row" data-edit="${escapeHTML(item.id)}" aria-label="Edit ${escapeHTML(item.name || item.category)}">✎</button><button class="delete-row" data-delete="${escapeHTML(item.id)}" aria-label="Delete ${escapeHTML(item.name || item.category)}">×</button></td></tr>`;
}

function renderTransactions() {
  const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const recent = sorted.filter((item) => item.date.startsWith(activeMonth)).slice(0, 5);
  $("#recent-transactions").innerHTML = recent.map(transactionRow).join("");
  $("#recent-empty").classList.toggle("visible", recent.length === 0);
  $("#recent-transactions").closest(".table-wrap").querySelector("table").classList.toggle("hidden", recent.length === 0);
  const query = ($("#search-input")?.value || "").trim().toLowerCase();
  const category = $("#category-filter")?.value || "";
  const type = $("#type-filter")?.value || "";
  const filtered = sorted.filter((item) => {
    const content = `${item.name} ${item.note} ${item.category} ${item.account}`.toLowerCase();
    return (!query || content.includes(query)) && (!category || item.category === category) && (!type || item.type === type);
  });
  $("#all-transactions").innerHTML = filtered.map(transactionRow).join("");
  $("#all-empty").classList.toggle("visible", filtered.length === 0);
  $("#all-transactions").closest(".table-wrap").querySelector("table").classList.toggle("hidden", filtered.length === 0);
  $("#transaction-count").textContent = `${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`;
}

function renderAccounts() {
  $("#account-list").innerHTML = state.accounts.map((account) => {
    const icon = { Bank: "▤", Cash: "◉", "Credit card": "▰", Wallet: "▱" }[account.type] || "▤";
    return `<article class="account-card"><div class="account-card-top"><span class="account-type-icon">${icon}</span><span class="account-type-label">${escapeHTML(account.type)}</span></div><h3>${escapeHTML(account.name)}</h3><p>Current balance</p><strong>${money(account.balance)}</strong></article>`;
  }).join("");
}

function updateCategoryOptions() {
  const typeCategories = state.categories.filter((category) => category.type === activeType);
  const preferred = typeCategories.find((category) => category.name === localStorage.getItem("pennywise.lastCategory"));
  $("#transaction-category").innerHTML = typeCategories.map((category) => `<option value="${escapeHTML(category.name)}">${escapeHTML(category.name)}</option>`).join("");
  if (preferred) $("#transaction-category").value = preferred.name;
  $("#category-filter").innerHTML = `<option value="">All categories</option>${state.categories.map((category) => `<option value="${escapeHTML(category.name)}">${escapeHTML(category.name)}</option>`).join("")}`;
  $("#transaction-account").innerHTML = state.accounts.map((account) => `<option value="${escapeHTML(account.name)}">${escapeHTML(account.name)}</option>`).join("");
  if (!state.accounts.length) $("#transaction-account").innerHTML = '<option value="">Add an account first</option>';
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  const focusable = modal.querySelector("input:not([type=hidden]), select, button");
  setTimeout(() => focusable?.focus(), 40);
}

function closeModals() {
  $$(".modal-backdrop.open").forEach((modal) => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  });
  document.body.style.overflow = "";
}

function openTransactionModal(transaction = null) {
  if (!state.accounts.length) {
    showToast("Add an account before recording a transaction.");
    openModal("account-modal");
    return;
  }
  $("#transaction-form").reset();
  editingTransactionId = transaction?.id || null;
  $("#transaction-date").value = transaction?.date || localISODate(new Date());
  $("#form-error").textContent = "";
  activeType = transaction?.type || "expense";
  $$(".type-option").forEach((button) => button.classList.toggle("selected", button.dataset.type === activeType));
  updateCategoryOptions();
  if (transaction) {
    const form = $("#transaction-form");
    form.elements.amount.value = transaction.amount;
    form.elements.category.value = transaction.category;
    form.elements.account.value = transaction.account;
    form.elements.note.value = transaction.note || "";
    $("#modal-title").textContent = "Edit transaction";
    $("#save-transaction").innerHTML = "Save changes <span>↗</span>";
  } else {
    $("#modal-title").textContent = "Add transaction";
    $("#save-transaction").innerHTML = "Save transaction <span>↗</span>";
  }
  openModal("transaction-modal");
}

function showPage(name) {
  const pageTitles = { overview: "Overview", transactions: "Transactions", budgets: "Budgets", accounts: "Accounts" };
  $$(".page-section").forEach((section) => section.classList.toggle("hidden", section.id !== `${name}-page`));
  $$(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.page === name));
  $("#page-title").textContent = pageTitles[name] || "Overview";
  history.replaceState(null, "", `#${name}`);
  $("#sidebar").classList.remove("open");
}

function deleteTransaction(id) {
  const index = state.transactions.findIndex((item) => item.id === id);
  if (index < 0) return;
  lastDeleted = { item: state.transactions[index], index };
  applyBalanceChange(lastDeleted.item, -1);
  state.transactions.splice(index, 1);
  saveState();
  render();
  showToast("Transaction deleted.", true);
}

function undoDelete() {
  if (!lastDeleted) return;
  state.transactions.splice(lastDeleted.index, 0, lastDeleted.item);
  applyBalanceChange(lastDeleted.item, 1);
  lastDeleted = null;
  saveState();
  render();
  $("#toast").classList.remove("show");
}

function applyBalanceChange(item, direction) {
  const account = state.accounts.find((entry) => entry.name === item.account);
  if (account) account.balance += (item.type === "income" ? 1 : -1) * Number(item.amount) * direction;
}

function downloadCSV() {
  const headers = ["date", "amount", "type", "category", "account", "note"];
  const rows = state.transactions.map((item) => [item.date, item.amount / 100, item.type, item.category, item.account, item.note || ""]);
  const csv = [headers, ...rows].map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pennywise-transactions-${currentMonth()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Your CSV export is ready.");
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function importCSV(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(String(reader.result || ""));
      if (rows.length < 2) throw new Error("The CSV needs a header row and at least one transaction.");
      pendingImport = { headers: rows[0], rows: rows.slice(1) };
      renderImportMappings();
      openModal("import-modal");
    } catch (error) { showToast(error.message || "Couldn't import this CSV file."); }
    $("#csv-file").value = "";
  };
  reader.onerror = () => { showToast("Couldn't read that CSV file."); $("#csv-file").value = ""; };
  reader.readAsText(file);
}

function renderImportMappings() {
  const { headers } = pendingImport;
  const fields = [
    ["date", "Date", ["date", "transactiondate"]],
    ["amount", "Amount", ["amount", "value", "total"]],
    ["type", "Type", ["type", "transactiontype"]],
    ["category", "Category", ["category"]],
    ["account", "Account", ["account", "accountname"]],
    ["note", "Note", ["note", "description", "memo", "merchant"]],
  ];
  $("#import-mappings").innerHTML = fields.map(([key, label, aliases]) => {
    const guess = headers.findIndex((header) => aliases.includes(header.trim().toLowerCase().replace(/[\s_-]+/g, "")));
    const options = `<option value="-1">Not mapped</option>${headers.map((header, index) => `<option value="${index}" ${index === guess ? "selected" : ""}>${escapeHTML(header || `Column ${index + 1}`)}</option>`).join("")}`;
    return `<label class="field-label">${label}${key === "date" || key === "amount" ? " *" : ""}<select data-import-field="${key}">${options}</select></label>`;
  }).join("");
  renderImportPreview();
}

function importCandidates() {
  if (!pendingImport) return { valid: [], invalid: 0, duplicates: 0 };
  const indexes = {};
  $$("[data-import-field]").forEach((select) => { indexes[select.dataset.importField] = Number(select.value); });
  if (indexes.date < 0 || indexes.amount < 0) return { valid: [], invalid: pendingImport.rows.length, duplicates: 0, mappingError: true };
  const known = new Set(state.transactions.map((item) => `${item.date}|${Math.round(Number(item.amount))}|${item.note || ""}`));
  const valid = [];
  let invalid = 0;
  let duplicates = 0;
  pendingImport.rows.forEach((cells) => {
    const date = String(cells[indexes.date] || "").trim().slice(0, 10);
    const amountText = String(cells[indexes.amount] || "").replace(/[₹$€£,\s]/g, "");
    const amount = Number(amountText);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`)) || !Number.isFinite(amount) || amount === 0) { invalid += 1; return; }
    const note = indexes.note >= 0 ? String(cells[indexes.note] || "").trim() : "";
    const amountMinor = Math.round(Math.abs(amount) * 100);
    const duplicateKey = `${date}|${amountMinor}|${note}`;
    const duplicate = known.has(duplicateKey);
    if (duplicate) duplicates += 1;
    known.add(duplicateKey);
    const rawType = indexes.type >= 0 ? String(cells[indexes.type] || "").toLowerCase() : "";
    const type = rawType.includes("income") || rawType.includes("credit") || amount < 0 ? "income" : "expense";
    const category = indexes.category >= 0 && String(cells[indexes.category] || "").trim() ? String(cells[indexes.category]).trim() : (type === "income" ? "Salary" : "Other");
    const account = indexes.account >= 0 && String(cells[indexes.account] || "").trim() ? String(cells[indexes.account]).trim() : (state.accounts[0]?.name || "Main bank");
    valid.push({ date, amount: amountMinor, type, category, account, note, duplicate });
  });
  return { valid, invalid, duplicates };
}

function renderImportPreview() {
  if (!pendingImport) return;
  const result = importCandidates();
  const labels = ["Date", "Amount", "Type", "Category", "Note"];
  $("#import-preview-head").innerHTML = `<tr>${labels.map((label) => `<th>${label}</th>`).join("")}</tr>`;
  $("#import-preview-body").innerHTML = result.valid.slice(0, 20).map((item) =>
    `<tr><td>${escapeHTML(item.date)}</td><td>${money(item.amount)}</td><td>${escapeHTML(item.type)}</td><td>${escapeHTML(item.category)}</td><td>${escapeHTML(item.note)}</td></tr>`
  ).join("");
  const skipDuplicates = $("#skip-duplicates").checked;
  const skippedDuplicates = skipDuplicates ? result.duplicates : 0;
  const count = result.valid.length - skippedDuplicates;
  $("#import-summary").textContent = result.mappingError
    ? "Map both Date and Amount to continue."
    : `${count} transaction${count === 1 ? "" : "s"} ready to import${result.invalid || skippedDuplicates ? ` · ${result.invalid + skippedDuplicates} will be skipped` : ""}${result.valid.length > 20 ? " · previewing first 20 rows" : ""}.`;
  $("#confirm-import").disabled = result.mappingError || count === 0;
  $("#confirm-import").classList.toggle("disabled", $("#confirm-import").disabled);
}

function commitImport() {
  if (!pendingImport) return;
  const result = importCandidates();
  if (result.mappingError) return;
  const skipDuplicates = $("#skip-duplicates").checked;
  let imported = 0;
  let skipped = result.invalid;
  result.valid.forEach((item) => {
    if (item.duplicate && skipDuplicates) { skipped += 1; return; }
    state.transactions.push({ id: crypto.randomUUID(), name: item.note || item.category, ...item });
    if (!state.categories.some((category) => category.name === item.category)) state.categories.push({ name: item.category, type: item.type });
    if (!state.accounts.some((account) => account.name === item.account)) state.accounts.push({ id: crypto.randomUUID(), name: item.account, type: "Bank", balance: 0 });
    applyBalanceChange(item, 1);
    imported += 1;
  });
  pendingImport = null;
  saveState(); closeModals(); render();
  showToast(`Imported ${imported} transaction${imported === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped}` : ""}.`);
}

$("#transaction-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const amount = Number(form.get("amount"));
  const category = String(form.get("category") || "");
  const accountName = String(form.get("account") || "");
  const date = String(form.get("date") || "");
  if (!Number.isFinite(amount) || amount <= 0) { $("#form-error").textContent = "Enter an amount greater than zero."; return; }
  const account = state.accounts.find((item) => item.name === accountName);
  if (!account || !date) { $("#form-error").textContent = "Choose an account and a valid date."; return; }
  const note = String(form.get("note") || "").trim();
  const wasEditing = Boolean(editingTransactionId);
  const item = { id: editingTransactionId || crypto.randomUUID(), name: note || category, type: activeType, amount: Math.round(amount * 100), category, account: accountName, date, note };
  if (editingTransactionId) {
    const index = state.transactions.findIndex((transaction) => transaction.id === editingTransactionId);
    if (index >= 0) {
      applyBalanceChange(state.transactions[index], -1);
      state.transactions[index] = item;
    } else state.transactions.push(item);
  } else state.transactions.push(item);
  applyBalanceChange(item, 1);
  localStorage.setItem("pennywise.lastCategory", category);
  editingTransactionId = null;
  saveState(); closeModals(); render(); showToast(wasEditing ? "Transaction updated." : "Transaction saved.");
});

$("#budget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const overall = Number(form.get("overall") || 0);
  if (!Number.isFinite(overall) || overall < 0) { showToast("Enter a valid budget amount."); return; }
  state.budgets.overall = Math.round(overall * 100);
  const categoryBudgets = {};
  state.categories.filter((item) => item.type === "expense").forEach((item) => {
    const value = Number(form.get(`category-${item.name}`) || 0);
    if (Number.isFinite(value) && value > 0) categoryBudgets[item.name] = Math.round(value * 100);
  });
  state.budgets.categories = categoryBudgets;
  saveState(); closeModals(); render(); showToast("Your monthly budget is saved.");
});

$("#account-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name") || "").trim();
  const balance = Number(form.get("balance") || 0);
  if (!name || !Number.isFinite(balance)) { showToast("Enter a valid account name and balance."); return; }
  if (state.accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) { showToast("An account with that name already exists."); return; }
  state.accounts.push({ id: crypto.randomUUID(), name, type: String(form.get("type")), balance: Math.round(balance * 100) });
  saveState(); closeModals(); render(); showToast("Account added.");
});

function openBudgetModal() {
  $("#budget-form").reset();
  $("#budget-form").elements.overall.value = state.budgets.overall ? state.budgets.overall / 100 : "";
  const categories = state.categories.filter((item) => item.type === "expense");
  $("#budget-form-categories").innerHTML = `<p>Category limits <span class="optional">(optional)</span></p>${categories.map((category) => `<label class="budget-input-row"><span>${escapeHTML(category.name)}</span><input name="category-${escapeHTML(category.name)}" type="number" min="0" step="0.01" placeholder="No limit" value="${state.budgets.categories?.[category.name] ? state.budgets.categories[category.name] / 100 : ""}" /></label>`).join("")}`;
  $$(".currency-prefix").forEach((el) => { el.textContent = currencySymbol(); });
  openModal("budget-modal");
}

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add], #add-transaction-button");
  if (addButton) { openTransactionModal(); return; }
  const nav = event.target.closest(".nav-link");
  if (nav) { event.preventDefault(); showPage(nav.dataset.page); return; }
  const navigate = event.target.closest("[data-navigate]");
  if (navigate) { showPage(navigate.dataset.navigate); return; }
  const del = event.target.closest("[data-delete]");
  if (del) { deleteTransaction(del.dataset.delete); return; }
  const edit = event.target.closest("[data-edit]");
  if (edit) { const transaction = state.transactions.find((item) => item.id === edit.dataset.edit); if (transaction) openTransactionModal(transaction); return; }
  if (event.target.closest(".close-modal")) { closeModals(); return; }
  if (event.target.classList.contains("modal-backdrop")) closeModals();
});

$$(".type-option").forEach((button) => button.addEventListener("click", () => {
  activeType = button.dataset.type;
  $$(".type-option").forEach((item) => item.classList.toggle("selected", item === button));
  updateCategoryOptions();
}));

$("#month-picker").addEventListener("change", (event) => { activeMonth = event.target.value || currentMonth(); render(); });
$("#search-input").addEventListener("input", renderTransactions);
$("#category-filter").addEventListener("change", renderTransactions);
$("#type-filter").addEventListener("change", renderTransactions);
$("#clear-filters").addEventListener("click", () => { $("#search-input").value = ""; $("#category-filter").value = ""; $("#type-filter").value = ""; renderTransactions(); });
$("#export-button").addEventListener("click", downloadCSV);
$("#import-button").addEventListener("click", () => $("#csv-file").click());
$("#csv-file").addEventListener("change", (event) => { if (event.target.files?.[0]) importCSV(event.target.files[0]); });
$("#import-mappings").addEventListener("change", renderImportPreview);
$("#skip-duplicates").addEventListener("change", renderImportPreview);
$("#confirm-import").addEventListener("click", commitImport);
$("#budget-settings-button").addEventListener("click", openBudgetModal);
$("#manage-budgets-button").addEventListener("click", openBudgetModal);
$("#empty-budget-button").addEventListener("click", openBudgetModal);
$("#add-account-button").addEventListener("click", () => { $("#account-form").reset(); openModal("account-modal"); });
$("#profile-button").addEventListener("click", () => {
  const currencies = ["INR", "USD", "EUR", "GBP"];
  const current = currencies.indexOf(state.currency);
  state.currency = currencies[(current + 1) % currencies.length];
  saveState(); render(); showToast(`Currency changed to ${state.currency}. Click your profile to switch again.`);
});
$("#menu-button").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModals();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openTransactionModal(); }
  if (event.key === "+" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) { event.preventDefault(); openTransactionModal(); }
});

$("#today-label").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
const initialPage = location.hash.slice(1);
render();
if (["overview", "transactions", "budgets", "accounts"].includes(initialPage)) showPage(initialPage);
