const state = { token: '', user: null, room: null, slug: '', mobileChatOpen: false };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const palette = ['#845af0','#df6b9f','#398f92','#bd713f','#526fb1','#8f4c78','#497f61'];
const tg = window.Telegram?.WebApp;

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('') || 'د';
}
function faNumber(value) { return Number(value).toLocaleString('fa-IR'); }
function colorFor(value = '') { return palette[[...value].reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length]; }
function timeLabel(date) { return new Date(`${date.replace(' ', 'T')}Z`).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; }
function openExternal(url) { if (!url) return; if (tg?.openLink) tg.openLink(url); else window.open(url, '_blank', 'noopener,noreferrer'); }

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) },
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* empty */ }
  if (!response.ok) throw new Error(payload.error || 'ارتباط با سرور برقرار نشد.');
  return payload;
}

function detectSlug() {
  const startParam = tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('tgWebAppStartParam');
  const match = location.pathname.match(/^\/r\/([^/]+)/);
  return startParam || (match ? decodeURIComponent(match[1]) : '') || localStorage.getItem('didar:last-room') || '';
}

async function boot() {
  try {
    tg?.ready(); tg?.expand(); tg?.setHeaderColor?.('#0d0b16'); tg?.setBackgroundColor?.('#0d0b16');
    const auth = await api('/api/auth', { method: 'POST', body: JSON.stringify({ initData: tg?.initData || '' }) });
    state.token = auth.token; state.user = auth.user; state.slug = detectSlug();
    if (!state.slug && auth.devMode) state.slug = 'shab-didar';
    $('#boot').classList.add('is-hidden'); $('#app').classList.remove('is-hidden');
    if (auth.devMode) showToast('نسخه پیش‌نمایش محلی فعال است');
    if (state.slug) await loadRoom(); else showWelcome();
  } catch (error) {
    $('#boot h1').textContent = 'ورود انجام نشد';
    $('#boot p').textContent = error.message;
    $('.loader').classList.add('is-hidden');
  }
}

async function loadRoom() {
  try {
    state.room = await api(`/api/rooms/${encodeURIComponent(state.slug)}`);
    localStorage.setItem('didar:last-room', state.slug);
    history.replaceState(null, '', `/r/${encodeURIComponent(state.slug)}`);
    $('#welcomeView').classList.add('is-hidden'); $('#roomView').classList.remove('is-hidden');
    renderRoom();
  } catch (error) {
    showWelcome(); showToast(error.message, true);
  }
}

function showWelcome() {
  $('#roomView').classList.add('is-hidden'); $('#welcomeView').classList.remove('is-hidden');
}

function renderRoom() {
  const room = state.room;
  $('#roomTitle').textContent = room.title;
  $('#roomDescription').textContent = room.description || 'فضایی برای آشنایی، گفت‌وگو و ساختن ارتباط‌های تازه';
  $('#membersCount').textContent = `${faNumber(room.members.length)} نفر حاضر`;
  const stack = $('#avatarsStack'); stack.replaceChildren();
  room.members.slice(0, 4).forEach((member) => stack.append(avatarNode(member, 'stack-avatar')));
  const grid = $('#membersGrid'); grid.replaceChildren();
  room.members.forEach((member) => grid.append(memberCard(member)));
  grid.append(addCard());
}

function avatarNode(member, className = 'avatar') {
  const node = el('span', className);
  node.style.setProperty('--avatar', colorFor(member.display_name));
  if (member.avatar_url) {
    const image = new Image(); image.alt = ''; image.referrerPolicy = 'no-referrer'; image.src = member.avatar_url;
    image.addEventListener('error', () => image.replaceWith(document.createTextNode(initials(member.display_name))));
    node.append(image);
  } else node.textContent = initials(member.display_name);
  return node;
}

function memberCard(member) {
  const mine = member.user_id === state.user.id;
  const card = el('article', `member-card${mine ? ' me' : ''}`);
  if (mine) card.append(el('span', 'me-badge', 'من'));
  const avatarButton = el('button', `avatar-wrap${member.story_url ? '' : ' no-story'}`);
  avatarButton.type = 'button'; avatarButton.title = member.story_url ? 'دیدن استوری' : 'باز کردن اینستاگرام';
  avatarButton.append(el('span', 'avatar-ring'), avatarNode(member));
  if (member.story_url) avatarButton.append(el('span', 'story-mark', '▶'));
  avatarButton.addEventListener('click', () => openExternal(member.story_url || member.instagram_url));
  card.append(avatarButton, el('h3', '', member.display_name), el('p', '', member.role_title || member.bio || 'عضو روم'));
  const actions = el('div', 'social-actions');
  if (member.instagram_url) actions.append(socialButton('◎', 'اینستاگرام', member.instagram_url));
  if (member.linkedin_url) actions.append(socialButton('in', 'لینکدین', member.linkedin_url));
  if (mine) {
    const edit = socialButton('✎', 'ویرایش پروفایل'); edit.addEventListener('click', () => openProfile(true)); actions.append(edit);
  }
  card.append(actions);
  return card;
}

function socialButton(label, title, url) {
  const button = el('button', '', label); button.type = 'button'; button.title = title;
  if (url) button.addEventListener('click', () => openExternal(url));
  return button;
}

function addCard() {
  const card = el('article', 'member-card add-card');
  const button = el('button', '', '+'); button.type = 'button'; button.setAttribute('aria-label', 'اضافه کردن خودم');
  button.addEventListener('click', () => openProfile(Boolean(state.room.me)));
  card.append(button, el('h3', '', state.room.me ? 'ویرایش پروفایل من' : 'من هم هستم'), el('p', '', state.room.me ? 'اطلاعاتت را به‌روز کن' : 'خودت را به جمع اضافه کن'));
  return card;
}

function openModal(id) { const modal = $(`#${id}`); modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { const modal = $(`#${id}`); modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }

function openProfile(edit = false) {
  if (!state.room) return;
  const member = state.room.me || {};
  const form = $('#profileForm');
  form.elements.displayName.value = member.display_name || `${state.user.firstName} ${state.user.lastName}`.trim();
  form.elements.roleTitle.value = member.role_title || '';
  form.elements.bio.value = member.bio || '';
  form.elements.avatarUrl.value = member.avatar_url || state.user.photoUrl || '';
  form.elements.instagramUrl.value = member.instagram_url || '';
  form.elements.storyUrl.value = member.story_url || '';
  form.elements.linkedinUrl.value = member.linkedin_url || '';
  $('#profileModalTitle').textContent = edit ? 'پروفایلت را به‌روز کن' : 'خودت را به جمع معرفی کن';
  $('#profileError').textContent = '';
  openModal('profileModal');
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget; const submit = $('button[type=submit]', form); submit.disabled = true;
  const values = Object.fromEntries(new FormData(form));
  try {
    await api(`/api/rooms/${encodeURIComponent(state.slug)}/me`, { method: 'PUT', body: JSON.stringify(values) });
    closeModal('profileModal'); await loadRoom(); showToast('پروفایلت به روم اضافه شد');
  } catch (error) { $('#profileError').textContent = error.message; }
  finally { submit.disabled = false; }
}

async function refreshRoomQuietly() {
  try { state.room = await api(`/api/rooms/${encodeURIComponent(state.slug)}`); renderRoom(); } catch { /* retry on next event */ }
}

async function createRoom(event) {
  event.preventDefault(); const form = event.currentTarget; const button = $('button[type=submit]', form); button.disabled = true;
  try {
    const room = await api('/api/rooms', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    state.slug = room.slug; closeModal('createModal'); form.reset(); await loadRoom(); openProfile(false); showToast('روم ساخته شد؛ حالا پروفایلت را اضافه کن');
  } catch (error) { $('#roomError').textContent = error.message; }
  finally { button.disabled = false; }
}

async function shareRoom() {
  if (!state.room) return;
  const data = { title: `دعوت به ${state.room.title}`, text: `به روم «${state.room.title}» در دیدار بیا`, url: state.room.inviteUrl };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(state.room.inviteUrl); showToast('لینک دعوت کپی شد'); }
  } catch (error) { if (error.name !== 'AbortError') showToast('کپی لینک انجام نشد', true); }
}

let toastTimer;
function showToast(message, error = false) {
  const toast = $('#toast'); $('p', toast).textContent = message; $('span', toast).textContent = error ? '!' : '✓';
  toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function openMobileChat(open) {
  state.mobileChatOpen = open; $('#chatPanel').classList.toggle('mobile-open', open);
  $('#peopleTab').classList.toggle('active', !open); $('#chatTab').classList.toggle('active', open);
  if (open) $('#unreadDot').classList.add('is-hidden');
}

$('#profileForm').addEventListener('submit', saveProfile);
$('#createRoomForm').addEventListener('submit', createRoom);
$('#shareButton').addEventListener('click', shareRoom);
$('#createRoomButton').addEventListener('click', () => openModal('createModal'));
$('#welcomeCreateButton').addEventListener('click', () => openModal('createModal'));
$('#profileTab').addEventListener('click', () => openProfile(Boolean(state.room?.me)));
$('#chatTab').addEventListener('click', () => openMobileChat(true));
$('#peopleTab').addEventListener('click', () => openMobileChat(false));
$('#closeChat').addEventListener('click', () => openMobileChat(false));
$$('[data-close]').forEach((node) => node.addEventListener('click', () => closeModal(node.dataset.close)));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') $$('.modal.is-open').forEach((node) => closeModal(node.id)); });

boot();
setInterval(() => { if (state.room && !$('.modal.is-open')) refreshRoomQuietly(); }, 20000);
