const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const config = window.SAKAI_CONFIG || {};

let authSession = null;
let currentProfile = null;
let parentChildren = [];
let selectedChildIds = new Set();
let pendingLineIdToken = null;
let currentTab = "today";
let calendarCursor = new Date();
let selectedMakeupDate = dateIso(7);
let makeupSlots = [];
let teacherCurrentRows = [];

function localIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateIso(offset = 0) { const date = new Date(); date.setDate(date.getDate() + offset); return localIso(date); }
function formatDate(value) { if (!value) return "未定"; const date = new Date(`${value}T00:00:00`); return `${date.getMonth() + 1}月${date.getDate()}日（${"日月火水木金土"[date.getDay()]}）`; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function isSupabaseConfigured() { return Boolean(config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.includes("YOUR_") && !config.supabaseAnonKey.includes("YOUR_")); }
function isLiffConfigured() { return Boolean(config.liffId && config.lineAuthEndpoint && config.absenceSubmitEndpoint && !config.liffId.includes("YOUR_") && !config.lineAuthEndpoint.includes("YOUR_") && !config.absenceSubmitEndpoint.includes("YOUR_")); }

function ensureSecureTransport() {
  const local = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  if (!local && location.protocol !== "https:") {
    document.body.innerHTML = '<main class="security-block"><h1>安全な接続が必要です</h1><p>このサービスはHTTPS接続でのみ利用できます。</p></main>';
    throw new Error("HTTPS is required");
  }
}

function apiHeaders(token = authSession?.access_token, extra = {}) {
  return { apikey: config.supabaseAnonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

async function api(path, options = {}) {
  if (!isSupabaseConfigured()) throw new Error("Supabase接続が未設定です。管理者へご連絡ください。");
  const response = await fetch(`${config.supabaseUrl}${path}`, { ...options, headers: apiHeaders(options.token, options.headers) });
  if (response.status === 401 && authSession?.refresh_token && !options.noRefresh) {
    await refreshSession();
    return api(path, { ...options, token: authSession.access_token, noRefresh: true });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error_description || body.hint || "処理に失敗しました");
  }
  if (response.status === 204) return null;
  return response.json();
}

function saveSession(session) {
  authSession = {
    access_token: session.access_token, refresh_token: session.refresh_token,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600),
    user: { id: session.user.id, email: session.user.email }
  };
}
function clearSession() {
  authSession = null; currentProfile = null; parentChildren = []; selectedChildIds = new Set();
  pendingLineIdToken = null;
  $("#studentChoices").replaceChildren();
  $("#parentLogoutButton").hidden = true;
}
async function signIn(email, password) {
  const session = await api("/auth/v1/token?grant_type=password", {
    method: "POST", token: null, noRefresh: true, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  saveSession(session);
}
async function refreshSession() {
  if (!authSession?.refresh_token) throw new Error("再ログインが必要です");
  const session = await api("/auth/v1/token?grant_type=refresh_token", {
    method: "POST", token: null, noRefresh: true, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: authSession.refresh_token })
  });
  saveSession(session);
}
async function signOut() {
  if (authSession?.access_token && isSupabaseConfigured()) await api("/auth/v1/logout", { method: "POST", noRefresh: true }).catch(() => {});
  clearSession();
  if (window.liff?.isLoggedIn()) window.liff.logout();
}
async function loadOwnProfile() {
  const rows = await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(authSession.user.id)}&select=role,display_name`);
  if (rows.length !== 1) throw new Error("利用権限が登録されていません");
  currentProfile = rows[0];
}
async function loadOwnChildren() {
  // RLSにより本人の子どものID・氏名以外はDBから返らない。
  parentChildren = await api("/rest/v1/students?select=id,name&order=id.asc");
}
async function submitAbsences(items) {
  if (!config.absenceSubmitEndpoint || config.absenceSubmitEndpoint.includes("YOUR_")) {
    throw new Error("欠席・振替受付APIが未設定です");
  }
  const idToken = window.liff?.isLoggedIn() ? window.liff.getIDToken() : pendingLineIdToken;
  if (!idToken) throw new Error("LINE本人確認の有効期限が切れました。もう一度ログインしてください");
  const response = await fetch(config.absenceSubmitEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, items })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "申請処理に失敗しました");
  return payload;
}

function showView(id) {
  if (id === "parentView" && (!authSession || currentProfile?.role !== "guardian")) id = "parentLoginView";
  if (id === "teacherView" && !["teacher", "admin"].includes(currentProfile?.role)) id = "loginView";
  $$(".view").forEach(view => view.classList.toggle("active", view.id === id));
  scrollTo({ top: 0, behavior: "smooth" });
}
function setConnectionNotice() {
  const configured = isSupabaseConfigured() && isLiffConfigured();
  const message = configured ? "🔒 LINE認証・Supabase RLSで保護されています" : "⚠ LIFFまたはSupabaseの本番設定が未完了です";
  $$(".connection-notice").forEach(node => { node.textContent = message; node.classList.toggle("warning", !configured); });
}
function renderStudents() {
  $("#studentChoiceHelp").textContent = parentChildren.length > 1
    ? "兄弟は1人ずつ入力して追加できます"
    : "LINE連携済みのお子さまと照合します";
  const selected = parentChildren.filter(student => selectedChildIds.has(student.id));
  $("#studentChoices").innerHTML = selected.length
    ? selected.map(student => `<div class="verified-student">
        <span>✓</span><b>${escapeHtml(student.name)}</b>
        <button type="button" data-remove-student="${student.id}">取消</button>
      </div>`).join("")
    : '<div class="verified-empty">確認済みの生徒はまだありません</div>';
  $$("[data-remove-student]").forEach(button => button.addEventListener("click", () => {
    selectedChildIds.delete(Number(button.dataset.removeStudent));
    renderStudents();
  }));
  $("#parentFamilyLabel").textContent = `${currentProfile.display_name || "保護者さま"}専用`;
}
function normalizeStudentName(value) {
  return String(value || "").normalize("NFKC").replace(/[\s　]+/g, "").toLocaleLowerCase("ja-JP");
}
function verifyStudentName() {
  const input = $("#studentNameInput");
  const normalized = normalizeStudentName(input.value);
  $("#studentMatchError").textContent = "";
  if (!normalized) {
    $("#studentMatchError").textContent = "生徒名を入力してください";
    return;
  }
  const match = parentChildren.find(student => normalizeStudentName(student.name) === normalized);
  if (!match) {
    $("#studentMatchError").textContent = "登録されているお子さまと一致しません";
    return;
  }
  selectedChildIds.add(match.id);
  input.value = "";
  renderStudents();
}
function selectedStudents() {
  return parentChildren.filter(student => selectedChildIds.has(student.id));
}
async function exchangeLineIdentity(idToken, linkCode = null) {
  const endpoint = linkCode ? config.lineLinkEndpoint : config.lineAuthEndpoint;
  if (!endpoint || endpoint.includes("YOUR_")) throw new Error("LINE認証APIが未設定です");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, linkCode })
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 409 && payload.code === "LINK_REQUIRED") return { linkRequired: true };
  if (!response.ok) throw new Error(payload.message || "LINE本人確認に失敗しました");
  saveSession(payload.session);
  await loadOwnProfile();
  if (currentProfile.role !== "guardian") throw new Error("保護者アカウントではありません");
  await loadOwnChildren();
  selectedChildIds = new Set();
  renderStudents();
  await loadMakeupSlots();
  $("#parentLogoutButton").hidden = false;
  showView("parentView");
  return { linkRequired: false };
}

async function initializeLiff({ autoExchange = true } = {}) {
  if (!isLiffConfigured() || !window.liff) return false;
  await window.liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: false });
  if (!window.liff.isLoggedIn()) return false;
  pendingLineIdToken = window.liff.getIDToken();
  if (!pendingLineIdToken) throw new Error("LINEの本人確認情報を取得できませんでした");
  if (autoExchange) {
    const result = await exchangeLineIdentity(pendingLineIdToken);
    if (result.linkRequired) showView("linkView");
  }
  return true;
}
function renderCalendar() {
  const year = calendarCursor.getFullYear(), month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay(), lastDate = new Date(year, month + 1, 0).getDate(), today = localIso(new Date());
  const room = $("#makeupClassroom").value;
  $("#calendarTitle").textContent = `${year}年 ${month + 1}月`;
  let html = Array(firstDay).fill('<button class="day blank" type="button" disabled></button>').join("");
  for (let day = 1; day <= lastDate; day++) {
    const value = localIso(new Date(year, month, day)), past = value < today;
    const daySlots = makeupSlots.filter(slot => slot.lesson_date === value && slot.classroom === room);
    const hasSpace = daySlots.some(slot => !slot.is_full);
    const full = daySlots.length > 0 && !hasSpace;
    const disabled = past || !hasSpace;
    html += `<button class="day ${hasSpace ? "available" : ""} ${full ? "full" : ""} ${value === selectedMakeupDate ? "selected" : ""}" type="button" data-date="${value}" ${disabled ? "disabled" : ""} aria-label="${day}日${full ? " 満員" : hasSpace ? " 空きあり" : " 授業なし"}">${day}${full ? '<small>満</small>' : hasSpace ? '<small>空</small>' : ""}</button>`;
  }
  $("#calendarDays").innerHTML = html;
  $$("#calendarDays [data-date]").forEach(button => button.addEventListener("click", () => {
    selectedMakeupDate = button.dataset.date; $("#makeupDate").value = selectedMakeupDate; renderCalendar(); renderMakeupSlotOptions();
  }));
  renderMakeupSlotOptions();
}

async function loadMakeupSlots() {
  const from = dateIso();
  const to = dateIso(93);
  makeupSlots = await api("/rest/v1/rpc/available_makeup_slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_from: from, p_to: to, p_classroom: null })
  });
  chooseFirstAvailableSlot();
  renderCalendar();
}
function chooseFirstAvailableSlot() {
  const room = $("#makeupClassroom").value;
  const available = makeupSlots.find(slot => slot.classroom === room && !slot.is_full && slot.lesson_date >= dateIso());
  if (available && !makeupSlots.some(slot => slot.lesson_date === selectedMakeupDate && slot.classroom === room && !slot.is_full)) {
    selectedMakeupDate = available.lesson_date;
    $("#makeupDate").value = selectedMakeupDate;
    calendarCursor = new Date(`${selectedMakeupDate}T00:00:00`);
  }
}
function renderMakeupSlotOptions() {
  const room = $("#makeupClassroom").value;
  const slots = makeupSlots.filter(slot => slot.lesson_date === selectedMakeupDate && slot.classroom === room);
  $("#makeupSlot").innerHTML = slots.length
    ? slots.map(slot => `<option value="${slot.id}" ${slot.is_full ? "disabled" : ""}>${escapeHtml(slot.start_time)}〜　予約${slot.reserved_count}/${slot.capacity}名　${slot.is_full ? "満員" : `残り${slot.remaining_count}名`}</option>`).join("")
    : '<option value="">この日の授業枠はありません</option>';
  const selectable = slots.find(slot => !slot.is_full);
  $("#makeupSlot").value = selectable ? String(selectable.id) : "";
  $("#slotAvailability").textContent = selectable
    ? `${formatDate(selectedMakeupDate)} ${selectable.start_time}〜　残り${selectable.remaining_count}名`
    : "選択できる空き枠がありません";
  $("#slotAvailability").classList.toggle("full", !selectable);
}

function buildRecordQuery(tab = currentTab) {
  const params = new URLSearchParams();
  params.set("select", "id,receipt_number,student_id,absence_date,reason,wants_makeup,makeup_date,makeup_classroom,makeup_slot,status,created_at,students!inner(name,classroom)");
  params.set("order", "created_at.desc"); params.set("limit", "200");
  const room = $("#classroomFilter").value, date = $("#dateFilter").value, search = $("#studentSearch").value.trim();
  if (tab === "today") params.set("absence_date", `eq.${dateIso()}`);
  if (tab === "todayMakeups") { params.set("makeup_date", `eq.${dateIso()}`); params.set("status", "eq.reserved"); }
  if (tab === "pending") params.set("status", "eq.pending");
  if (room !== "all") params.set("students.classroom", `eq.${room}`);
  if (search) params.set("students.name", `ilike.*${search.replaceAll("*", "")}*`);
  if (date) params.set("or", `(absence_date.eq.${date},makeup_date.eq.${date})`);
  return `/rest/v1/absence_records?${params}`;
}
async function loadTeacherRecords(tab = currentTab) { return api(buildRecordQuery(tab)); }
async function loadDashboardCounts() {
  return api("/rest/v1/rpc/teacher_dashboard_counts", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_classroom: $("#classroomFilter").value === "all" ? null : $("#classroomFilter").value,
      p_date: $("#dateFilter").value || null, p_search: $("#studentSearch").value.trim() || null
    })
  });
}
async function loadAuditLogs() {
  return api("/rest/v1/audit_logs?select=id,actor_id,actor_role,action,table_name,student_id,ip_address,request_id,changed_at&order=changed_at.desc&limit=100");
}
async function renderAdmin() {
  if (!["teacher", "admin"].includes(currentProfile?.role)) return showView("loginView");
  $("#adminContent").innerHTML = '<div class="empty">安全に読み込んでいます…</div>';
  try {
    if (currentTab === "audit") { renderAuditList(await loadAuditLogs()); return; }
    if (currentTab === "slots") { await renderClassSlots(); return; }
    const [records, counts] = await Promise.all([loadTeacherRecords(), loadDashboardCounts()]);
    teacherCurrentRows = records;
    $("#stats").innerHTML = `<div class="stat green"><span>今日の欠席</span><b>${Number(counts.today_absences || 0)}名</b></div>
      <div class="stat green"><span>今日の振替</span><b>${Number(counts.today_makeups || 0)}名</b></div>
      <div class="stat orange"><span>未振替</span><b>${Number(counts.pending_makeups || 0)}名</b></div>
      <div class="stat red"><span>表示中</span><b>${records.length}件</b></div>`;
    renderRecordList({ today: "今日の欠席一覧", todayMakeups: "今日の振替一覧", pending: "振替日が未定の生徒", all: "条件に一致する連絡" }[currentTab], records);
  } catch (error) { $("#adminContent").innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
}
function renderRecordList(title, rows) {
  $("#adminContent").innerHTML = `<div class="list-title"><h2>${escapeHtml(title)}</h2><div class="list-actions"><button class="csv-button" id="exportCurrentCsv" type="button">CSV出力</button><span class="badge">${rows.length}件</span></div></div>
    ${rows.length ? rows.map(row => {
      const student = row.students || {};
      const status = row.status === "reserved" ? `<span class="tag green">振替 ${formatDate(row.makeup_date)} ${escapeHtml(row.makeup_slot)}〜</span>`
        : row.status === "pending" ? '<span class="tag orange">振替日未定</span>' : '<span class="tag">振替なし</span>';
      return `<div class="record"><div class="person"><span class="avatar-sm">${escapeHtml(student.name?.slice(0, 1))}</span><div><b>${escapeHtml(student.name)}</b><div class="sub">${escapeHtml(student.classroom)}／受付 ${escapeHtml(row.receipt_number || "-")}</div></div></div>
        <div><span class="tag">${formatDate(row.absence_date)} 欠席</span></div><p>${escapeHtml(row.reason)}<br>${status}</p>
        ${row.status === "pending" ? '<span class="tag orange">空き枠を確認して設定</span>' : '<span class="tag">確認済み</span>'}</div>`;
    }).join("") : '<div class="empty">該当する連絡はありません</div>'}`;
  $("#exportCurrentCsv").addEventListener("click", () => exportRowsCsv(rows, csvNameForTab(currentTab)));
}
async function loadClassSlots() {
  const start = $("#dateFilter").value || dateIso();
  return api("/rest/v1/rpc/teacher_class_slot_status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_from: start,
      p_to: dateIsoFrom(start, 30),
      p_classroom: $("#classroomFilter").value === "all" ? null : $("#classroomFilter").value
    })
  });
}
function dateIsoFrom(value, offset) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return localIso(date);
}
async function renderClassSlots() {
  $("#stats").innerHTML = "";
  const rows = await loadClassSlots();
  const adminForm = currentProfile.role === "admin" ? `<form id="slotForm" class="slot-form">
    <label>授業日<input id="slotDate" type="date" min="${dateIso()}" value="${$("#dateFilter").value || dateIso(7)}" required></label>
    <label>教室<select id="slotClassroom"><option>福沼教室</option><option>穂波教室</option></select></label>
    <label>開始時間<input id="slotTime" type="time" value="16:00" required></label>
    <label>定員<input id="slotCapacity" type="number" min="1" max="100" value="8" required></label>
    <button class="primary-button" type="submit">授業枠を追加・更新</button>
  </form>` : '<p class="privacy-note compact">定員の変更は管理者だけが行えます。</p>';
  $("#adminContent").innerHTML = `<div class="list-title"><h2>授業枠ごとの予約人数</h2><span class="badge">${rows.length}枠</span></div>
    ${adminForm}
    <div class="slot-list">${rows.length ? rows.map(row => `<div class="slot-row ${Number(row.remaining_count) === 0 ? "is-full" : ""}">
      <div><b>${formatDate(row.lesson_date)} ${escapeHtml(row.start_time)}〜</b><span>${escapeHtml(row.classroom)}</span></div>
      <div class="slot-meter"><b>予約 ${row.reserved_count}/${row.capacity}名</b><span>${Number(row.remaining_count) === 0 ? "満員" : `残り${row.remaining_count}名`}</span></div>
      ${currentProfile.role === "admin" ? `<button class="small-button" data-edit-slot="${row.id}" data-date="${row.lesson_date}" data-room="${escapeHtml(row.classroom)}" data-time="${row.start_time}" data-capacity="${row.capacity}" type="button">定員変更</button>` : ""}
    </div>`).join("") : '<div class="empty">対象期間の授業枠はありません</div>'}</div>`;
  $("#slotForm")?.addEventListener("submit", saveSlotForm);
  $$("[data-edit-slot]").forEach(button => button.addEventListener("click", () => {
    $("#slotDate").value = button.dataset.date;
    $("#slotClassroom").value = button.dataset.room;
    $("#slotTime").value = button.dataset.time;
    $("#slotCapacity").value = button.dataset.capacity;
    $("#slotCapacity").focus();
  }));
}
async function saveSlotForm(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    await api("/rest/v1/rpc/admin_upsert_class_slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_lesson_date: $("#slotDate").value,
        p_classroom: $("#slotClassroom").value,
        p_start_time: $("#slotTime").value,
        p_capacity: Number($("#slotCapacity").value),
        p_is_active: true
      })
    });
    toast("授業枠を保存しました");
    await renderClassSlots();
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
}
function csvNameForTab(tab) {
  return ({ today: "欠席一覧.csv", todayMakeups: "振替一覧.csv", pending: "未振替一覧.csv", all: "全連絡一覧.csv" })[tab] || "一覧.csv";
}
function csvCell(value) {
  let text = String(value ?? "").replaceAll("\r", " ").replaceAll("\n", " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function exportRowsCsv(rows, filename) {
  if (!["teacher", "admin"].includes(currentProfile?.role)) return;
  const header = ["受付番号", "生徒名", "教室", "欠席日", "理由", "振替日", "振替教室", "振替時間", "状態", "受付日時"];
  const body = rows.map(row => [
    row.receipt_number, row.students?.name, row.students?.classroom, row.absence_date, row.reason,
    row.makeup_date, row.makeup_classroom, row.makeup_slot, row.status,
    new Date(row.created_at).toLocaleString("ja-JP")
  ]);
  const csv = "\uFEFF" + [header, ...body].map(line => line.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportNamedCsv(tab, filename) {
  try { exportRowsCsv(await loadTeacherRecords(tab), filename); }
  catch (error) { toast(error.message); }
}
function renderAuditList(rows) {
  $("#stats").innerHTML = "";
  $("#adminContent").innerHTML = `<div class="list-title"><h2>監査ログ</h2><span class="badge">${rows.length}件</span></div>
    ${rows.length ? rows.map(row => `<div class="audit-row"><b>${escapeHtml(row.action)}</b><span>${escapeHtml(row.table_name)}／生徒ID ${escapeHtml(row.student_id || "-")}</span><span>${escapeHtml(row.actor_role)}／${new Date(row.changed_at).toLocaleString("ja-JP")}<br>IP ${escapeHtml(row.ip_address || "-")}／Request ${escapeHtml(row.request_id || "-")}</span></div>`).join("") : '<div class="empty">監査ログはありません</div>'}`;
}
function toast(message) {
  const node = $("#toast"); node.textContent = message; node.classList.add("show");
  clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => node.classList.remove("show"), 2400);
}

$("#reason").addEventListener("change", event => { $("#otherReasonWrap").hidden = event.target.value !== "その他"; });
$$('input[name="makeup"]').forEach(input => input.addEventListener("change", event => { $("#makeupFields").hidden = event.target.value === "no"; }));
$("#prevMonth").addEventListener("click", () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); renderCalendar(); });
$("#nextMonth").addEventListener("click", () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); renderCalendar(); });
$("#makeupClassroom").addEventListener("change", () => { chooseFirstAvailableSlot(); renderCalendar(); });
$("#verifyStudentButton").addEventListener("click", verifyStudentName);
$("#studentNameInput").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    verifyStudentName();
  }
});

$("#lineLoginButton").addEventListener("click", async () => {
  $("#parentLoginError").textContent = "";
  try {
    if (!isLiffConfigured() || !window.liff) throw new Error("LIFF設定が未完了です");
    await window.liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: false });
    if (!window.liff.isLoggedIn()) {
      window.liff.login({ redirectUri: location.href });
      return;
    }
    pendingLineIdToken = window.liff.getIDToken();
    const result = await exchangeLineIdentity(pendingLineIdToken);
    if (result.linkRequired) showView("linkView");
  } catch (error) {
    clearSession();
    $("#parentLoginError").textContent = error.message;
  }
});

$("#linkForm").addEventListener("submit", async event => {
  event.preventDefault();
  $("#linkError").textContent = "";
  try {
    if (!pendingLineIdToken) {
      const loggedIn = await initializeLiff({ autoExchange: false });
      if (!loggedIn) throw new Error("もう一度LINEでログインしてください");
    }
    await exchangeLineIdentity(pendingLineIdToken, $("#linkCode").value.trim());
    $("#linkCode").value = "";
  } catch (error) {
    $("#linkError").textContent = error.message;
  }
});
$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault(); $("#loginError").textContent = "";
  try {
    await signIn($("#loginEmail").value.trim(), $("#loginPassword").value); await loadOwnProfile();
    if (!["teacher", "admin"].includes(currentProfile.role)) throw new Error("先生・管理者アカウントではありません");
    $("#todayLabel").textContent = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
    $("#syncStatus").textContent = `🔒 ${currentProfile.role === "admin" ? "管理者" : "先生"}権限／サーバー側RLS適用中`;
    showView("teacherView"); await renderAdmin();
  } catch (error) { clearSession(); $("#loginError").textContent = error.message; }
});
$("#absenceForm").addEventListener("submit", async event => {
  event.preventDefault();
  const chosen = selectedStudents(); if (!chosen.length) return toast("お子さまを選択してください");
  const wantsMakeup = $('input[name="makeup"]:checked').value === "yes";
  const reason = $("#reason").value + ($("#otherReason").value ? `（${$("#otherReason").value}）` : "");
  const slotId = Number($("#makeupSlot").value);
  if (wantsMakeup && (!Number.isSafeInteger(slotId) || slotId < 1)) return toast("空いている振替枠を選択してください");
  const rows = chosen.map(student => ({
    student_id: student.id, regular_weekday: $("#regularWeekday").value,
    absence_date: $("#absenceDate").value, reason, wants_makeup: wantsMakeup,
    makeup_slot_id: wantsMakeup ? slotId : null
  }));
  const button = event.submitter; button.disabled = true; button.textContent = "安全に送信しています…";
  try {
    const result = await submitAbsences(rows);
    const selectedSlot = makeupSlots.find(slot => Number(slot.id) === slotId);
    $("#completeMessage").textContent = `${chosen.map(student => student.name).join("・")}さんの連絡を受け付けました。`;
    $("#completeSummary").innerHTML = `<div class="summary-row"><span>通常曜日</span><b>${escapeHtml($("#regularWeekday").value)}</b></div>
      <div class="summary-row"><span>欠席日</span><b>${formatDate($("#absenceDate").value)}</b></div>
      <div class="summary-row"><span>理由</span><b>${escapeHtml(reason)}</b></div><div class="summary-row"><span>振替</span><b>${wantsMakeup ? `${formatDate(selectedSlot?.lesson_date)} ${escapeHtml(selectedSlot?.start_time)}〜` : "希望なし"}</b></div>
      <div class="summary-row"><span>受付番号</span><b>${escapeHtml(result.receipt_number)}</b></div>`;
    await loadMakeupSlots();
    showView("completeView");
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = "欠席・振替を連絡する"; }
});

$("#teacherLink").addEventListener("click", () => showView(["teacher", "admin"].includes(currentProfile?.role) ? "teacherView" : "loginView"));
$("#homeButton").addEventListener("click", () => showView(currentProfile?.role === "guardian" ? "parentView" : "parentLoginView"));
$("#backHome").addEventListener("click", () => showView("parentView"));
$("#sendAnother").addEventListener("click", () => showView("parentView"));
$("#parentLogoutButton").addEventListener("click", async () => { await signOut(); showView("parentLoginView"); });
$("#logoutButton").addEventListener("click", async () => { await signOut(); showView("parentLoginView"); });
$$(".admin-tab").forEach(button => button.addEventListener("click", async () => {
  $$(".admin-tab").forEach(tab => tab.classList.remove("active")); button.classList.add("active"); currentTab = button.dataset.tab; await renderAdmin();
}));
["classroomFilter", "dateFilter"].forEach(id => $(`#${id}`).addEventListener("change", renderAdmin));
let searchTimer;
$("#studentSearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderAdmin, 300); });
$("#clearFilters").addEventListener("click", () => { $("#classroomFilter").value = "all"; $("#dateFilter").value = ""; $("#studentSearch").value = ""; renderAdmin(); });
$("#exportAbsenceCsv").addEventListener("click", () => exportNamedCsv("today", "欠席一覧.csv"));
$("#exportMakeupCsv").addEventListener("click", () => exportNamedCsv("todayMakeups", "振替一覧.csv"));
$("#exportPendingCsv").addEventListener("click", () => exportNamedCsv("pending", "未振替一覧.csv"));

async function init() {
  ensureSecureTransport(); setConnectionNotice();
  $("#absenceDate").value = dateIso(); $("#absenceDate").min = dateIso(-30); $("#makeupDate").value = selectedMakeupDate;
  calendarCursor = new Date(`${selectedMakeupDate}T00:00:00`); renderCalendar();
  showView("parentLoginView");
  if (isLiffConfigured()) {
    try { await initializeLiff(); }
    catch (error) { clearSession(); $("#parentLoginError").textContent = error.message; }
  }
}
init();
