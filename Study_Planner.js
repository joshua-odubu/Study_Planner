// -- STORAGE ---------------------------------------------------------------
const LS = key => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    return null;
  }
};
const SS = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const CATEGORIES = ['study', 'work', 'personal'];
const PRIORITIES = ['high', 'medium', 'low'];
const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
const REPEAT_LABELS = {none: 'No repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly'};
const catLbl = {study: 'Study', work: 'Work', personal: 'Personal'};
const priLbl = {high: 'High', medium: 'Medium', low: 'Low'};
const priRank = {high: 0, medium: 1, low: 2};

const escapeMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => escapeMap[char]);
}
function safeJs(value) {
  return escapeHTML(JSON.stringify(String(value ?? '')));
}
function uid(prefix) {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function todayISO() {
  return toISODate(new Date());
}
function parseISODate(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
function ds(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function formatDateLabel(value) {
  const date = parseISODate(value);
  return date ? date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '';
}
function addRepeatDate(dateStr, repeat) {
  const date = parseISODate(dateStr);
  if (!date) return '';
  if (repeat === 'daily') date.setDate(date.getDate() + 1);
  if (repeat === 'weekly') date.setDate(date.getDate() + 7);
  if (repeat === 'monthly') date.setMonth(date.getMonth() + 1);
  return toISODate(date);
}
function occursOn(item, dateStr, field) {
  const start = item[field];
  const repeat = REPEATS.includes(item.repeat) ? item.repeat : 'none';
  if (!start) return false;
  if (repeat === 'none') return start === dateStr;
  const startDate = parseISODate(start);
  const targetDate = parseISODate(dateStr);
  if (!startDate || !targetDate || targetDate < startDate) return false;
  const dayDiff = Math.round((targetDate - startDate) / 86400000);
  if (repeat === 'daily') return true;
  if (repeat === 'weekly') return dayDiff % 7 === 0;
  if (repeat === 'monthly') return targetDate.getDate() === startDate.getDate();
  return false;
}

function validFrom(list, value, fallback) {
  return list.includes(value) ? value : fallback;
}
function normalizeTask(task = {}) {
  return {
    id: String(task.id || uid('t_')),
    title: String(task.title || '').trim(),
    cat: validFrom(CATEGORIES, task.cat, 'study'),
    pri: validFrom(PRIORITIES, task.pri, 'medium'),
    due: String(task.due || ''),
    repeat: validFrom(REPEATS, task.repeat, 'none'),
    done: task.done === true || task.done === '1',
    created: Number(task.created) || Date.now(),
    completedAt: task.completedAt ? Number(task.completedAt) : null
  };
}
function normalizeEvent(event = {}) {
  return {
    id: String(event.id || uid('e_')),
    title: String(event.title || '').trim(),
    date: String(event.date || todayISO()),
    time: String(event.time || ''),
    duration: Math.max(15, Number(event.duration) || 60),
    repeat: validFrom(REPEATS, event.repeat, 'none'),
    cat: validFrom(CATEGORIES, event.cat, 'study')
  };
}
function normalizePd(value = {}) {
  const now = new Date().toDateString();
  const sameDay = value.date === now;
  return {
    date: now,
    count: sameDay ? Number(value.count) || 0 : 0,
    wk: value.wk && typeof value.wk === 'object' ? value.wk : {},
    log: sameDay && Array.isArray(value.log) ? value.log.slice(0, 50) : []
  };
}
function normalizeStreak(value = {}) {
  return {days: Number(value.days) || 0, last: String(value.last || '')};
}
function saveLocalData() {
  SS('sp_tasks', tasks);
  SS('sp_events', events);
  SS('sp_pd', pd);
  SS('sp_streak', streak);
}

// -- FIREBASE SYNC ---------------------------------------------------------
let DB_URL = String(localStorage.getItem('sp_db_url') || '').replace(/\/+$/, '');

function setBadge(state) {
  const badge = document.getElementById('sync-badge');
  if (!DB_URL) {
    badge.style.display = 'none';
    return;
  }
  badge.style.display = 'inline-flex';
  badge.className = `sync-badge ${{ok: 'sync-ok', ing: 'sync-ing', err: 'sync-err'}[state] || 'sync-err'}`;
  badge.textContent = {ok: 'Synced', ing: 'Syncing...', err: 'Sync error'}[state] || 'Sync error';
}
function dbPath(path = '') {
  return `${DB_URL}/studyplanner${path ? `/${path}` : ''}.json`;
}
function validDbUrl(url) {
  return !url || /^https:\/\/.+\.(firebaseio\.com|firebasedatabase\.app)$/i.test(url);
}
async function dbPut(path, data) {
  if (!DB_URL) return false;
  try {
    const response = await fetch(dbPath(path), {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    return response.ok;
  } catch (err) {
    return false;
  }
}
async function dbGet() {
  if (!DB_URL) return {ok: false, data: null};
  try {
    const response = await fetch(dbPath());
    if (!response.ok) return {ok: false, data: null};
    return {ok: true, data: await response.json()};
  } catch (err) {
    return {ok: false, data: null};
  }
}
function plannerPayload() {
  return {
    sp_tasks: tasks,
    sp_events: events,
    sp_pd: pd,
    sp_streak: streak,
    sp_meta: {updatedAt: new Date().toISOString(), version: 2}
  };
}
function syncTasks() {
  if (!DB_URL) return;
  setBadge('ing');
  dbPut('sp_tasks', tasks).then(ok => setBadge(ok ? 'ok' : 'err'));
}
function syncEvents() {
  if (!DB_URL) return;
  setBadge('ing');
  dbPut('sp_events', events).then(ok => setBadge(ok ? 'ok' : 'err'));
}
function syncPd() {
  if (!DB_URL) return;
  setBadge('ing');
  dbPut('sp_pd', pd).then(ok => setBadge(ok ? 'ok' : 'err'));
}
function syncStreak() {
  if (!DB_URL) return;
  setBadge('ing');
  dbPut('sp_streak', streak).then(ok => setBadge(ok ? 'ok' : 'err'));
}
function applyRemoteData(data) {
  if (!data || typeof data !== 'object') return false;
  let found = false;
  if (Object.prototype.hasOwnProperty.call(data, 'sp_tasks')) {
    tasks = Array.isArray(data.sp_tasks) ? data.sp_tasks.map(normalizeTask).filter(t => t.title) : [];
    SS('sp_tasks', tasks);
    found = true;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'sp_events')) {
    events = Array.isArray(data.sp_events) ? data.sp_events.map(normalizeEvent).filter(e => e.title) : [];
    SS('sp_events', events);
    found = true;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'sp_pd')) {
    pd = normalizePd(data.sp_pd || {});
    SS('sp_pd', pd);
    found = true;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'sp_streak')) {
    streak = normalizeStreak(data.sp_streak || {});
    SS('sp_streak', streak);
    found = true;
  }
  return found;
}
async function loadFromDB() {
  if (!DB_URL) return {ok: false, found: false};
  setBadge('ing');
  const result = await dbGet();
  if (!result.ok) {
    setBadge('err');
    return {ok: false, found: false};
  }
  const found = applyRemoteData(result.data);
  setBadge('ok');
  return {ok: true, found};
}
async function pushAllToDB() {
  if (!DB_URL) return false;
  setBadge('ing');
  const ok = await dbPut('', plannerPayload());
  setBadge(ok ? 'ok' : 'err');
  return ok;
}
async function initSync() {
  if (!DB_URL) return;
  const result = await loadFromDB();
  if (result.ok && result.found) renderAll();
  if (result.ok && !result.found) await pushAllToDB();
}

// -- DATA INIT -------------------------------------------------------------
(function removeOldSeedTasks() {
  const saved = LS('sp_tasks');
  if (saved && saved.some(t => t.id && (String(t.id).startsWith('itil_') || String(t.id).startsWith('js_')))) {
    localStorage.removeItem('sp_tasks');
  }
})();

let tasks = (LS('sp_tasks') || []).map(normalizeTask).filter(t => t.title);
let events = (LS('sp_events') || []).map(normalizeEvent).filter(e => e.title);
let pd = normalizePd(LS('sp_pd') || {});
let streak = normalizeStreak(LS('sp_streak') || {});
saveLocalData();

// -- DIALOGS AND NOTIFICATIONS -------------------------------------------
const focusableSelector = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]):not(.visually-hidden), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let activeModal = null;
let previousFocus = null;
const notifiedEvents = new Set();

function openDialog(id) {
  const modal = document.getElementById(id);
  previousFocus = document.activeElement;
  modal.classList.add('open');
  activeModal = modal;
  setTimeout(() => {
    const first = modal.querySelector(focusableSelector);
    if (first) first.focus();
  }, 0);
}
function closeDialog(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('open');
  if (activeModal === modal) activeModal = null;
  if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
}
function closeActiveDialog() {
  if (!activeModal) return;
  if (activeModal.id === 'cfg-modal') closeCfg();
  if (activeModal.id === 'ev-modal') closeModal();
  if (activeModal.id === 'task-modal') closeTaskModal();
}
document.addEventListener('keydown', event => {
  if (!activeModal) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeActiveDialog();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...activeModal.querySelectorAll(focusableSelector)].filter(el => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted';
}
function notifyUser(title, body) {
  if (canNotify()) new Notification(title, {body});
}
function announce(title, body) {
  notifyUser(title, body);
  if (!canNotify()) alert(body);
}
function requestNotifyPermission() {
  if (!('Notification' in window)) {
    alert('This browser does not support desktop notifications.');
    return;
  }
  Notification.requestPermission().then(permission => {
    alert(permission === 'granted' ? 'Notifications are enabled.' : 'Notifications were not enabled.');
  });
}
function checkUpcomingEvents() {
  if (!canNotify()) return;
  const now = new Date();
  eventsOn(todayISO()).forEach(event => {
    if (!event.time) return;
    const [hour, minute] = event.time.split(':').map(Number);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return;
    const startsAt = parseISODate(todayISO());
    startsAt.setHours(hour, minute, 0, 0);
    const diff = startsAt - now;
    const key = `${event.id}:${todayISO()}`;
    if (diff >= 0 && diff <= 10 * 60 * 1000 && !notifiedEvents.has(key)) {
      notifiedEvents.add(key);
      notifyUser('Upcoming event', `${event.title} starts at ${event.time}`);
    }
  });
}

// -- SETTINGS, IMPORT, EXPORT ---------------------------------------------
function openSettings() {
  document.getElementById('cfg-url').value = DB_URL;
  openDialog('cfg-modal');
}
function closeCfg() {
  closeDialog('cfg-modal');
}
function saveCfg() {
  const nextUrl = document.getElementById('cfg-url').value.trim().replace(/\/+$/, '');
  if (!validDbUrl(nextUrl)) {
    alert('Enter a valid Firebase Realtime Database URL that starts with https://.');
    return;
  }
  DB_URL = nextUrl;
  localStorage.setItem('sp_db_url', DB_URL);
  closeCfg();
  if (DB_URL) initSync();
  else setBadge('ok');
}
async function forcePull() {
  if (!DB_URL) {
    alert('Enter your Firebase Database URL first, then Save.');
    return;
  }
  closeCfg();
  const result = await loadFromDB();
  if (result.ok && result.found) renderAll();
  if (result.ok && !result.found) alert('Connected, but no remote planner data was found.');
  if (!result.ok) alert('Could not connect to Firebase. Check the URL and database rules.');
}
async function forcePush() {
  if (!DB_URL) {
    alert('Enter your Firebase Database URL first, then Save.');
    return;
  }
  closeCfg();
  await pushAllToDB();
}
function exportBackup() {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    tasks,
    events,
    pd,
    streak
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `study-planner-backup-${todayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
function importBackup(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || '{}'));
      const nextTasks = Array.isArray(data.tasks) ? data.tasks : data.sp_tasks;
      const nextEvents = Array.isArray(data.events) ? data.events : data.sp_events;
      if (!Array.isArray(nextTasks) && !Array.isArray(nextEvents)) throw new Error('No planner data found');
      if (!confirm('Importing this backup will replace your current local planner data. Continue?')) return;
      tasks = (nextTasks || []).map(normalizeTask).filter(t => t.title);
      events = (nextEvents || []).map(normalizeEvent).filter(e => e.title);
      pd = normalizePd(data.pd || data.sp_pd || {});
      streak = normalizeStreak(data.streak || data.sp_streak || {});
      saveLocalData();
      renderAll();
      pushAllToDB();
    } catch (err) {
      alert('Could not import that backup file.');
    }
  };
  reader.readAsText(file);
}

// -- QUOTES ----------------------------------------------------------------
const QUOTES = [
  {text: 'The secret of getting ahead is getting started.', author: 'Mark Twain'},
  {text: "It always seems impossible until it's done.", author: 'Nelson Mandela'},
  {text: "Don't watch the clock; do what it does. Keep going.", author: 'Sam Levenson'},
  {text: 'The expert in anything was once a beginner.', author: 'Helen Hayes'},
  {text: 'Push yourself, because no one else is going to do it for you.', author: 'Unknown'},
  {text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier'},
  {text: "You don't have to be great to start, but you have to start to be great.", author: 'Zig Ziglar'},
  {text: 'Motivation is what gets you started. Habit is what keeps you going.', author: 'Jim Ryun'},
  {text: 'The beautiful thing about learning is nobody can take it away from you.', author: 'B.B. King'},
  {text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin'},
  {text: 'Education is not the filling of a pail, but the lighting of a fire.', author: 'W.B. Yeats'},
  {text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs'},
  {text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss'},
  {text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: 'Stephen Covey'},
  {text: 'Either you run the day or the day runs you.', author: 'Jim Rohn'},
  {text: 'Small daily improvements are the key to staggering long-term results.', author: 'Robin Sharma'},
  {text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe'},
  {text: "Believe you can and you're halfway there.", author: 'Theodore Roosevelt'},
  {text: "Hard work beats talent when talent doesn't work hard.", author: 'Tim Notke'},
  {text: 'The future depends on what you do today.', author: 'Mahatma Gandhi'},
  {text: 'Every accomplishment starts with the decision to try.', author: 'John F. Kennedy'},
  {text: "You don't need to see the whole staircase, just take the first step.", author: 'Martin Luther King Jr.'},
  {text: 'What you do today can improve all your tomorrows.', author: 'Ralph Marston'},
  {text: 'Action is the foundational key to all success.', author: 'Pablo Picasso'},
  {text: 'There are no shortcuts to any place worth going.', author: 'Beverly Sills'},
  {text: 'Live as if you were to die tomorrow. Learn as if you were to live forever.', author: 'Mahatma Gandhi'},
  {text: 'Success usually comes to those who are too busy to be looking for it.', author: 'Henry David Thoreau'},
  {text: 'The distance between your dreams and reality is called action.', author: 'Unknown'},
  {text: 'Work hard in silence. Let success make the noise.', author: 'Frank Ocean'},
  {text: 'Do the hard jobs first. The easy jobs will take care of themselves.', author: 'Dale Carnegie'}
];

// -- HOME AND TABS ---------------------------------------------------------
function initHome() {
  const now = new Date();
  const hour = now.getHours();
  document.getElementById('home-tod').textContent = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  document.getElementById('home-date').textContent = now.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const quote = QUOTES[dayOfYear % QUOTES.length];
  document.getElementById('quote-text').textContent = quote.text;
  document.getElementById('quote-author').textContent = `- ${quote.author}`;
  document.getElementById('h-due').textContent = tasks.filter(t => !t.done && occursOn(t, todayISO(), 'due')).length;
  document.getElementById('h-streak').textContent = streak.days;
  document.getElementById('h-pomo').textContent = pd.count;
  document.getElementById('h-done').textContent = tasks.filter(t => t.done).length;
}
function showTab(name, btn) {
  document.querySelectorAll('.section, .home-section').forEach(section => section.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  const target = btn || [...document.querySelectorAll('.nav-tab')].find(tab => (tab.getAttribute('onclick') || '').includes(`'${name}'`));
  if (target) target.classList.add('active');
  if (name === 'progress') renderProgress();
  if (name === 'todo') renderTodo();
  if (name === 'pomodoro') renderPomoSel();
  if (name === 'home') initHome();
}
function renderAll() {
  renderCal();
  renderTodo();
  renderProgress();
  renderPomoSel();
  renderLog();
  updatePomoStats();
  initHome();
}

// -- CALENDAR --------------------------------------------------------------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let calCur = new Date();
let calView = 'month';

function catColor(cat) {
  return cat === 'study' ? 'var(--study)' : cat === 'work' ? 'var(--work)' : 'var(--personal)';
}
function setView(view) {
  calView = view;
  ['month', 'week', 'day'].forEach(item => document.getElementById(`vbtn-${item}`).classList.toggle('active', item === view));
  renderCal();
}
function calNav(delta) {
  if (calView === 'month') calCur.setMonth(calCur.getMonth() + delta);
  else if (calView === 'week') calCur.setDate(calCur.getDate() + delta * 7);
  else calCur.setDate(calCur.getDate() + delta);
  renderCal();
}
function calToday() {
  calCur = new Date();
  renderCal();
}
function renderCal() {
  if (calView === 'month') renderMonth();
  else if (calView === 'week') renderWeek();
  else renderDay();
}
function eventsOn(dateStr) {
  return events
    .filter(event => occursOn(event, dateStr, 'date'))
    .map(event => ({...event, instanceDate: dateStr}))
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}
function tasksOn(dateStr) {
  return tasks.filter(task => !task.done && occursOn(task, dateStr, 'due'));
}
function eventHour(event) {
  const hour = Number(String(event.time || '').slice(0, 2));
  return Number.isNaN(hour) ? null : hour;
}
function addMinutes(time, minutes) {
  const [hour, minute] = String(time || '').split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return '';
  const date = new Date(2000, 0, 1, hour, minute + Number(minutes || 0));
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function eventTimeRange(event) {
  if (!event.time) return 'Any time';
  return `${event.time}-${addMinutes(event.time, event.duration)}`;
}
function eventChip(event, showTime = false) {
  const repeatIcon = event.repeat !== 'none' ? '<i class="fa-solid fa-repeat event-repeat-icon" aria-hidden="true"></i>' : '';
  const time = showTime && event.time ? `<span>${escapeHTML(eventTimeRange(event))} </span>` : '';
  return `<button type="button" class="day-ev" style="background:${catColor(event.cat)}" onclick="editEvent(${safeJs(event.id)})" aria-label="Edit event ${escapeHTML(event.title)}">${time}${escapeHTML(event.title)}${repeatIcon}</button>`;
}
function taskChip(task) {
  const repeatIcon = task.repeat !== 'none' ? '<i class="fa-solid fa-repeat event-repeat-icon" aria-hidden="true"></i>' : '';
  return `<button type="button" class="day-ev task-chip" onclick="openTaskEdit(${safeJs(task.id)})" aria-label="Edit task ${escapeHTML(task.title)}">${escapeHTML(task.title)}${repeatIcon}</button>`;
}

function renderMonth() {
  const year = calCur.getFullYear();
  const month = calCur.getMonth();
  document.getElementById('cal-title').textContent = `${MONTHS[month]} ${year}`;
  const today = new Date();
  const firstDay = new Date(year, month, 1);
  let dow = firstDay.getDay();
  dow = dow === 0 ? 6 : dow - 1;
  const dim = new Date(year, month + 1, 0).getDate();
  const dipm = new Date(year, month, 0).getDate();
  let html = `<table class="month-grid"><thead><tr>${DAYS.map(day => `<th>${day}</th>`).join('')}</tr></thead><tbody><tr>`;
  let cell = 0;
  for (let i = dow - 1; i >= 0; i--) {
    html += `<td class="other-month"><div class="day-num">${dipm - i}</div></td>`;
    cell++;
  }
  for (let day = 1; day <= dim; day++) {
    if (cell % 7 === 0 && cell > 0) html += '</tr><tr>';
    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const dateStr = ds(year, month, day);
    const evs = eventsOn(dateStr);
    const tks = tasksOn(dateStr);
    const visibleEvents = evs.slice(0, 3);
    const visibleTasks = tks.slice(0, Math.max(0, 3 - visibleEvents.length));
    const hiddenCount = evs.length + tks.length - visibleEvents.length - visibleTasks.length;
    html += `<td class="${isToday ? 'today' : ''}">
      <button type="button" class="day-open-btn" onclick="dayClick(${safeJs(dateStr)})" aria-label="Open ${escapeHTML(formatDateLabel(dateStr))}">
        <span class="day-num">${isToday ? `<span class="today-circle">${day}</span>` : day}</span>
      </button>
      ${visibleEvents.map(event => eventChip(event)).join('')}
      ${visibleTasks.map(task => taskChip(task)).join('')}
      ${hiddenCount > 0 ? `<button type="button" class="slot-add-btn" onclick="dayClick(${safeJs(dateStr)})">+${hiddenCount} more</button>` : ''}
    </td>`;
    cell++;
  }
  const remaining = 7 - (cell % 7);
  if (remaining < 7) {
    for (let day = 1; day <= remaining; day++) html += `<td class="other-month"><div class="day-num">${day}</div></td>`;
  }
  html += '</tr></tbody></table>';
  document.getElementById('cal-body').innerHTML = html;
}

function renderWeek() {
  const date = new Date(calCur);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  const weekStart = new Date(date);
  document.getElementById('cal-title').textContent = `Week of ${weekStart.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})}`;
  const today = new Date();
  const days = Array.from({length: 7}, (_, index) => {
    const next = new Date(weekStart);
    next.setDate(weekStart.getDate() + index);
    return next;
  });
  let html = '<div class="week-grid"><div class="week-hdr"></div>';
  days.forEach((day, index) => {
    const isToday = day.toDateString() === today.toDateString();
    html += `<div class="week-hdr ${isToday ? 'tdc' : ''}">${DAYS[index]}<br><strong style="font-size:.92rem">${day.getDate()}</strong></div>`;
  });
  for (let hour = 7; hour <= 22; hour++) {
    html += `<div class="wk-time">${String(hour).padStart(2, '0')}:00</div>`;
    days.forEach(day => {
      const isToday = day.toDateString() === today.toDateString();
      const dateStr = ds(day.getFullYear(), day.getMonth(), day.getDate());
      const evs = eventsOn(dateStr).filter(event => eventHour(event) === hour);
      html += `<div class="wk-cell ${isToday ? 'tdc' : ''}">
        ${evs.map(event => eventChip(event)).join('')}
        <button type="button" class="slot-add-btn" onclick="openModal(${safeJs(dateStr)},${safeJs(`${String(hour).padStart(2, '0')}:00`)})" aria-label="Add event at ${String(hour).padStart(2, '0')}:00">Add event</button>
      </div>`;
    });
  }
  html += '</div>';
  document.getElementById('cal-body').innerHTML = html;
}

function renderDay() {
  const year = calCur.getFullYear();
  const month = calCur.getMonth();
  const day = calCur.getDate();
  document.getElementById('cal-title').textContent = calCur.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  const dateStr = ds(year, month, day);
  const dayTasks = tasksOn(dateStr);
  const dayEvents = eventsOn(dateStr);
  let html = '';
  if (dayTasks.length) {
    html += '<div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap">';
    dayTasks.forEach(task => {
      html += `<span class="badge badge-${task.cat}">${escapeHTML(task.title)}</span>`;
    });
    html += '</div>';
  }
  if (dayEvents.length) {
    html += '<div class="day-agenda">';
    dayEvents.forEach(event => {
      html += `<div class="day-agenda-row">
        <span class="day-agenda-time">${escapeHTML(eventTimeRange(event))}</span>
        ${eventChip(event, false)}
        <button type="button" class="btn btn-ghost btn-sm" onclick="editEvent(${safeJs(event.id)})" aria-label="Edit event"><i class="fa-solid fa-pen"></i></button>
      </div>`;
    });
    html += '</div>';
  }
  html += '<div class="day-slots">';
  for (let hour = 7; hour <= 22; hour++) {
    [0, 30].forEach(minute => {
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const evs = dayEvents.filter(event => event.time === time);
      html += `<div class="dslot-t">${time}</div><div class="dslot-c">
        ${evs.map(event => eventChip(event, true)).join('')}
        <button type="button" class="slot-add-btn" onclick="openModal(${safeJs(dateStr)},${safeJs(time)})" aria-label="Add event at ${time}">Add event</button>
      </div>`;
    });
  }
  html += '</div>';
  document.getElementById('cal-body').innerHTML = html;
}
function dayClick(dateStr) {
  calCur = parseISODate(dateStr) || new Date();
  setView('day');
}

// -- EVENTS ----------------------------------------------------------------
function openModal(date, time) {
  document.getElementById('ev-modal-title').innerHTML = '<i class="fa-regular fa-calendar-plus" style="color:var(--accent)"></i> Add Event';
  document.getElementById('ev-id').value = '';
  document.getElementById('ev-date').value = date || todayISO();
  document.getElementById('ev-time').value = time || '';
  document.getElementById('ev-title').value = '';
  document.getElementById('ev-cat').value = 'study';
  document.getElementById('ev-duration').value = '60';
  document.getElementById('ev-repeat').value = 'none';
  document.getElementById('ev-delete').style.display = 'none';
  document.getElementById('ev-save-btn').textContent = 'Save Event';
  openDialog('ev-modal');
}
function editEvent(id) {
  const event = events.find(item => String(item.id) === String(id));
  if (!event) return;
  document.getElementById('ev-modal-title').innerHTML = '<i class="fa-solid fa-pen" style="color:var(--accent)"></i> Edit Event';
  document.getElementById('ev-id').value = event.id;
  document.getElementById('ev-title').value = event.title;
  document.getElementById('ev-date').value = event.date;
  document.getElementById('ev-time').value = event.time;
  document.getElementById('ev-cat').value = event.cat;
  document.getElementById('ev-duration').value = String(event.duration);
  document.getElementById('ev-repeat').value = event.repeat;
  document.getElementById('ev-delete').style.display = '';
  document.getElementById('ev-save-btn').textContent = 'Save Changes';
  openDialog('ev-modal');
}
function closeModal() {
  closeDialog('ev-modal');
}
function saveEvent() {
  const title = document.getElementById('ev-title').value.trim();
  const date = document.getElementById('ev-date').value;
  if (!title || !date) {
    alert('Add an event title and date.');
    return;
  }
  const event = normalizeEvent({
    id: document.getElementById('ev-id').value || uid('e_'),
    title,
    date,
    time: document.getElementById('ev-time').value,
    duration: document.getElementById('ev-duration').value,
    repeat: document.getElementById('ev-repeat').value,
    cat: document.getElementById('ev-cat').value
  });
  const index = events.findIndex(item => item.id === event.id);
  if (index >= 0) events[index] = event;
  else events.push(event);
  SS('sp_events', events);
  syncEvents();
  closeModal();
  renderCal();
  checkUpcomingEvents();
}
function deleteEventFromModal() {
  const id = document.getElementById('ev-id').value;
  if (!id) return;
  if (!confirm('Delete this event?')) return;
  events = events.filter(event => event.id !== id);
  SS('sp_events', events);
  syncEvents();
  closeModal();
  renderCal();
}

// -- TASKS -----------------------------------------------------------------
let curFilter = 'all';
let taskSearch = '';
let taskSort = 'due';

function setFilter(filter, btn) {
  curFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(button => button.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTodo();
}
function setTaskSearch(value) {
  taskSearch = String(value || '').trim().toLowerCase();
  renderTodo();
}
function setTaskSort(value) {
  taskSort = value;
  renderTodo();
}
function addTask() {
  const title = document.getElementById('t-title').value.trim();
  if (!title) return;
  const task = normalizeTask({
    id: uid('t_'),
    title,
    cat: document.getElementById('t-cat').value,
    pri: document.getElementById('t-pri').value,
    due: document.getElementById('t-due').value,
    repeat: document.getElementById('t-repeat').value,
    done: false,
    created: Date.now(),
    completedAt: null
  });
  tasks.push(task);
  SS('sp_tasks', tasks);
  syncTasks();
  document.getElementById('t-title').value = '';
  renderTodo();
  renderCal();
  renderPomoSel();
}
function scheduleNextTask(task) {
  if (!task.due || task.repeat === 'none') return;
  const nextDue = addRepeatDate(task.due, task.repeat);
  if (!nextDue) return;
  const exists = tasks.some(item => !item.done && item.title === task.title && item.cat === task.cat && item.pri === task.pri && item.due === nextDue && item.repeat === task.repeat);
  if (exists) return;
  tasks.push(normalizeTask({...task, id: uid('t_'), due: nextDue, done: false, completedAt: null, created: Date.now()}));
}
function toggleTask(id) {
  const task = tasks.find(item => item.id === id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? Date.now() : null;
  if (task.done) {
    scheduleNextTask(task);
    touchStreak();
  }
  SS('sp_tasks', tasks);
  syncTasks();
  renderTodo();
  renderCal();
  renderProgress();
  renderPomoSel();
}
function delTask(id) {
  if (!confirm('Delete this task?')) return;
  tasks = tasks.filter(task => task.id !== id);
  SS('sp_tasks', tasks);
  syncTasks();
  renderTodo();
  renderCal();
  renderProgress();
  renderPomoSel();
}
function clearDone() {
  if (!confirm('Clear all completed tasks?')) return;
  tasks = tasks.filter(task => !task.done);
  SS('sp_tasks', tasks);
  syncTasks();
  renderTodo();
  renderCal();
  renderProgress();
}
function openTaskEdit(id) {
  const task = tasks.find(item => item.id === id);
  if (!task) return;
  document.getElementById('edit-task-id').value = task.id;
  document.getElementById('edit-task-title').value = task.title;
  document.getElementById('edit-task-cat').value = task.cat;
  document.getElementById('edit-task-pri').value = task.pri;
  document.getElementById('edit-task-due').value = task.due;
  document.getElementById('edit-task-repeat').value = task.repeat;
  openDialog('task-modal');
}
function closeTaskModal() {
  closeDialog('task-modal');
}
function saveTaskEdit() {
  const id = document.getElementById('edit-task-id').value;
  const task = tasks.find(item => item.id === id);
  if (!task) return;
  const title = document.getElementById('edit-task-title').value.trim();
  if (!title) {
    alert('Task title cannot be empty.');
    return;
  }
  Object.assign(task, normalizeTask({
    ...task,
    title,
    cat: document.getElementById('edit-task-cat').value,
    pri: document.getElementById('edit-task-pri').value,
    due: document.getElementById('edit-task-due').value,
    repeat: document.getElementById('edit-task-repeat').value
  }));
  SS('sp_tasks', tasks);
  syncTasks();
  closeTaskModal();
  renderTodo();
  renderCal();
  renderProgress();
  renderPomoSel();
}
function deleteTaskFromEdit() {
  const id = document.getElementById('edit-task-id').value;
  closeTaskModal();
  delTask(id);
}
function sortTasks(list) {
  return [...list].sort((a, b) => {
    if (taskSort === 'priority') return priRank[a.pri] - priRank[b.pri] || (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99');
    if (taskSort === 'created') return b.created - a.created;
    if (taskSort === 'title') return a.title.localeCompare(b.title);
    return (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99') || priRank[a.pri] - priRank[b.pri];
  });
}
function taskMatchesFilter(task) {
  if (taskSearch && !task.title.toLowerCase().includes(taskSearch)) return false;
  if (curFilter === 'all') return true;
  if (CATEGORIES.includes(curFilter)) return task.cat === curFilter;
  if (PRIORITIES.includes(curFilter)) return task.pri === curFilter;
  return true;
}
function renderTodo() {
  const today = todayISO();
  const filtered = tasks.filter(taskMatchesFilter);
  const active = sortTasks(filtered.filter(task => !task.done));
  const done = sortTasks(filtered.filter(task => task.done));
  const itemHTML = task => {
    const isOverdue = !task.done && task.due && task.due < today;
    const repeatBadge = task.repeat !== 'none' ? `<span class="badge badge-low"><i class="fa-solid fa-repeat" aria-hidden="true"></i> ${REPEAT_LABELS[task.repeat]}</span>` : '';
    return `<div class="todo-item pri-${task.pri} ${task.done ? 'done' : ''}">
      <input type="checkbox" class="todo-check" ${task.done ? 'checked' : ''} onchange="toggleTask(${safeJs(task.id)})" aria-label="Mark ${escapeHTML(task.title)} ${task.done ? 'not done' : 'done'}">
      <div class="todo-body">
        <div class="todo-title">${escapeHTML(task.title)}</div>
        <div class="todo-meta">
          <span class="badge badge-${task.cat}">${catLbl[task.cat]}</span>
          <span class="badge badge-${task.pri}">${priLbl[task.pri]}</span>
          ${repeatBadge}
          ${task.due ? `<span class="todo-due ${isOverdue ? 'overdue' : ''}"><i class="fa-regular fa-calendar"></i> ${escapeHTML(formatDateLabel(task.due))}${isOverdue ? ' - Overdue' : ''}</span>` : ''}
        </div>
      </div>
      <div class="todo-actions">
        <button class="btn btn-ghost btn-sm" onclick="openTaskEdit(${safeJs(task.id)})" title="Edit" aria-label="Edit task"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="delTask(${safeJs(task.id)})" title="Delete" aria-label="Delete task"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>`;
  };
  document.getElementById('todo-active').innerHTML = active.length
    ? active.map(itemHTML).join('')
    : '<div class="empty-state"><i class="fa-solid fa-check-double"></i><p>All caught up! Add a task above.</p></div>';
  document.getElementById('todo-done').innerHTML = done.map(itemHTML).join('');
  document.getElementById('done-section').style.display = done.length ? '' : 'none';
}

// -- POMODORO --------------------------------------------------------------
const TIMES = {work: 25 * 60, short: 5 * 60, long: 15 * 60};
const MLBL = {work: 'Focus Time', short: 'Short Break', long: 'Long Break'};
const CIRC = 2 * Math.PI * 82;
let pMode = 'work';
let pSec = TIMES.work;
let pRunning = false;
let pTimer = null;
let pCycle = 0;

function setMode(mode) {
  if (pRunning) clearInterval(pTimer);
  pRunning = false;
  pMode = mode;
  pSec = TIMES[mode];
  ['work', 'short', 'long'].forEach(item => document.getElementById(`mb-${item}`).classList.toggle('active', item === mode));
  document.getElementById('btn-start').innerHTML = '<i class="fa-solid fa-play"></i> Start';
  updPomo();
}
function updPomo() {
  const minutes = Math.floor(pSec / 60);
  const seconds = pSec % 60;
  document.getElementById('pomo-display').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  document.getElementById('pomo-sublabel').textContent = MLBL[pMode];
  const pct = pSec / TIMES[pMode];
  document.getElementById('ring-fg').style.strokeDashoffset = CIRC * (1 - pct);
  let dots = '';
  for (let i = 0; i < 4; i++) dots += `<div class="pdot ${i < pCycle ? 'filled' : ''}"></div>`;
  document.getElementById('pomo-dots').innerHTML = dots;
  document.getElementById('s-cycle').textContent = `${pCycle} / 4`;
}
function togglePomo() {
  if (pRunning) {
    clearInterval(pTimer);
    pRunning = false;
    document.getElementById('btn-start').innerHTML = '<i class="fa-solid fa-play"></i> Resume';
    return;
  }
  pRunning = true;
  document.getElementById('btn-start').innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
  pTimer = setInterval(() => {
    pSec--;
    updPomo();
    if (pSec <= 0) {
      clearInterval(pTimer);
      pRunning = false;
      pomoDone();
    }
  }, 1000);
}
function resetPomo() {
  clearInterval(pTimer);
  pRunning = false;
  pSec = TIMES[pMode];
  document.getElementById('btn-start').innerHTML = '<i class="fa-solid fa-play"></i> Start';
  updPomo();
}
function pomoDone() {
  beep();
  if (pMode === 'work') {
    pCycle++;
    pd.count++;
    const wk = weekKey();
    pd.wk[wk] = (pd.wk[wk] || 0) + 1;
    const selectedTask = document.getElementById('pomo-sel').value;
    const taskName = selectedTask ? (tasks.find(task => task.id === selectedTask) || {}).title || 'Session' : 'Free session';
    pd.log.unshift({ts: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}), task: taskName});
    if (pd.log.length > 50) pd.log.pop();
    SS('sp_pd', pd);
    syncPd();
    updatePomoStats();
    renderLog();
    touchStreak();
    if (pCycle >= 4) {
      pCycle = 0;
      announce('Pomodoro complete', 'Four sessions complete. Take a long break.');
      setMode('long');
    } else {
      announce('Pomodoro complete', 'Focus session done. Short break time.');
      setMode('short');
    }
  } else {
    announce('Break over', 'Back to focus.');
    setMode('work');
  }
}
function beep() {
  try {
    const audio = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.type = 'sine';
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.5, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.8);
    oscillator.start(audio.currentTime);
    oscillator.stop(audio.currentTime + 0.8);
  } catch (err) {}
}
function updatePomoStats() {
  document.getElementById('s-count').textContent = pd.count;
  document.getElementById('s-focus').textContent = `${pd.count * 25} min`;
}
function renderLog() {
  const el = document.getElementById('pomo-log');
  el.innerHTML = pd.log.length
    ? pd.log.slice(0, 12).map(item => `<div class="log-item"><i class="fa-solid fa-circle-check" style="color:var(--personal);font-size:.75rem"></i>${escapeHTML(item.ts)} - ${escapeHTML(item.task)}</div>`).join('')
    : '<div class="empty-state" style="padding:16px"><i class="fa-regular fa-clock"></i><p>No sessions yet today</p></div>';
}
function renderPomoSel() {
  const select = document.getElementById('pomo-sel');
  select.innerHTML = '<option value="">Working on...</option>' + tasks
    .filter(task => !task.done)
    .map(task => `<option value="${escapeHTML(task.id)}">${escapeHTML(task.title)}</option>`)
    .join('');
}
function weekKey() {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(new Date().setDate(diff)).toDateString();
}

// -- PROGRESS AND STREAK ---------------------------------------------------
function renderProgress() {
  const total = tasks.length;
  const done = tasks.filter(task => task.done).length;
  document.getElementById('prog-done').textContent = done;
  document.getElementById('prog-sub').textContent = `of ${total} total`;
  document.getElementById('prog-bar-overall').style.width = total ? `${(done / total) * 100}%` : '0%';

  CATEGORIES.forEach(cat => {
    const catTotal = tasks.filter(task => task.cat === cat).length;
    const catDone = tasks.filter(task => task.cat === cat && task.done).length;
    const pct = catTotal ? Math.round((catDone / catTotal) * 100) : 0;
    document.getElementById(`${cat}-txt`).textContent = `${catDone}/${catTotal}`;
    document.getElementById(`${cat}-pct`).textContent = catTotal ? `${pct}%` : '-';
    document.getElementById(`${cat}-bar`).style.width = catTotal ? `${pct}%` : '0%';
  });

  document.getElementById('streak-n').textContent = streak.days;
  document.getElementById('p-today').textContent = pd.count;
  const weekTotal = Object.entries(pd.wk).reduce((sum, [key, value]) => {
    try {
      const date = new Date(key);
      return Date.now() - date < 7 * 864e5 ? sum + Number(value || 0) : sum;
    } catch (err) {
      return sum;
    }
  }, 0);
  document.getElementById('p-week-sub').textContent = `${weekTotal} this week`;

  const recent = tasks.filter(task => task.done && task.completedAt).sort((a, b) => b.completedAt - a.completedAt).slice(0, 10);
  document.getElementById('recent-done').innerHTML = recent.length
    ? recent.map(task => `<div class="recent-item">
        <i class="fa-solid fa-circle-check" style="color:var(--personal);font-size:.82rem;flex-shrink:0"></i>
        <span class="badge badge-${task.cat}">${catLbl[task.cat]}</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(task.title)}</span>
      </div>`).join('')
    : '<div class="empty-state"><i class="fa-solid fa-hourglass-start"></i><p>Complete tasks to see them here</p></div>';
}
function touchStreak() {
  const today = new Date().toDateString();
  if (streak.last === today) return;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  streak.days = streak.last === yesterday.toDateString() ? streak.days + 1 : 1;
  streak.last = today;
  SS('sp_streak', streak);
  syncStreak();
  const streakEl = document.getElementById('streak-n');
  if (streakEl) streakEl.textContent = streak.days;
}

// -- INIT ------------------------------------------------------------------
renderAll();
updPomo();
document.getElementById('ev-modal').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeModal();
});
document.getElementById('cfg-modal').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeCfg();
});
document.getElementById('task-modal').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeTaskModal();
});
setInterval(checkUpcomingEvents, 60000);
checkUpcomingEvents();
initSync();
