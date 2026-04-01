const SESSION_KEY = "motion-log-session-user-id";
const CUSTOM_ACTIVITIES_KEY = "motion-log-custom-activities";

const BASE_CALORIES_PER_MIN = {
  "ランニング": 11,
  "ウォーキング": 4,
  "筋トレ": 7,
  "ヨガ": 3,
  "サイクリング": 8,
  "水泳": 10,
};

const INTENSITY_MULTIPLIER = {
  "弱": 0.85,
  "中": 1,
  "強": 1.2,
};

const authScreen = document.querySelector("#authScreen");
const recordScreen = document.querySelector("#recordScreen");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const workoutForm = document.querySelector("#workoutForm");
const goalForm = document.querySelector("#goalForm");
const friendRequestForm = document.querySelector("#friendRequestForm");
const logoutButton = document.querySelector("#logoutButton");
const addActivityButton = document.querySelector("#addActivityButton");
const customActivityInput = document.querySelector("#customActivityInput");
const menuToggle = document.querySelector("#menuToggle");
const menuPanel = document.querySelector("#menuPanel");
const menuLinks = document.querySelectorAll(".menu-link[data-view]");
const recordView = document.querySelector("#recordView");
const historyView = document.querySelector("#historyView");
const friendView = document.querySelector("#friendView");
const loginMessage = document.querySelector("#loginMessage");
const registerMessage = document.querySelector("#registerMessage");
const formMessage = document.querySelector("#formMessage");
const goalMessage = document.querySelector("#goalMessage");
const friendMessage = document.querySelector("#friendMessage");
const loadingOverlay = document.querySelector("#loadingOverlay");
const loadingText = document.querySelector("#loadingText");
const currentUserChip = document.querySelector("#currentUserChip");
const heroWeeklyMinutes = document.querySelector("#heroWeeklyMinutes");
const heroUserLabel = document.querySelector("#heroUserLabel");
const goalPercent = document.querySelector("#goalPercent");
const weeklyGoalInput = document.querySelector("#weeklyGoalInput");
const goalProgressCircle = document.querySelector("#goalProgressCircle");
const historyFilter = document.querySelector("#historyFilter");
const calendarPrev = document.querySelector("#calendarPrev");
const calendarNext = document.querySelector("#calendarNext");
const calendarGrid = document.querySelector("#calendarGrid");
const calendarMonthLabel = document.querySelector("#calendarMonthLabel");
const calendarSelectionLabel = document.querySelector("#calendarSelectionLabel");
const calendarClear = document.querySelector("#calendarClear");
const recordsList = document.querySelector("#recordsList");
const pendingRequests = document.querySelector("#pendingRequests");
const friendsList = document.querySelector("#friendsList");
const friendRecordsList = document.querySelector("#friendRecordsList");
const friendRecordsHeading = document.querySelector("#friendRecordsHeading");
const friendGoalSummary = document.querySelector("#friendGoalSummary");
const caloriesPreview = document.querySelector("#caloriesPreview");
const recordTemplate = document.querySelector("#recordTemplate");
const friendTemplate = document.querySelector("#friendTemplate");
const activitySelect = document.querySelector("#activity");

const summaryElements = {
  totalSessions: document.querySelector("#totalSessions"),
  totalMinutes: document.querySelector("#totalMinutes"),
  totalCalories: document.querySelector("#totalCalories"),
  favoriteActivity: document.querySelector("#favoriteActivity"),
};

const defaultDate = new Date().toISOString().split("T")[0];
document.querySelector("#date").value = defaultDate;

let currentUserId = localStorage.getItem(SESSION_KEY);
let customActivities = loadCustomActivities();
let currentView = "record";
let selectedFriendId = null;
let currentCalendarMonth = startOfMonth(new Date());
let selectedHistoryDate = null;
let appState = {
  currentUser: null,
  workouts: [],
  friends: { incoming: [], outgoing: [], accepted: [] },
  friendWorkouts: {},
};

loginForm?.addEventListener("submit", handleLogin);
registerForm?.addEventListener("submit", handleRegister);
workoutForm?.addEventListener("submit", handleWorkoutSubmit);
goalForm?.addEventListener("submit", handleGoalSubmit);
friendRequestForm?.addEventListener("submit", handleFriendRequest);
logoutButton?.addEventListener("click", handleLogout);
addActivityButton?.addEventListener("click", handleAddActivity);
activitySelect?.addEventListener("change", updateCaloriesPreview);
document.querySelector("#duration")?.addEventListener("input", updateCaloriesPreview);
document.querySelector("#intensity")?.addEventListener("change", updateCaloriesPreview);
historyFilter?.addEventListener("change", renderRecords);
calendarPrev?.addEventListener("click", () => changeCalendarMonth(-1));
calendarNext?.addEventListener("click", () => changeCalendarMonth(1));
calendarClear?.addEventListener("click", clearSelectedHistoryDate);
menuToggle?.addEventListener("click", toggleMenu);
menuLinks.forEach((link) => {
  link.addEventListener("click", () => {
    setCurrentView(link.dataset.view || "record");
    closeMenu();
  });
});
document.addEventListener("click", handleOutsideMenuClick);

initialize();

async function initialize() {
  renderActivityOptions();
  updateCaloriesPreview();

  if (!currentUserId) {
    showAuthScreen();
    return;
  }

  const loaded = await withLoading("セッションを確認しています...", () => loadState());
  if (!loaded) {
    localStorage.removeItem(SESSION_KEY);
    currentUserId = null;
    showAuthScreen();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearMessages();

  const formData = new FormData(loginForm);
  const result = await withLoading("ログインしています...", () =>
    apiRequest("/api/login", {
      method: "POST",
      body: {
        username: normalizeUsername(formData.get("username")),
        password: String(formData.get("password") || ""),
      },
    })
  );

  if (!result.ok) {
    loginMessage.textContent = result.error;
    return;
  }

  currentUserId = result.data.currentUser.id;
  localStorage.setItem(SESSION_KEY, currentUserId);
  appState = result.data;
  currentView = "record";
  selectedFriendId = null;
  loginForm.reset();
  renderApp();
}

async function handleRegister(event) {
  event.preventDefault();
  clearMessages();

  const formData = new FormData(registerForm);
  const result = await withLoading("アカウントを作成しています...", () =>
    apiRequest("/api/register", {
      method: "POST",
      body: {
        username: normalizeUsername(formData.get("username")),
        password: String(formData.get("password") || ""),
      },
    })
  );

  if (!result.ok) {
    registerMessage.textContent = result.error;
    return;
  }

  currentUserId = result.data.currentUser.id;
  localStorage.setItem(SESSION_KEY, currentUserId);
  appState = result.data;
  currentView = "record";
  selectedFriendId = null;
  registerForm.reset();
  renderApp();
}

async function handleWorkoutSubmit(event) {
  event.preventDefault();
  clearMessages();

  if (!appState.currentUser) {
    formMessage.textContent = "先にログインしてください。";
    return;
  }

  const formData = new FormData(workoutForm);
  const activity = String(formData.get("activity") || "");
  const duration = Number(formData.get("duration") || 0);
  const intensity = String(formData.get("intensity") || "中");
  const calories = calculateCalories(activity, duration, intensity);

  const result = await withLoading("記録を保存しています...", () =>
    apiRequest("/api/workouts", {
      method: "POST",
      body: {
        userId: currentUserId,
        date: formData.get("date"),
        activity,
        duration,
        intensity,
        calories,
        notes: String(formData.get("notes") || "").trim(),
      },
    })
  );

  if (!result.ok) {
    formMessage.textContent = result.error;
    return;
  }

  appState = result.data;
  workoutForm.reset();
  document.querySelector("#date").value = defaultDate;
  document.querySelector("#intensity").value = "中";
  caloriesPreview.value = "";
  formMessage.textContent = `記録を保存しました。消費カロリーは ${calories}kcal です。`;
  renderApp();
}

async function handleGoalSubmit(event) {
  event.preventDefault();
  clearMessages();

  const weeklyGoalMinutes = Number(weeklyGoalInput.value || 0);
  if (weeklyGoalMinutes < 1) {
    goalMessage.textContent = "目標時間を入力してください。";
    return;
  }

  const result = await withLoading("目標を更新しています...", () =>
    apiRequest("/api/goal", {
      method: "POST",
      body: {
        userId: currentUserId,
        weeklyGoalMinutes,
      },
    })
  );

  if (!result.ok) {
    goalMessage.textContent = result.error;
    return;
  }

  appState = result.data;
  goalMessage.textContent = "1週間の目標を更新しました。";
  renderApp();
}

async function handleFriendRequest(event) {
  event.preventDefault();
  clearMessages();

  const formData = new FormData(friendRequestForm);
  const result = await withLoading("フレンド申請を送っています...", () =>
    apiRequest("/api/friends/request", {
      method: "POST",
      body: {
        userId: currentUserId,
        friendUsername: normalizeUsername(formData.get("friendUsername")),
      },
    })
  );

  if (!result.ok) {
    friendMessage.textContent = result.error;
    return;
  }

  appState = result.data;
  friendRequestForm.reset();
  friendMessage.textContent = "フレンド申請を送りました。";
  renderApp();
}

function handleLogout() {
  currentUserId = null;
  localStorage.removeItem(SESSION_KEY);
  appState = {
    currentUser: null,
    workouts: [],
    friends: { incoming: [], outgoing: [], accepted: [] },
    friendWorkouts: {},
  };
  selectedFriendId = null;
  currentView = "record";
  clearMessages();
  showAuthScreen();
  closeMenu();
}

function handleAddActivity() {
  clearMessages();
  const value = customActivityInput.value.trim();
  if (!value) {
    formMessage.textContent = "追加する運動の種類を入力してください。";
    return;
  }

  if (getAllActivities().includes(value)) {
    formMessage.textContent = "その運動の種類はすでに追加されています。";
    activitySelect.value = value;
    customActivityInput.value = "";
    updateCaloriesPreview();
    return;
  }

  customActivities.push(value);
  persistCustomActivities();
  renderActivityOptions(value);
  customActivityInput.value = "";
  formMessage.textContent = `「${value}」を運動の種類に追加しました。`;
}

function renderApp() {
  if (!appState.currentUser) {
    showAuthScreen();
    return;
  }

  showRecordScreen();
  currentUserChip.textContent = `@${appState.currentUser.username}`;
  renderCurrentView();
  renderSummary();
  renderHistoryFilter();
  renderCalendar();
  renderRecords();
  renderFriends();
  updateCaloriesPreview();
}

function renderSummary() {
  const records = appState.workouts;
  const totalMinutes = records.reduce((sum, record) => sum + record.duration, 0);
  const totalCalories = records.reduce((sum, record) => sum + record.calories, 0);
  const { weeklyMinutes, weeklyGoal, percent } = getWeeklyGoalProgress(records, appState.currentUser.weeklyGoalMinutes);
  const circumference = 2 * Math.PI * 48;
  const offset = circumference - (circumference * percent) / 100;

  summaryElements.totalSessions.textContent = `${records.length}`;
  summaryElements.totalMinutes.textContent = `${totalMinutes}分`;
  summaryElements.totalCalories.textContent = `${totalCalories}kcal`;
  summaryElements.favoriteActivity.textContent = getFavoriteActivity(records);
  heroWeeklyMinutes.textContent = `${weeklyMinutes} / ${weeklyGoal}分`;
  heroUserLabel.textContent = `@${appState.currentUser.username} の直近7日`;
  goalPercent.textContent = `${percent}%`;
  weeklyGoalInput.value = String(weeklyGoal);
  goalProgressCircle.style.strokeDasharray = `${circumference}`;
  goalProgressCircle.style.strokeDashoffset = `${offset}`;
}

function renderHistoryFilter() {
  const currentValue = historyFilter.value || "all";
  const activities = [...new Set(appState.workouts.map((record) => record.activity))].sort((a, b) => a.localeCompare(b, "ja"));
  historyFilter.innerHTML = "";
  historyFilter.append(new Option("すべて", "all"));
  activities.forEach((activity) => historyFilter.append(new Option(activity, activity)));
  historyFilter.value = activities.includes(currentValue) ? currentValue : "all";
}

function renderRecords() {
  recordsList.innerHTML = "";
  const records = getFilteredRecords();

  if (records.length === 0) {
    recordsList.append(createEmptyState("条件に合う記録はまだありません。"));
    return;
  }

  records.forEach((record) => recordsList.append(createRecordNode(record, true)));
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  calendarMonthLabel.textContent = formatCalendarMonth(currentCalendarMonth);
  calendarSelectionLabel.textContent = selectedHistoryDate
    ? `${formatDate(selectedHistoryDate)} の記録を表示中`
    : `${formatCalendarMonth(currentCalendarMonth)} の記録を表示中`;
  calendarClear.classList.toggle("hidden", !selectedHistoryDate);

  const monthStart = startOfMonth(currentCalendarMonth);
  const firstGridDate = new Date(monthStart);
  firstGridDate.setDate(monthStart.getDate() - monthStart.getDay());

  const monthKey = getMonthKey(monthStart);
  const workoutDates = new Set(appState.workouts.filter((record) => record.date.startsWith(monthKey)).map((record) => record.date));
  const todayKey = formatDateKey(new Date());

  for (let offset = 0; offset < 42; offset += 1) {
    const cellDate = new Date(firstGridDate);
    cellDate.setDate(firstGridDate.getDate() + offset);
    const dateKey = formatDateKey(cellDate);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.textContent = String(cellDate.getDate());
    button.classList.toggle("is-outside-month", cellDate.getMonth() !== monthStart.getMonth());
    button.classList.toggle("has-record", workoutDates.has(dateKey));
    button.classList.toggle("is-selected", selectedHistoryDate === dateKey);
    button.classList.toggle("is-today", todayKey === dateKey);
    button.setAttribute("aria-pressed", String(selectedHistoryDate === dateKey));
    button.addEventListener("click", () => selectHistoryDate(dateKey, cellDate));
    calendarGrid.append(button);
  }
}

function renderFriends() {
  pendingRequests.innerHTML = "";
  friendsList.innerHTML = "";
  friendRecordsList.innerHTML = "";
  friendGoalSummary.innerHTML = "";
  friendGoalSummary.classList.add("hidden");

  const hasPending = appState.friends.incoming.length > 0 || appState.friends.outgoing.length > 0;
  if (!hasPending) {
    pendingRequests.append(createEmptyState("申請中のフレンドはまだいません。"));
  } else {
    appState.friends.incoming.forEach((user) => {
      const fragment = friendTemplate.content.cloneNode(true);
      fragment.querySelector(".friend-name").textContent = `@${user.username}`;
      fragment.querySelector(".friend-meta").textContent = "フレンド申請が届いています";
      const actions = fragment.querySelector(".friend-actions");
      actions.append(createActionButton("承認", "secondary-button", () => updateFriend("/api/friends/accept", user.id)));
      actions.append(createActionButton("辞退", "ghost-button", () => updateFriend("/api/friends/decline", user.id)));
      pendingRequests.append(fragment);
    });

    appState.friends.outgoing.forEach((user) => {
      const fragment = friendTemplate.content.cloneNode(true);
      fragment.querySelector(".friend-name").textContent = `@${user.username}`;
      fragment.querySelector(".friend-meta").textContent = "承認待ち";
      const actions = fragment.querySelector(".friend-actions");
      actions.append(createActionButton("取り消す", "ghost-button", () => updateFriend("/api/friends/cancel", user.id)));
      pendingRequests.append(fragment);
    });
  }

  if (appState.friends.accepted.length === 0) {
    friendsList.append(createEmptyState("フレンドはまだいません。"));
    friendRecordsHeading.textContent = "フレンドを選択してください。";
    friendRecordsList.append(createEmptyState("表示できるフレンド記録はまだありません。"));
    return;
  }

  appState.friends.accepted.forEach((user) => {
    const fragment = friendTemplate.content.cloneNode(true);
    fragment.querySelector(".friend-name").textContent = `@${user.username}`;
    fragment.querySelector(".friend-meta").textContent = "フレンド登録済み";
    const actions = fragment.querySelector(".friend-actions");
    actions.append(createActionButton("記録を見る", "secondary-button", () => selectFriend(user.id)));
    actions.append(createActionButton("解除", "ghost-button", () => removeFriend(user.id)));
    friendsList.append(fragment);
  });

  if (!selectedFriendId || !appState.friends.accepted.some((user) => user.id === selectedFriendId)) {
    selectedFriendId = appState.friends.accepted[0].id;
  }

  renderSelectedFriendRecords();
}

function renderSelectedFriendRecords() {
  friendRecordsList.innerHTML = "";
  friendGoalSummary.innerHTML = "";
  friendGoalSummary.classList.add("hidden");

  const friend = appState.friends.accepted.find((user) => user.id === selectedFriendId);
  if (!friend) {
    friendRecordsHeading.textContent = "フレンドを選択してください。";
    friendRecordsList.append(createEmptyState("表示できるフレンド記録はまだありません。"));
    return;
  }

  friendRecordsHeading.textContent = `@${friend.username} の記録`;
  const records = appState.friendWorkouts[friend.id] || [];
  renderFriendGoalSummary(friend, records);

  if (records.length === 0) {
    friendRecordsList.append(createEmptyState("このフレンドにはまだ記録がありません。"));
    return;
  }

  records.forEach((record) => friendRecordsList.append(createRecordNode(record, false)));
}

function updateCaloriesPreview() {
  const activity = activitySelect.value;
  const duration = Number(document.querySelector("#duration").value || 0);
  const intensity = document.querySelector("#intensity").value;

  if (!activity || !duration) {
    caloriesPreview.value = "";
    return;
  }

  caloriesPreview.value = `${calculateCalories(activity, duration, intensity)} kcal`;
}

function calculateCalories(activity, duration, intensity) {
  const base = BASE_CALORIES_PER_MIN[activity] || 6;
  const multiplier = INTENSITY_MULTIPLIER[intensity] || 1;
  return Math.round(base * duration * multiplier);
}

async function deleteWorkout(workoutId) {
  const result = await withLoading("記録を削除しています...", () =>
    apiRequest(`/api/workouts/${workoutId}?userId=${encodeURIComponent(currentUserId)}`, { method: "DELETE" })
  );

  if (!result.ok) {
    formMessage.textContent = result.error;
    return;
  }

  appState = result.data;
  renderApp();
}

async function updateFriend(path, otherUserId) {
  const result = await withLoading("フレンド情報を更新しています...", () =>
    apiRequest(path, {
      method: "POST",
      body: {
        userId: currentUserId,
        otherUserId,
      },
    })
  );

  if (!result.ok) {
    friendMessage.textContent = result.error;
    return;
  }

  appState = result.data;
  renderApp();
}

async function removeFriend(friendId) {
  const result = await withLoading("フレンドを解除しています...", () =>
    apiRequest("/api/friends/remove", {
      method: "POST",
      body: {
        userId: currentUserId,
        friendId,
      },
    })
  );

  if (!result.ok) {
    friendMessage.textContent = result.error;
    return;
  }

  appState = result.data;
  renderApp();
}

async function loadState() {
  const result = await apiRequest(`/api/state?userId=${encodeURIComponent(currentUserId)}`);
  if (!result.ok) {
    return false;
  }

  appState = result.data;
  renderApp();
  return true;
}

async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      return { ok: false, error: data.error || "リクエストに失敗しました。" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "サーバーに接続できませんでした。" };
  }
}

function getFilteredRecords() {
  const monthKey = getMonthKey(currentCalendarMonth);
  return appState.workouts
    .filter((record) => {
      const matchesMonth = record.date.startsWith(monthKey);
      const matchesActivity = historyFilter.value === "all" || record.activity === historyFilter.value;
      const matchesDate = !selectedHistoryDate || record.date === selectedHistoryDate;
      return matchesMonth && matchesActivity && matchesDate;
    })
    .sort((left, right) => {
      if (left.date !== right.date) {
        return right.date.localeCompare(left.date);
      }
      return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
    });
}

function selectFriend(friendId) {
  selectedFriendId = friendId;
  renderSelectedFriendRecords();
}

function selectHistoryDate(dateKey, dateObject) {
  if (selectedHistoryDate === dateKey) {
    selectedHistoryDate = null;
  } else {
    selectedHistoryDate = dateKey;
    currentCalendarMonth = startOfMonth(dateObject);
  }
  renderCalendar();
  renderRecords();
}

function clearSelectedHistoryDate() {
  selectedHistoryDate = null;
  renderCalendar();
  renderRecords();
}

function changeCalendarMonth(diff) {
  currentCalendarMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + diff, 1);
  selectedHistoryDate = null;
  renderCalendar();
  renderRecords();
}

function createRecordNode(record, canDelete) {
  const fragment = recordTemplate.content.cloneNode(true);
  fragment.querySelector(".record-activity").textContent = record.activity;
  const intensityElement = fragment.querySelector(".record-intensity");
  intensityElement.textContent = `強度: ${record.intensity}`;
  intensityElement.classList.add(`intensity-${getIntensityClassName(record.intensity)}`);
  fragment.querySelector(".record-date").textContent = formatDate(record.date);

  const notesElement = fragment.querySelector(".record-notes");
  if (record.notes) {
    notesElement.textContent = record.notes;
  } else {
    notesElement.remove();
  }

  fragment.querySelector(".record-duration").textContent = `${record.duration}分`;
  fragment.querySelector(".record-calories").textContent = `${record.calories}kcal`;

  const deleteButton = fragment.querySelector(".delete-button");
  if (canDelete) {
    deleteButton.addEventListener("click", () => deleteWorkout(record.id));
  } else {
    deleteButton.remove();
  }

  return fragment;
}

function getIntensityClassName(intensity) {
  if (intensity === "弱") return "low";
  if (intensity === "強") return "high";
  return "medium";
}

function getFavoriteActivity(records) {
  if (records.length === 0) {
    return "-";
  }

  const counts = records.reduce((map, record) => {
    map[record.activity] = (map[record.activity] || 0) + 1;
    return map;
  }, {});

  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0][0];
}

function getWeeklyMinutes(records) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 6);

  return records
    .filter((record) => {
      const date = parseLocalDate(record.date);
      return date >= start && date <= today;
    })
    .reduce((sum, record) => sum + record.duration, 0);
}

function getWeeklyGoalProgress(records, weeklyGoalMinutes) {
  const weeklyMinutes = getWeeklyMinutes(records);
  const weeklyGoal = Number(weeklyGoalMinutes) || 150;
  const percent = weeklyGoal > 0 ? Math.min(100, Math.round((weeklyMinutes / weeklyGoal) * 100)) : 0;
  return { weeklyMinutes, weeklyGoal, percent };
}

function renderFriendGoalSummary(friend, records) {
  const { weeklyMinutes, weeklyGoal, percent } = getWeeklyGoalProgress(records, friend.weeklyGoalMinutes);
  const statusLabel = percent >= 100 ? "目標達成" : "目標まで継続中";
  friendGoalSummary.innerHTML = `
    <div class="friend-goal-copy">
      <strong>@${escapeHtml(friend.username)} の1週間の目標</strong>
      <span>${weeklyMinutes}分 / ${weeklyGoal}分</span>
    </div>
    <div class="friend-goal-metric">
      <strong>${percent}%</strong>
      <span>${statusLabel}</span>
    </div>
  `;
  friendGoalSummary.classList.remove("hidden");
}

function createActionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createEmptyState(message) {
  const emptyState = document.createElement("p");
  emptyState.className = "empty-state";
  emptyState.textContent = message;
  return emptyState;
}

function toggleMenu(event) {
  event.stopPropagation();
  const isOpen = !menuPanel.classList.contains("hidden");
  menuPanel.classList.toggle("hidden", isOpen);
  menuToggle.setAttribute("aria-expanded", String(!isOpen));
}

function closeMenu() {
  menuPanel.classList.add("hidden");
  menuToggle.setAttribute("aria-expanded", "false");
}

function handleOutsideMenuClick(event) {
  if (!event.target.closest(".menu-wrapper")) {
    closeMenu();
  }
}

function setCurrentView(view) {
  currentView = view;
  renderCurrentView();
}

function renderCurrentView() {
  recordView.classList.toggle("hidden", currentView !== "record");
  historyView.classList.toggle("hidden", currentView !== "history");
  friendView.classList.toggle("hidden", currentView !== "friends");
}

function showRecordScreen() {
  authScreen.classList.add("hidden");
  recordScreen.classList.remove("hidden");
}

function showAuthScreen() {
  authScreen.classList.remove("hidden");
  recordScreen.classList.add("hidden");
}

function clearMessages() {
  loginMessage.textContent = "";
  registerMessage.textContent = "";
  formMessage.textContent = "";
  goalMessage.textContent = "";
  friendMessage.textContent = "";
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function renderActivityOptions(selectedValue = "") {
  const currentValue = selectedValue || activitySelect.value;
  const activities = getAllActivities();
  activitySelect.innerHTML = "";
  activitySelect.append(new Option("選択してください", ""));
  activities.forEach((activity) => activitySelect.append(new Option(activity, activity)));
  if (activities.includes(currentValue)) {
    activitySelect.value = currentValue;
  }
}

function getAllActivities() {
  return [...Object.keys(BASE_CALORIES_PER_MIN), ...customActivities];
}

function loadCustomActivities() {
  try {
    const stored = localStorage.getItem(CUSTOM_ACTIVITIES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function persistCustomActivities() {
  localStorage.setItem(CUSTOM_ACTIVITIES_KEY, JSON.stringify(customActivities));
}

function setLoading(isLoading, message = "読み込み中...") {
  loadingText.textContent = message;
  loadingOverlay.classList.toggle("hidden", !isLoading);
}

function getRandomLoadingDelay() {
  return Math.floor(Math.random() * 900) + 50;
}

async function withLoading(message, action) {
  setLoading(true, message);
  const start = Date.now();
  const targetDelay = getRandomLoadingDelay();
  try {
    return await action();
  } finally {
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, targetDelay - elapsed);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
    setLoading(false);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parseLocalDate(value));
}

function parseLocalDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatCalendarMonth(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(date);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
