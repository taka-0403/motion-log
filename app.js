
const SESSION_KEY = "motion-log-session-user-id";
const CUSTOM_ACTIVITIES_KEY = "motion-log-custom-activities";
const IS_LOCAL_BACKEND = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SUPABASE_URL = window.MOTION_LOG_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.MOTION_LOG_SUPABASE_ANON_KEY || "";
const supabaseClient = window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const BASE_CALORIES_PER_MIN = { "ランニング": 11, "ウォーキング": 4, "筋トレ": 7, "ヨガ": 3, "サイクリング": 8, "水泳": 10 };
const INTENSITY_MULTIPLIER = { "弱": 0.85, "中": 1, "強": 1.2 };

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

document.querySelector("#date").value = new Date().toISOString().split("T")[0];

let currentUserId = localStorage.getItem(SESSION_KEY);
let customActivities = loadCustomActivities();
let currentView = "record";
let selectedFriendId = null;
let currentCalendarMonth = startOfMonth(new Date());
let selectedHistoryDate = null;
let appState = { currentUser: null, workouts: [], friends: { incoming: [], outgoing: [], accepted: [] }, friendWorkouts: {} };
let appNotice = "";

loginForm.addEventListener("submit", handleLogin);
registerForm.addEventListener("submit", handleRegister);
workoutForm.addEventListener("submit", handleWorkoutSubmit);
goalForm.addEventListener("submit", handleGoalSubmit);
friendRequestForm.addEventListener("submit", handleFriendRequest);
logoutButton.addEventListener("click", handleLogout);
addActivityButton.addEventListener("click", handleAddActivity);
activitySelect.addEventListener("change", updateCaloriesPreview);
document.querySelector("#duration").addEventListener("input", updateCaloriesPreview);
document.querySelector("#intensity").addEventListener("change", updateCaloriesPreview);
historyFilter.addEventListener("change", renderRecords);
calendarPrev.addEventListener("click", () => changeCalendarMonth(-1));
calendarNext.addEventListener("click", () => changeCalendarMonth(1));
calendarClear.addEventListener("click", clearSelectedHistoryDate);
menuToggle.addEventListener("click", toggleMenu);
menuLinks.forEach((link) => link.addEventListener("click", () => { setCurrentView(link.dataset.view || "record"); closeMenu(); }));
document.addEventListener("click", (event) => { if (!event.target.closest(".menu-wrapper")) closeMenu(); });

initialize();

async function initialize() {
  renderActivityOptions();
  updateCaloriesPreview();
  if (IS_LOCAL_BACKEND) {
    if (!currentUserId) {
      showAuthScreen();
      return;
    }
    if (!(await withLoading("セッションを確認しています...", loadState))) {
      currentUserId = null;
      localStorage.removeItem(SESSION_KEY);
      showAuthScreen();
    }
    return;
  }
  if (!supabaseClient) {
    showAuthScreen();
    loginMessage.textContent = "Supabase 設定が未完了です。README の手順を確認してください。";
    return;
  }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    showAuthScreen();
    return;
  }
  currentUserId = session.user.id;
  localStorage.setItem(SESSION_KEY, currentUserId);
  if (!(await withLoading("セッションを確認しています...", loadState))) {
    setFallbackStateFromUser(session.user);
    appNotice = "ログインは完了しましたが、保存データの読み込みに失敗しました。Supabase の schema.sql を確認してください。";
    renderApp();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearMessages();
  const formData = new FormData(loginForm);
  const username = normalizeUsername(formData.get("username"));
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "");
  if (IS_LOCAL_BACKEND) {
    const result = await withLoading("ログインしています...", () =>
      apiRequest("/api/login", {
        method: "POST",
        body: { username, email, password },
      })
    );
    if (!result.ok) {
      loginMessage.textContent = result.error;
      return;
    }
    applyServerState(result.data);
    currentView = "record";
    selectedFriendId = null;
    loginForm.reset();
    renderApp();
    return;
  }
  const result = await withLoading("ログインしています...", async () => {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false, error: "ログインに失敗しました。" };
    currentUserId = data.user.id;
    localStorage.setItem(SESSION_KEY, currentUserId);
    if (!(await waitForStateLoad())) {
      setFallbackStateFromUser(data.user, username);
      appNotice = "ログインは完了しましたが、保存データの読み込みに失敗しました。Supabase の schema.sql を確認してください。";
      return { ok: true };
    }
    if (appState.currentUser?.username !== username) {
      await supabaseClient.auth.signOut();
      currentUserId = null;
      localStorage.removeItem(SESSION_KEY);
      appState = { currentUser: null, workouts: [], friends: { incoming: [], outgoing: [], accepted: [] }, friendWorkouts: {} };
      return { ok: false, error: "ユーザー名とメールアドレスの組み合わせが一致しません。" };
    }
    return { ok: true };
  });
  if (!result.ok) { loginMessage.textContent = result.error; return; }
  currentView = "record";
  selectedFriendId = null;
  loginForm.reset();
  renderApp();
}

async function handleRegister(event) {
  event.preventDefault();
  clearMessages();
  const formData = new FormData(registerForm);
  const username = normalizeUsername(formData.get("username"));
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "");
  if (IS_LOCAL_BACKEND) {
    const result = await withLoading("アカウントを作成しています...", () =>
      apiRequest("/api/register", {
        method: "POST",
        body: { username, email, password },
      })
    );
    if (!result.ok) {
      registerMessage.textContent = result.error;
      return;
    }
    applyServerState(result.data);
    currentView = "record";
    selectedFriendId = null;
    registerForm.reset();
    renderApp();
    return;
  }
  const result = await withLoading("アカウントを作成しています...", async () => {
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { username } } });
    if (error) return { ok: false, error: mapAuthError(error.message) };
    if (!data.user) return { ok: false, error: "新規登録に失敗しました。" };

    let sessionUser = data.user;
    if (!data.session) {
      const signInResult = await supabaseClient.auth.signInWithPassword({ email, password });
      if (signInResult.error || !signInResult.data.user) {
        return { ok: false, error: "Supabase の Confirm email を OFF にしてください。" };
      }
      sessionUser = signInResult.data.user;
    }

    currentUserId = sessionUser.id;
    localStorage.setItem(SESSION_KEY, currentUserId);
    const profileResult = await ensureProfile(currentUserId, username);
    if (!profileResult.ok) return profileResult;
    if (!(await waitForStateLoad())) {
      setFallbackStateFromUser(sessionUser, username);
      appNotice = "登録は完了しましたが、保存データの読み込みに失敗しました。Supabase の schema.sql を確認してください。";
    }
    return { ok: true };
  });
  if (!result.ok) { registerMessage.textContent = result.error; return; }
  currentView = "record";
  selectedFriendId = null;
  registerForm.reset();
  renderApp();
}
async function handleWorkoutSubmit(event) {
  event.preventDefault();
  clearMessages();
  if (!appState.currentUser) { formMessage.textContent = "先にログインしてください。"; return; }
  const formData = new FormData(workoutForm);
  const activity = String(formData.get("activity") || "");
  const duration = Number(formData.get("duration") || 0);
  const intensity = String(formData.get("intensity") || "中");
  const calories = calculateCalories(activity, duration, intensity);
  if (IS_LOCAL_BACKEND) {
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
    if (!result.ok) { formMessage.textContent = result.error; return; }
    applyServerState(result.data);
    workoutForm.reset();
    document.querySelector("#date").value = new Date().toISOString().split("T")[0];
    document.querySelector("#intensity").value = "中";
    caloriesPreview.value = "";
    formMessage.textContent = `記録を保存しました。消費カロリーは ${calories}kcal です。`;
    renderApp();
    return;
  }
  const result = await withLoading("記録を保存しています...", async () => {
    const { error } = await supabaseClient.from("workouts").insert({ user_id: currentUserId, date: formData.get("date"), activity, duration, intensity, calories, notes: String(formData.get("notes") || "").trim() });
    if (error) return { ok: false, error: "記録の保存に失敗しました。" };
    return (await loadState()) ? { ok: true } : { ok: false, error: "記録後の読み込みに失敗しました。" };
  });
  if (!result.ok) { formMessage.textContent = result.error; return; }
  workoutForm.reset();
  document.querySelector("#date").value = new Date().toISOString().split("T")[0];
  document.querySelector("#intensity").value = "中";
  caloriesPreview.value = "";
  formMessage.textContent = `記録を保存しました。消費カロリーは ${calories}kcal です。`;
  renderApp();
}

async function handleGoalSubmit(event) {
  event.preventDefault();
  clearMessages();
  const weeklyGoalMinutes = Number(weeklyGoalInput.value || 0);
  if (weeklyGoalMinutes < 1) { goalMessage.textContent = "目標時間を入力してください。"; return; }
  if (IS_LOCAL_BACKEND) {
    const result = await withLoading("目標を更新しています...", () =>
      apiRequest("/api/goal", {
        method: "POST",
        body: { userId: currentUserId, weeklyGoalMinutes },
      })
    );
    if (!result.ok) { goalMessage.textContent = result.error; return; }
    applyServerState(result.data);
    goalMessage.textContent = "1週間の目標を更新しました。";
    renderApp();
    return;
  }
  const result = await withLoading("目標を更新しています...", async () => {
    const { error } = await supabaseClient.from("profiles").update({ weekly_goal_minutes: weeklyGoalMinutes }).eq("id", currentUserId);
    if (error) return { ok: false, error: "目標の更新に失敗しました。" };
    return (await loadState()) ? { ok: true } : { ok: false, error: "更新後の読み込みに失敗しました。" };
  });
  if (!result.ok) { goalMessage.textContent = result.error; return; }
  goalMessage.textContent = "1週間の目標を更新しました。";
  renderApp();
}

async function handleFriendRequest(event) {
  event.preventDefault();
  clearMessages();
  const friendUsername = normalizeUsername(new FormData(friendRequestForm).get("friendUsername"));
  if (IS_LOCAL_BACKEND) {
    const result = await withLoading("フレンド申請を送っています...", () =>
      apiRequest("/api/friends/request", {
        method: "POST",
        body: { userId: currentUserId, friendUsername },
      })
    );
    if (!result.ok) { friendMessage.textContent = result.error; return; }
    applyServerState(result.data);
    friendRequestForm.reset();
    friendMessage.textContent = "フレンド申請を送りました。";
    renderApp();
    return;
  }
  const result = await withLoading("フレンド申請を送っています...", async () => {
    if (!friendUsername) return { ok: false, error: "ユーザー名を入力してください。" };
    if (friendUsername === appState.currentUser.username) return { ok: false, error: "自分自身には申請できません。" };
    const target = await fetchProfileByUsername(friendUsername);
    if (!target.ok) return target;
    const { error } = await supabaseClient.from("friend_requests").insert({ requester_id: currentUserId, target_id: target.user.id });
    if (error) return { ok: false, error: mapDataError(error.message, "フレンド申請に失敗しました。") };
    return (await loadState()) ? { ok: true } : { ok: false, error: "申請後の読み込みに失敗しました。" };
  });
  if (!result.ok) { friendMessage.textContent = result.error; return; }
  friendRequestForm.reset();
  friendMessage.textContent = "フレンド申請を送りました。";
  renderApp();
}

async function handleLogout() {
  if (IS_LOCAL_BACKEND) {
    currentUserId = null;
    localStorage.removeItem(SESSION_KEY);
    appState = { currentUser: null, workouts: [], friends: { incoming: [], outgoing: [], accepted: [] }, friendWorkouts: {} };
    selectedFriendId = null;
    currentView = "record";
    clearMessages();
    showAuthScreen();
    closeMenu();
    return;
  }
  await supabaseClient.auth.signOut();
  currentUserId = null;
  localStorage.removeItem(SESSION_KEY);
  appState = { currentUser: null, workouts: [], friends: { incoming: [], outgoing: [], accepted: [] }, friendWorkouts: {} };
  selectedFriendId = null;
  currentView = "record";
  clearMessages();
  showAuthScreen();
  closeMenu();
}

function handleAddActivity() {
  clearMessages();
  const value = customActivityInput.value.trim();
  if (!value) { formMessage.textContent = "追加する運動の種類を入力してください。"; return; }
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
  if (!appState.currentUser) { showAuthScreen(); return; }
  showRecordScreen();
  currentUserChip.textContent = `@${appState.currentUser.username}`;
  renderCurrentView();
  renderSummary();
  renderHistoryFilter();
  renderCalendar();
  renderRecords();
  renderFriends();
  updateCaloriesPreview();
  if (appNotice) {
    formMessage.textContent = appNotice;
    appNotice = "";
  }
}

function renderSummary() {
  const records = appState.workouts;
  const totalMinutes = records.reduce((sum, record) => sum + record.duration, 0);
  const totalCalories = records.reduce((sum, record) => sum + record.calories, 0);
  const progress = getWeeklyGoalProgress(records, appState.currentUser.weeklyGoalMinutes);
  const circumference = 2 * Math.PI * 48;
  const offset = circumference - (circumference * progress.percent) / 100;
  summaryElements.totalSessions.textContent = `${records.length}`;
  summaryElements.totalMinutes.textContent = `${totalMinutes}分`;
  summaryElements.totalCalories.textContent = `${totalCalories}kcal`;
  summaryElements.favoriteActivity.textContent = getFavoriteActivity(records);
  heroWeeklyMinutes.textContent = `${progress.weeklyMinutes} / ${progress.weeklyGoal}分`;
  heroUserLabel.textContent = `@${appState.currentUser.username} の直近7日`;
  goalPercent.textContent = `${progress.percent}%`;
  weeklyGoalInput.value = String(progress.weeklyGoal);
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
  calendarSelectionLabel.textContent = selectedHistoryDate ? `${formatDate(selectedHistoryDate)} の記録を表示中` : `${formatCalendarMonth(currentCalendarMonth)} の記録を表示中`;
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
      actions.append(createActionButton("承認", "secondary-button", () => updateFriend("accept", user.id)));
      actions.append(createActionButton("辞退", "ghost-button", () => updateFriend("decline", user.id)));
      pendingRequests.append(fragment);
    });
    appState.friends.outgoing.forEach((user) => {
      const fragment = friendTemplate.content.cloneNode(true);
      fragment.querySelector(".friend-name").textContent = `@${user.username}`;
      fragment.querySelector(".friend-meta").textContent = "承認待ち";
      const actions = fragment.querySelector(".friend-actions");
      actions.append(createActionButton("取り消す", "ghost-button", () => updateFriend("cancel", user.id)));
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
  if (!selectedFriendId || !appState.friends.accepted.some((user) => user.id === selectedFriendId)) selectedFriendId = appState.friends.accepted[0].id;
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

async function deleteWorkout(workoutId) {
  if (IS_LOCAL_BACKEND) {
    const result = await withLoading("記録を削除しています...", () =>
      apiRequest(`/api/workouts/${workoutId}?userId=${encodeURIComponent(currentUserId)}`, {
        method: "DELETE",
      })
    );
    if (!result.ok) { formMessage.textContent = result.error; return; }
    applyServerState(result.data);
    renderApp();
    return;
  }
  const result = await withLoading("記録を削除しています...", async () => {
    const { error } = await supabaseClient.from("workouts").delete().eq("id", workoutId).eq("user_id", currentUserId);
    if (error) return { ok: false, error: "記録の削除に失敗しました。" };
    return (await loadState()) ? { ok: true } : { ok: false, error: "削除後の読み込みに失敗しました。" };
  });
  if (!result.ok) { formMessage.textContent = result.error; return; }
  renderApp();
}

async function updateFriend(action, otherUserId) {
  if (IS_LOCAL_BACKEND) {
    const routeMap = {
      accept: "/api/friends/accept",
      decline: "/api/friends/decline",
      cancel: "/api/friends/cancel",
    };
    const result = await withLoading("フレンド情報を更新しています...", () =>
      apiRequest(routeMap[action], {
        method: "POST",
        body: { userId: currentUserId, otherUserId },
      })
    );
    if (!result.ok) { friendMessage.textContent = result.error; return; }
    applyServerState(result.data);
    renderApp();
    return;
  }
  const result = await withLoading("フレンド情報を更新しています...", async () => {
    if (action === "accept") {
      const { error: insertError } = await supabaseClient.from("friendships").upsert([{ user_id: currentUserId, friend_id: otherUserId }, { user_id: otherUserId, friend_id: currentUserId }], { onConflict: "user_id,friend_id" });
      if (insertError) return { ok: false, error: "フレンド承認に失敗しました。" };
      const { error: deleteError } = await supabaseClient.from("friend_requests").delete().eq("requester_id", otherUserId).eq("target_id", currentUserId);
      if (deleteError) return { ok: false, error: "申請の更新に失敗しました。" };
    }
    if (action === "decline") {
      const { error } = await supabaseClient.from("friend_requests").delete().eq("requester_id", otherUserId).eq("target_id", currentUserId);
      if (error) return { ok: false, error: "申請の辞退に失敗しました。" };
    }
    if (action === "cancel") {
      const { error } = await supabaseClient.from("friend_requests").delete().eq("requester_id", currentUserId).eq("target_id", otherUserId);
      if (error) return { ok: false, error: "申請の取り消しに失敗しました。" };
    }
    return (await loadState()) ? { ok: true } : { ok: false, error: "更新後の読み込みに失敗しました。" };
  });
  if (!result.ok) { friendMessage.textContent = result.error; return; }
  renderApp();
}

async function removeFriend(friendId) {
  if (IS_LOCAL_BACKEND) {
    const result = await withLoading("フレンドを解除しています...", () =>
      apiRequest("/api/friends/remove", {
        method: "POST",
        body: { userId: currentUserId, friendId },
      })
    );
    if (!result.ok) { friendMessage.textContent = result.error; return; }
    applyServerState(result.data);
    renderApp();
    return;
  }
  const result = await withLoading("フレンドを解除しています...", async () => {
    const { error } = await supabaseClient.from("friendships").delete().or(`and(user_id.eq.${currentUserId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUserId})`);
    if (error) return { ok: false, error: "フレンドの解除に失敗しました。" };
    return (await loadState()) ? { ok: true } : { ok: false, error: "解除後の読み込みに失敗しました。" };
  });
  if (!result.ok) { friendMessage.textContent = result.error; return; }
  renderApp();
}

async function loadState() {
  if (IS_LOCAL_BACKEND) {
    const result = await apiRequest(`/api/state?userId=${encodeURIComponent(currentUserId)}`);
    if (!result.ok) return false;
    applyServerState(result.data);
    return true;
  }
  let profileResult = await supabaseClient.from("profiles").select("*").eq("id", currentUserId).single();
  if (profileResult.error || !profileResult.data) {
    const repaired = await repairMissingProfile();
    if (!repaired) return false;
    profileResult = await supabaseClient.from("profiles").select("*").eq("id", currentUserId).single();
    if (profileResult.error || !profileResult.data) return false;
  }
  const [workoutsResult, incomingResult, outgoingResult, acceptedResult] = await Promise.all([
    supabaseClient.from("workouts").select("*").eq("user_id", currentUserId).order("date", { ascending: false }).order("created_at", { ascending: false }),
    supabaseClient.from("friend_requests").select("*").eq("target_id", currentUserId).order("created_at", { ascending: false }),
    supabaseClient.from("friend_requests").select("*").eq("requester_id", currentUserId).order("created_at", { ascending: false }),
    supabaseClient.from("friendships").select("*").eq("user_id", currentUserId),
  ]);
  if (workoutsResult.error || incomingResult.error || outgoingResult.error || acceptedResult.error) return false;
  const incomingIds = incomingResult.data.map((row) => row.requester_id);
  const outgoingIds = outgoingResult.data.map((row) => row.target_id);
  const acceptedIds = acceptedResult.data.map((row) => row.friend_id);
  const relatedIds = [...new Set([...incomingIds, ...outgoingIds, ...acceptedIds])];
  const profilesMap = await fetchProfilesMap(relatedIds);
  const friendWorkouts = await fetchFriendWorkouts(acceptedIds);
  appState = {
    currentUser: mapProfile(profileResult.data),
    workouts: workoutsResult.data.map(mapWorkout),
    friends: {
      incoming: incomingIds.map((id) => profilesMap.get(id)).filter(Boolean),
      outgoing: outgoingIds.map((id) => profilesMap.get(id)).filter(Boolean),
      accepted: acceptedIds.map((id) => profilesMap.get(id)).filter(Boolean),
    },
    friendWorkouts,
  };
  return true;
}
async function repairMissingProfile() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data.user) return false;
  const metadataUsername = normalizeUsername(data.user.user_metadata?.username);
  const emailUsername = normalizeUsername(String(data.user.email || "").split("@")[0]);
  const username = metadataUsername || emailUsername;
  if (!username) return false;
  const profileResult = await ensureProfile(data.user.id, username);
  return profileResult.ok;
}
function setFallbackStateFromUser(user, preferredUsername = "") {
  const metadataUsername = normalizeUsername(user?.user_metadata?.username);
  const emailUsername = normalizeUsername(String(user?.email || "").split("@")[0]);
  const username = preferredUsername || metadataUsername || emailUsername || "user";
  appState = {
    currentUser: {
      id: user?.id || currentUserId || "",
      username,
      weeklyGoalMinutes: 150,
      createdAt: new Date().toISOString(),
    },
    workouts: [],
    friends: { incoming: [], outgoing: [], accepted: [] },
    friendWorkouts: {},
  };
}
async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: data.error || "通信に失敗しました。" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "サーバーに接続できませんでした。" };
  }
}
function applyServerState(state) {
  currentUserId = state.currentUser?.id || currentUserId;
  if (currentUserId) localStorage.setItem(SESSION_KEY, currentUserId);
  appState = {
    currentUser: state.currentUser || null,
    workouts: state.workouts || [],
    friends: state.friends || { incoming: [], outgoing: [], accepted: [] },
    friendWorkouts: state.friendWorkouts || {},
  };
}
function getFilteredRecords() {
  const monthKey = getMonthKey(currentCalendarMonth);
  return appState.workouts.filter((record) => {
    const matchesMonth = record.date.startsWith(monthKey);
    const matchesActivity = historyFilter.value === "all" || record.activity === historyFilter.value;
    const matchesDate = !selectedHistoryDate || record.date === selectedHistoryDate;
    return matchesMonth && matchesActivity && matchesDate;
  }).sort((left, right) => left.date === right.date ? String(right.createdAt || "").localeCompare(String(left.createdAt || "")) : right.date.localeCompare(left.date));
}

function selectFriend(friendId) { selectedFriendId = friendId; renderSelectedFriendRecords(); }
function selectHistoryDate(dateKey, dateObject) { selectedHistoryDate = selectedHistoryDate === dateKey ? null : dateKey; if (selectedHistoryDate) currentCalendarMonth = startOfMonth(dateObject); renderCalendar(); renderRecords(); }
function clearSelectedHistoryDate() { selectedHistoryDate = null; renderCalendar(); renderRecords(); }
function changeCalendarMonth(diff) { currentCalendarMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + diff, 1); selectedHistoryDate = null; renderCalendar(); renderRecords(); }

function createRecordNode(record, canDelete) {
  const fragment = recordTemplate.content.cloneNode(true);
  fragment.querySelector(".record-activity").textContent = record.activity;
  const intensityElement = fragment.querySelector(".record-intensity");
  intensityElement.textContent = `強度: ${record.intensity}`;
  intensityElement.classList.add(`intensity-${getIntensityClassName(record.intensity)}`);
  fragment.querySelector(".record-date").textContent = formatDate(record.date);
  const notesElement = fragment.querySelector(".record-notes");
  if (record.notes) notesElement.textContent = record.notes; else notesElement.remove();
  fragment.querySelector(".record-duration").textContent = `${record.duration}分`;
  fragment.querySelector(".record-calories").textContent = `${record.calories}kcal`;
  const deleteButton = fragment.querySelector(".delete-button");
  if (canDelete) deleteButton.addEventListener("click", () => deleteWorkout(record.id)); else deleteButton.remove();
  return fragment;
}

function getIntensityClassName(intensity) { return intensity === "弱" ? "low" : intensity === "強" ? "high" : "medium"; }
function getFavoriteActivity(records) { if (records.length === 0) return "-"; const counts = records.reduce((map, record) => { map[record.activity] = (map[record.activity] || 0) + 1; return map; }, {}); return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]; }
function getWeeklyMinutes(records) { const today = new Date(); const start = new Date(today); start.setDate(today.getDate() - 6); return records.filter((record) => { const date = parseLocalDate(record.date); return date >= start && date <= today; }).reduce((sum, record) => sum + record.duration, 0); }
function getWeeklyGoalProgress(records, weeklyGoalMinutes) { const weeklyMinutes = getWeeklyMinutes(records); const weeklyGoal = Number(weeklyGoalMinutes) || 150; const percent = weeklyGoal > 0 ? Math.min(100, Math.round((weeklyMinutes / weeklyGoal) * 100)) : 0; return { weeklyMinutes, weeklyGoal, percent }; }
function renderFriendGoalSummary(friend, records) { const progress = getWeeklyGoalProgress(records, friend.weeklyGoalMinutes); const statusLabel = progress.percent >= 100 ? "目標達成" : "目標まで継続中"; friendGoalSummary.innerHTML = `<div class="friend-goal-copy"><strong>@${escapeHtml(friend.username)} の1週間の目標</strong><span>${progress.weeklyMinutes}分 / ${progress.weeklyGoal}分</span></div><div class="friend-goal-metric"><strong>${progress.percent}%</strong><span>${statusLabel}</span></div>`; friendGoalSummary.classList.remove("hidden"); }
function createActionButton(label, className, onClick) { const button = document.createElement("button"); button.type = "button"; button.className = className; button.textContent = label; button.addEventListener("click", onClick); return button; }
function createEmptyState(message) { const emptyState = document.createElement("p"); emptyState.className = "empty-state"; emptyState.textContent = message; return emptyState; }
function toggleMenu(event) { event.stopPropagation(); const isOpen = !menuPanel.classList.contains("hidden"); menuPanel.classList.toggle("hidden", isOpen); menuToggle.setAttribute("aria-expanded", String(!isOpen)); }
function closeMenu() { menuPanel.classList.add("hidden"); menuToggle.setAttribute("aria-expanded", "false"); }
function setCurrentView(view) { currentView = view; renderCurrentView(); }
function renderCurrentView() { recordView.classList.toggle("hidden", currentView !== "record"); historyView.classList.toggle("hidden", currentView !== "history"); friendView.classList.toggle("hidden", currentView !== "friends"); }
function showRecordScreen() { authScreen.classList.add("hidden"); recordScreen.classList.remove("hidden"); }
function showAuthScreen() { authScreen.classList.remove("hidden"); recordScreen.classList.add("hidden"); }
function clearMessages() { loginMessage.textContent = ""; registerMessage.textContent = ""; formMessage.textContent = ""; goalMessage.textContent = ""; friendMessage.textContent = ""; }
function normalizeUsername(value) { return String(value || "").trim().toLowerCase(); }
function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function calculateCalories(activity, duration, intensity) {
  const base = BASE_CALORIES_PER_MIN[activity] ?? 6;
  const multiplier = INTENSITY_MULTIPLIER[intensity] ?? 1;
  return Math.round(base * Number(duration || 0) * multiplier);
}
function updateCaloriesPreview() {
  const activity = activitySelect.value;
  const duration = Number(document.querySelector("#duration").value || 0);
  const intensity = document.querySelector("#intensity").value || "中";
  if (!activity || duration <= 0) {
    caloriesPreview.value = "";
    return;
  }
  caloriesPreview.value = `${calculateCalories(activity, duration, intensity)} kcal`;
}
function renderActivityOptions(selectedValue = "") { const currentValue = selectedValue || activitySelect.value; const activities = getAllActivities(); activitySelect.innerHTML = ""; activitySelect.append(new Option("選択してください", "")); activities.forEach((activity) => activitySelect.append(new Option(activity, activity))); if (activities.includes(currentValue)) activitySelect.value = currentValue; }
function getAllActivities() { return [...Object.keys(BASE_CALORIES_PER_MIN), ...customActivities]; }
function loadCustomActivities() { try { const stored = localStorage.getItem(CUSTOM_ACTIVITIES_KEY); return stored ? JSON.parse(stored) : []; } catch { return []; } }
function persistCustomActivities() { localStorage.setItem(CUSTOM_ACTIVITIES_KEY, JSON.stringify(customActivities)); }
function setLoading(isLoading, message = "読み込み中...") { loadingText.textContent = message; loadingOverlay.classList.toggle("hidden", !isLoading); }
function getRandomLoadingDelay() { return Math.floor(Math.random() * 900) + 50; }
async function withLoading(message, action) { setLoading(true, message); const start = Date.now(); const targetDelay = getRandomLoadingDelay(); try { return await action(); } finally { const remaining = Math.max(0, targetDelay - (Date.now() - start)); if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining)); setLoading(false); } }
async function waitForStateLoad(maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await loadState()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function formatDate(value) { return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(parseLocalDate(value)); }
function parseLocalDate(value) { const [year, month, day] = String(value).split("-").map(Number); return new Date(year, month - 1, day); }
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function formatCalendarMonth(date) { return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(date); }
function formatDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function getMonthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function mapAuthError(message) { const lower = String(message || "").toLowerCase(); return lower.includes("already registered") ? "そのメールアドレスはすでに使われています。" : lower.includes("invalid email") ? "メールアドレスの形式を確認してください。" : "新規登録に失敗しました。"; }
function mapDataError(message, fallback) { const lower = String(message || "").toLowerCase(); return lower.includes("duplicate") ? "その申請はすでに存在します。" : fallback; }
async function ensureProfile(userId, username) { const { error } = await supabaseClient.from("profiles").upsert({ id: userId, username, weekly_goal_minutes: 150 }, { onConflict: "id" }); return error ? { ok: false, error: "プロフィール作成に失敗しました。" } : { ok: true }; }
async function fetchProfileByUsername(username) { const { data, error } = await supabaseClient.from("profiles").select("*").eq("username", username).single(); return error || !data ? { ok: false, error: "そのユーザーは見つかりませんでした。" } : { ok: true, user: mapProfile(data) }; }
async function fetchProfilesMap(ids) { const map = new Map(); if (ids.length === 0) return map; const { data, error } = await supabaseClient.from("profiles").select("*").in("id", ids); if (error || !data) return map; data.forEach((row) => map.set(row.id, mapProfile(row))); return map; }
async function fetchFriendWorkouts(friendIds) { const grouped = {}; if (friendIds.length === 0) return grouped; const { data, error } = await supabaseClient.from("workouts").select("*").in("user_id", friendIds).order("date", { ascending: false }).order("created_at", { ascending: false }); if (error || !data) return grouped; friendIds.forEach((friendId) => { grouped[friendId] = []; }); data.forEach((row) => { if (!grouped[row.user_id]) grouped[row.user_id] = []; if (grouped[row.user_id].length < 20) grouped[row.user_id].push(mapWorkout(row)); }); return grouped; }
function mapProfile(row) { return { id: row.id, username: row.username, weeklyGoalMinutes: row.weekly_goal_minutes, createdAt: row.created_at }; }
function mapWorkout(row) { return { id: row.id, userId: row.user_id, date: row.date, activity: row.activity, duration: row.duration, intensity: row.intensity, calories: row.calories, notes: row.notes, createdAt: row.created_at }; }
