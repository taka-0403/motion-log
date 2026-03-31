const STORAGE_KEY = "motion-log-records";

const form = document.querySelector("#workoutForm");
const formMessage = document.querySelector("#formMessage");
const recordsList = document.querySelector("#recordsList");
const activityFilter = document.querySelector("#activityFilter");
const sortOrder = document.querySelector("#sortOrder");
const recordTemplate = document.querySelector("#recordTemplate");
const heroWeeklyMinutes = document.querySelector("#heroWeeklyMinutes");

const summaryElements = {
  totalSessions: document.querySelector("#totalSessions"),
  totalMinutes: document.querySelector("#totalMinutes"),
  totalCalories: document.querySelector("#totalCalories"),
  favoriteActivity: document.querySelector("#favoriteActivity"),
};

const defaultDate = new Date().toISOString().split("T")[0];
document.querySelector("#date").value = defaultDate;

let records = loadRecords();

form.addEventListener("submit", handleSubmit);
activityFilter.addEventListener("change", render);
sortOrder.addEventListener("change", render);

render();

function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const record = {
    id: crypto.randomUUID(),
    date: formData.get("date"),
    activity: formData.get("activity"),
    duration: Number(formData.get("duration")),
    calories: Number(formData.get("calories") || 0),
    intensity: formData.get("intensity"),
    notes: formData.get("notes").toString().trim(),
    createdAt: Date.now(),
  };

  records = [record, ...records];
  persistRecords();
  form.reset();
  document.querySelector("#date").value = defaultDate;
  document.querySelector("#intensity").value = "ふつう";
  formMessage.textContent = "運動記録を保存しました。";
  render();
}

function loadRecords() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : seedRecords();
  } catch {
    return seedRecords();
  }
}

function persistRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function render() {
  renderFilters();
  renderSummary();
  renderRecords();
}

function renderFilters() {
  const currentValue = activityFilter.value || "all";
  const activities = [...new Set(records.map((record) => record.activity))].sort(
    (left, right) => left.localeCompare(right, "ja")
  );

  activityFilter.innerHTML = "";
  activityFilter.append(new Option("すべて", "all"));

  activities.forEach((activity) => {
    activityFilter.append(new Option(activity, activity));
  });

  activityFilter.value = activities.includes(currentValue) ? currentValue : "all";
}

function renderSummary() {
  const totalSessions = records.length;
  const totalMinutes = records.reduce((sum, record) => sum + record.duration, 0);
  const totalCalories = records.reduce((sum, record) => sum + record.calories, 0);
  const favoriteActivity = getFavoriteActivity(records);
  const weeklyMinutes = getWeeklyMinutes(records);

  summaryElements.totalSessions.textContent = totalSessions.toString();
  summaryElements.totalMinutes.textContent = `${totalMinutes}分`;
  summaryElements.totalCalories.textContent = `${totalCalories}kcal`;
  summaryElements.favoriteActivity.textContent = favoriteActivity;
  heroWeeklyMinutes.textContent = `${weeklyMinutes}分`;
}

function renderRecords() {
  const filteredRecords = getVisibleRecords();
  recordsList.innerHTML = "";

  if (filteredRecords.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "条件に合う記録がまだありません。";
    recordsList.append(emptyState);
    return;
  }

  filteredRecords.forEach((record) => {
    const fragment = recordTemplate.content.cloneNode(true);
    fragment.querySelector(".record-activity").textContent = record.activity;
    fragment.querySelector(".record-intensity").textContent = record.intensity;
    fragment.querySelector(".record-date").textContent = formatDate(record.date);
    fragment.querySelector(".record-notes").textContent = record.notes || "メモなし";
    fragment.querySelector(".record-duration").textContent = `${record.duration}分`;
    fragment.querySelector(".record-calories").textContent = `${record.calories}kcal`;
    fragment.querySelector(".delete-button").addEventListener("click", () => {
      records = records.filter((item) => item.id !== record.id);
      persistRecords();
      render();
    });

    recordsList.append(fragment);
  });
}

function getVisibleRecords() {
  const filterValue = activityFilter.value;
  const sortValue = sortOrder.value;

  const filtered = filterValue === "all"
    ? [...records]
    : records.filter((record) => record.activity === filterValue);

  return filtered.sort((left, right) => {
    if (sortValue === "oldest") {
      return parseLocalDate(left.date) - parseLocalDate(right.date);
    }

    if (sortValue === "longest") {
      return right.duration - left.duration;
    }

    return parseLocalDate(right.date) - parseLocalDate(left.date) || right.createdAt - left.createdAt;
  });
}

function getFavoriteActivity(data) {
  if (data.length === 0) {
    return "-";
  }

  const counts = data.reduce((map, record) => {
    map[record.activity] = (map[record.activity] || 0) + 1;
    return map;
  }, {});

  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0][0];
}

function getWeeklyMinutes(data) {
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 6);

  return data
    .filter((record) => {
      const date = parseLocalDate(record.date);
      return date >= lastWeek && date <= today;
    })
    .reduce((sum, record) => sum + record.duration, 0);
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
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function seedRecords() {
  const starterRecords = [
    {
      id: crypto.randomUUID(),
      date: shiftDate(-1),
      activity: "ランニング",
      duration: 35,
      calories: 280,
      intensity: "高め",
      notes: "4.8km。後半は少しペースアップ。",
      createdAt: Date.now() - 1000,
    },
    {
      id: crypto.randomUUID(),
      date: shiftDate(-3),
      activity: "ヨガ",
      duration: 40,
      calories: 140,
      intensity: "軽め",
      notes: "就寝前にストレッチ中心で実施。",
      createdAt: Date.now() - 2000,
    },
    {
      id: crypto.randomUUID(),
      date: shiftDate(-5),
      activity: "筋トレ",
      duration: 50,
      calories: 310,
      intensity: "ふつう",
      notes: "下半身メイン。スクワット多め。",
      createdAt: Date.now() - 3000,
    },
  ];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(starterRecords));
  return starterRecords;
}

function shiftDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}
