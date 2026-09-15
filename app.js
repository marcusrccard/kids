/* ============================================================================
   MISSÃO FAMÍLIA — app.js
   App único (HTML/CSS/JS puro) + Supabase. Funciona nos 2 modos de uso:
   - "dual": cada pessoa tem seu próprio aparelho
   - "single": um único aparelho é revezado entre responsável e criança
   ============================================================================ */

// ---------------------------------------------------------------------------
// CONFIGURAÇÃO SUPABASE
// ---------------------------------------------------------------------------
const SUPABASE_URL = 'https://mnkpfnofxbotmsmhcody.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qHVqodo_YM0jje44zbhhOw_6NmYu7zN';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// CONSTANTES DE JOGO
// ---------------------------------------------------------------------------
const LEVELS = [
  { level: 1, name: 'Início',        min: 0, mult: 1.00, emoji: '🌱' },
  { level: 2, name: 'Dedicado(a)',   min: 3, mult: 1.05, emoji: '🔥' },
  { level: 3, name: 'Lendário(a)',   min: 5, mult: 1.10, emoji: '⭐' },
];
const MAX_STREAK_FOR_BAR = 5;

const TASK_EMOJIS = ['🧹','🛏️','🍽️','🪥','🎒','📚','🐶','🧦','🚮','🧺','🌱','🧽','🛁','✏️','🧸','🥣','🚿','👕','🧴','🧻','🪮','🧃','📖','⏰'];
const REWARD_EMOJIS = ['🍦','🎮','🍕','🎬','🍬','🧁','⚽','🎨','📱','🚲','🧩','🎢','🍿','🛼','🎁','🧋','🕹️','🪁','🎪','🦄'];
const AVATAR_EMOJIS = ['🦊','🐼','🐯','🦁','🐨','🐸','🐵','🦄','🐰','🐱','🐶','🦖','🐙','🦋','🐧','🦉','🐢','🐳'];

// ---------------------------------------------------------------------------
// ESTADO LOCAL
// ---------------------------------------------------------------------------
const state = {
  deviceMode: localStorage.getItem('mf_device_mode') || null, // 'dual' | 'single'
  deviceRole: localStorage.getItem('mf_device_role') || null, // 'parent' | 'child' (só no modo dual)
  family: null,
  parentProfile: null,
  activeChildProfile: null,   // criança sendo visualizada agora
  children: [],               // todas as crianças da família (visão do responsável)
  pendingJoinFamily: null,    // família encontrada durante fluxo "entrar com código"
  parentTab: 'tasks',
  childTab: 'missions',
  selectedTaskChildId: null,  // filtro na aba Tarefas do responsável
  pinResolve: null,           // callback ativo do modal de PIN
  pinTarget: null,            // 'approval' | 'childlogin' | 'setpin'
  pinBuffer: '',
  taskEmojiSel: TASK_EMOJIS[0],
  rewardEmojiSel: REWARD_EMOJIS[0],
  childAvatarSel: AVATAR_EMOJIS[0],
  channel: null,
};

// ---------------------------------------------------------------------------
// HELPERS DE DOM
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function openSheet(id) { $(`#${id}`).classList.add('show'); }
function closeSheet(id) { $(`#${id}`).classList.remove('show'); }
function closeAllSheets() { $$('.overlay').forEach(o => o.classList.remove('show')); }

let toastTimer = null;
function toast(msg, emoji = '') {
  const t = $('#toast');
  t.innerHTML = `${emoji ? `<span style="font-size:18px">${emoji}</span>` : ''}<span>${msg}</span>`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function todayStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function isWeekday(d) { const wd = d.getDay(); return wd >= 1 && wd <= 5; }
function parseDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }

// conta quantos dias de semana (seg-sex) existem estritamente ENTRE duas datas
function missedWeekdaysBetween(lastValidStr, todayStr_) {
  if (!lastValidStr) return 0;
  const last = parseDate(lastValidStr);
  const today = parseDate(todayStr_);
  let count = 0;
  const cursor = new Date(last);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < today) {
    if (isWeekday(cursor)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function levelForStreak(count) {
  let lvl = LEVELS[0];
  for (const l of LEVELS) if (count >= l.min) lvl = l;
  return lvl;
}

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function uuid() { return crypto.randomUUID(); }

// ---------------------------------------------------------------------------
// SONS (Web Audio API — sem arquivos externos)
// ---------------------------------------------------------------------------
let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, start, dur, type = 'sine', gain = 0.18) {
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g); g.connect(c.destination);
    const t0 = c.currentTime + start;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  } catch (e) { /* áudio pode ser bloqueado antes da 1ª interação — ok ignorar */ }
}
const sfx = {
  tap: () => tone(520, 0, 0.08, 'triangle', 0.12),
  submit: () => { tone(440, 0, 0.09, 'sine'); tone(660, 0.08, 0.12, 'sine'); },
  approve: () => { tone(523, 0, 0.1); tone(659, 0.1, 0.1); tone(784, 0.2, 0.18); },
  reject: () => { tone(300, 0, 0.15, 'sawtooth', 0.1); tone(220, 0.12, 0.2, 'sawtooth', 0.1); },
  coin: () => { tone(988, 0, 0.06, 'square', 0.1); tone(1318, 0.05, 0.12, 'square', 0.1); },
  levelUp: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.16, 'triangle', 0.16)); },
  error: () => tone(200, 0, 0.2, 'sawtooth', 0.12),
};

// ---------------------------------------------------------------------------
// CONFETE (custom, sem lib externa)
// ---------------------------------------------------------------------------
function burstConfetti(count = 60) {
  const layer = $('#celebrate-layer');
  const colors = ['#7C5CFC', '#FF4FA3', '#FFC94D', '#2DE1C2'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    const size = 6 + Math.random() * 8;
    p.style.width = size + 'px';
    p.style.height = (size * 0.4 + 4) + 'px';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = Math.random() * 100 + 'vw';
    const duration = 2 + Math.random() * 1.6;
    const rotate = 360 * (2 + Math.random() * 3) * (Math.random() > 0.5 ? 1 : -1);
    const drift = (Math.random() - 0.5) * 200;
    p.animate([
      { transform: `translate(0,0) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${drift}px, 105vh) rotate(${rotate}deg)`, opacity: 1 },
    ], { duration: duration * 1000, easing: 'cubic-bezier(.25,.46,.45,.94)' });
    layer.appendChild(p);
    setTimeout(() => p.remove(), duration * 1000 + 100);
  }
}

function showLevelUpBanner(levelObj) {
  const b = $('#level-up-banner');
  $('#lu-title').textContent = `${levelObj.emoji} Subiu de nível!`;
  $('#lu-sub').textContent = `Agora você é ${levelObj.name} — pontos com bônus x${levelObj.mult.toFixed(2)}!`;
  b.classList.add('show');
  burstConfetti(90);
  sfx.levelUp();
  setTimeout(() => b.classList.remove('show'), 2800);
}

// ---------------------------------------------------------------------------
// PIN PAD genérico (usado em 3 telas/sheets diferentes)
// ---------------------------------------------------------------------------
function buildPinPad(padEl, onDigit) {
  padEl.innerHTML = '';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
  keys.forEach(k => {
    const b = document.createElement('button');
    b.className = 'pin-key';
    b.textContent = k;
    b.type = 'button';
    b.addEventListener('click', () => onDigit(k));
    padEl.appendChild(b);
  });
}
function renderPinDots(dotsEl, len, max = 4) {
  dotsEl.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const d = document.createElement('div');
    d.className = 'pin-dot' + (i < len ? ' filled' : '');
    dotsEl.appendChild(d);
  }
}

/** Abre o sheet de PIN pedindo a senha do responsável (approval_pin).
 *  onSuccess() é chamado quando o PIN digitado bate com o do responsável ativo. */
function requireApprovalPin(onSuccess, title = 'Senha do responsável') {
  const targetPin = state.parentProfile?.approval_pin;
  if (!targetPin) { onSuccess(); return; }
  state.pinBuffer = '';
  $('#pinsheet-title').textContent = title;
  $('#pinsheet-error').textContent = '';
  renderPinDots($('#pinsheet-dots'), 0);
  buildPinPad($('#pinsheet-pad'), (k) => handlePinKey(k, targetPin, onSuccess, 'pinsheet'));
  openSheet('overlay-pin');
}

function handlePinKey(k, targetPin, onSuccess, prefix) {
  const dotsEl = $(`#${prefix}-dots`);
  const errEl = $(`#${prefix}-error`);
  if (k === '⌫') { state.pinBuffer = state.pinBuffer.slice(0, -1); }
  else if (k === 'OK') { /* validado automaticamente ao completar 4 dígitos */ }
  else if (state.pinBuffer.length < 4) { state.pinBuffer += k; }
  renderPinDots(dotsEl, state.pinBuffer.length);
  if (state.pinBuffer.length === 4) {
    if (state.pinBuffer === targetPin) {
      errEl.textContent = '';
      const buf = state.pinBuffer;
      state.pinBuffer = '';
      setTimeout(() => { if (prefix === 'pinsheet') closeSheet('overlay-pin'); onSuccess(); }, 150);
    } else {
      errEl.textContent = 'Senha incorreta, tente de novo';
      sfx.error();
      setTimeout(() => { state.pinBuffer = ''; renderPinDots(dotsEl, 0); }, 400);
    }
  }
}

// ---------------------------------------------------------------------------
// PICKERS (emoji / avatar)
// ---------------------------------------------------------------------------
function buildPicker(el, list, selected, onPick, cls = 'emoji-opt') {
  el.innerHTML = '';
  list.forEach(e => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls + (e === selected ? ' selected' : '');
    b.textContent = e;
    b.addEventListener('click', () => { onPick(e); buildPicker(el, list, e, onPick, cls); });
    el.appendChild(b);
  });
}

// ---------------------------------------------------------------------------
// BOOT / ROTEAMENTO
// ---------------------------------------------------------------------------
async function init() {
  wireStaticEvents();

  if (!state.deviceMode) { showScreen('screen-mode'); return; }

  if (state.deviceMode === 'dual' && state.deviceRole === 'child') {
    const childId = localStorage.getItem('mf_child_profile_id');
    if (childId) {
      const { data } = await sb.from('profiles').select('*').eq('id', childId).maybeSingle();
      if (data) {
        state.activeChildProfile = data;
        const { data: fam } = await sb.from('families').select('*').eq('id', data.family_id).maybeSingle();
        state.family = fam;
        await enterChildDashboard();
        return;
      }
    }
    showScreen('screen-child-join');
    return;
  }

  // responsável (modo dual) OU modo único aparelho — sempre inicia autenticando o responsável
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await loadParentContext(session.user.id);
    showScreen('screen-parent-dash');
    await refreshParentDashboard();
    subscribeRealtime();
  } else {
    showScreen('screen-parent-auth');
  }
}

function wireStaticEvents() {
  // Tela 0: escolha de modo
  $$('#screen-mode .choice-card').forEach(c => c.addEventListener('click', () => {
    state.deviceMode = c.dataset.mode;
    localStorage.setItem('mf_device_mode', state.deviceMode);
    if (state.deviceMode === 'dual') showScreen('screen-role');
    else { state.deviceRole = 'parent'; showScreen('screen-parent-auth'); }
  }));

  // Tela 0b: escolha de papel (modo dual)
  $$('#screen-role .choice-card').forEach(c => c.addEventListener('click', () => {
    state.deviceRole = c.dataset.role;
    localStorage.setItem('mf_device_role', state.deviceRole);
    if (state.deviceRole === 'parent') showScreen('screen-parent-auth');
    else showScreen('screen-child-join');
  }));

  // Botões "voltar"
  $$('[data-back]').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.back)));
  $('#btn-back-from-auth').addEventListener('click', () => {
    if (state.deviceMode === 'dual') showScreen('screen-role'); else showScreen('screen-mode');
  });

  // Auth do responsável
  let authMode = 'signup';
  $('#btn-toggle-auth').addEventListener('click', () => {
    authMode = authMode === 'signup' ? 'signin' : 'signup';
    $('#auth-title').textContent = authMode === 'signup' ? 'Criar minha conta' : 'Entrar na minha conta';
    $('#btn-parent-auth-submit').textContent = authMode === 'signup' ? 'Criar conta e começar 🚀' : 'Entrar 🚀';
    $('#btn-toggle-auth').textContent = authMode === 'signup' ? 'Já tenho conta, entrar' : 'Criar uma conta nova';
    $('#field-parent-name').classList.toggle('hidden', authMode === 'signin');
  });

  $('#form-parent-auth').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#in-parent-email').value.trim();
    const pass = $('#in-parent-pass').value;
    const name = $('#in-parent-name').value.trim();
    const errEl = $('#err-parent-auth');
    errEl.textContent = '';
    if (!email || !pass || pass.length < 6) { errEl.textContent = 'Preencha e-mail e senha (mín. 6 caracteres)'; return; }
    if (authMode === 'signup' && !name) { errEl.textContent = 'Digite seu nome'; return; }
    $('#btn-parent-auth-submit').disabled = true;
    try {
      if (authMode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password: pass });
        if (error) throw error;
        let userId = data.user?.id;
        if (!userId) { // confirmação de e-mail pode estar ativada
          const { data: signInData, error: signInErr } = await sb.auth.signInWithPassword({ email, password: pass });
          if (signInErr) { toast('Confira seu e-mail para confirmar o cadastro', '📩'); showScreen('screen-mode'); return; }
          userId = signInData.user.id;
        }
        await createFamilyAndParent(userId, name);
        showScreen('screen-set-pin');
        setupSetPinScreen();
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        await loadParentContext(data.user.id);
        showScreen('screen-parent-dash');
        await refreshParentDashboard();
        subscribeRealtime();
      }
    } catch (err) {
      errEl.textContent = friendlyAuthError(err.message);
    } finally {
      $('#btn-parent-auth-submit').disabled = false;
    }
  });

  // Entrar com código (criança, modo dual)
  $('#btn-join-code').addEventListener('click', async () => {
    const code = $('#in-invite-code').value.trim().toUpperCase();
    const errEl = $('#err-join-code');
    errEl.textContent = '';
    if (code.length !== 6) { errEl.textContent = 'O código tem 6 letras/números'; return; }
    const { data: fam, error } = await sb.from('families').select('*').eq('invite_code', code).maybeSingle();
    if (error || !fam) { errEl.textContent = 'Código não encontrado. Confira com seu responsável.'; return; }
    state.pendingJoinFamily = fam;
    const { data: kids } = await sb.from('profiles').select('*').eq('family_id', fam.id).eq('role', 'child');
    renderChildPickList(kids || []);
    showScreen('screen-child-pick');
  });

  // Sheets: fechar clicando fora
  $$('.overlay').forEach(o => o.addEventListener('click', (e) => { if (e.target === o) closeAllSheets(); }));

  // Parent tabs
  $$('#parent-tabs .ptab').forEach(b => b.addEventListener('click', () => {
    state.parentTab = b.dataset.ptab;
    $$('#parent-tabs .ptab').forEach(x => x.classList.toggle('active', x === b));
    $$('.ptab-panel').forEach(p => p.classList.add('hidden'));
    $(`#ptab-${state.parentTab}`).classList.remove('hidden');
  }));

  // Child tabs
  $$('.tabbar .tab-btn').forEach(b => b.addEventListener('click', () => {
    state.childTab = b.dataset.ctab;
    $$('.tabbar .tab-btn').forEach(x => x.classList.toggle('active', x === b));
    $$('.ctab-panel').forEach(p => p.classList.add('hidden'));
    $(`#ctab-${state.childTab}`).classList.remove('hidden');
    sfx.tap();
  }));

  // Novo task sheet
  $('#btn-add-task').addEventListener('click', openTaskSheet);
  $('#btn-save-task').addEventListener('click', saveNewTask);
  buildPicker($('#task-emoji-picker'), TASK_EMOJIS, state.taskEmojiSel, (e) => state.taskEmojiSel = e);

  // Novo reward sheet
  $('#btn-add-reward').addEventListener('click', openRewardSheet);
  $('#btn-save-reward').addEventListener('click', saveNewReward);
  buildPicker($('#reward-emoji-picker'), REWARD_EMOJIS, state.rewardEmojiSel, (e) => state.rewardEmojiSel = e);

  // Add child sheet
  $('#btn-add-child').addEventListener('click', openChildSheet);
  $('#btn-save-child').addEventListener('click', saveNewChild);
  buildPicker($('#child-avatar-picker'), AVATAR_EMOJIS, state.childAvatarSel, (e) => state.childAvatarSel = e, 'avatar-opt');

  // Logout
  $('#btn-parent-logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    localStorage.removeItem('mf_device_role');
    location.reload();
  });

  // Modo criança <-> responsável (aparelho único) / sair (aparelho da criança)
  $('#btn-child-exit').addEventListener('click', onChildExitTapped);

  // Configurações (por enquanto: trocar de família / sair)
  $('#btn-open-settings').addEventListener('click', () => {
    if (confirm('Sair da conta do responsável neste aparelho?')) $('#btn-parent-logout').click();
  });

  // Redeem confirm sheet
  $('#btn-cancel-redeem').addEventListener('click', () => closeSheet('overlay-redeem'));
}

function friendlyAuthError(msg) {
  if (/already registered|already exists/i.test(msg)) return 'Este e-mail já tem conta. Tente entrar.';
  if (/invalid login/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/password/i.test(msg)) return 'Senha inválida (mínimo 6 caracteres).';
  return msg;
}

// ---------------------------------------------------------------------------
// CRIAÇÃO DE FAMÍLIA + PERFIL DO RESPONSÁVEL
// ---------------------------------------------------------------------------
async function createFamilyAndParent(authUserId, name) {
  const invite = randomCode(6);
  const { data: fam, error: famErr } = await sb.from('families').insert({ name: `Família de ${name}`, invite_code: invite }).select().single();
  if (famErr) throw famErr;
  const { data: profile, error: profErr } = await sb.from('profiles').insert({
    auth_user_id: authUserId, family_id: fam.id, role: 'parent', name, avatar: '🧑‍🦱',
  }).select().single();
  if (profErr) throw profErr;
  state.family = fam;
  state.parentProfile = profile;
}

async function loadParentContext(authUserId) {
  const { data: profile } = await sb.from('profiles').select('*').eq('auth_user_id', authUserId).maybeSingle();
  state.parentProfile = profile;
  const { data: fam } = await sb.from('families').select('*').eq('id', profile.family_id).maybeSingle();
  state.family = fam;
  if (!profile.approval_pin) { showScreen('screen-set-pin'); setupSetPinScreen(); }
}

function setupSetPinScreen() {
  state.pinBuffer = '';
  renderPinDots($('#setpin-dots'), 0);
  $('#setpin-error').textContent = '';
  buildPinPad($('#setpin-pad'), async (k) => {
    if (k === '⌫') { state.pinBuffer = state.pinBuffer.slice(0, -1); }
    else if (k !== 'OK' && state.pinBuffer.length < 4) { state.pinBuffer += k; }
    renderPinDots($('#setpin-dots'), state.pinBuffer.length);
    if (state.pinBuffer.length === 4) {
      const pin = state.pinBuffer;
      state.pinBuffer = '';
      await sb.from('profiles').update({ approval_pin: pin }).eq('id', state.parentProfile.id);
      state.parentProfile.approval_pin = pin;
      toast('Senha criada! Guarde bem 🔐', '🔐');
      showScreen('screen-parent-dash');
      await refreshParentDashboard();
      subscribeRealtime();
    }
  });
}

// ---------------------------------------------------------------------------
// ENTRAR COMO CRIANÇA (modo dual)
// ---------------------------------------------------------------------------
function renderChildPickList(kids) {
  const list = $('#child-pick-list');
  list.innerHTML = '';
  if (!kids.length) {
    list.innerHTML = `<div class="empty-state"><span class="emoji">🙈</span><h3>Nenhuma criança cadastrada</h3><p>Peça pro responsável te adicionar primeiro na aba Família.</p></div>`;
    return;
  }
  kids.forEach(k => {
    const div = document.createElement('div');
    div.className = 'choice-card';
    div.innerHTML = `<div class="cc-emoji">${k.avatar}</div><div><div class="cc-title">${k.name}</div><div class="cc-desc">Toque para entrar</div></div>`;
    div.addEventListener('click', () => {
      $('#child-login-avatar').textContent = k.avatar;
      $('#child-login-name').textContent = `Oi, ${k.name}!`;
      state.pinBuffer = '';
      renderPinDots($('#childlogin-dots'), 0);
      $('#childlogin-error').textContent = '';
      buildPinPad($('#childlogin-pad'), (key) => handlePinKey(key, k.child_pin || '0000', async () => {
        state.activeChildProfile = k;
        state.family = state.pendingJoinFamily;
        localStorage.setItem('mf_child_profile_id', k.id);
        await enterChildDashboard();
      }, 'childlogin'));
      showScreen('screen-child-login-pin');
    });
    list.appendChild(div);
  });
}

// ---------------------------------------------------------------------------
// PAINEL DO RESPONSÁVEL
// ---------------------------------------------------------------------------
async function refreshParentDashboard() {
  $('#pd-name').textContent = state.parentProfile.name;
  $('#pd-family-name').textContent = state.family.name;
  $('#pd-avatar').textContent = state.parentProfile.avatar || '🧑‍🦱';
  $('#family-invite-code').textContent = state.family.invite_code;
  $('#family-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${state.family.invite_code}`;

  const { data: kids } = await sb.from('profiles').select('*').eq('family_id', state.family.id).eq('role', 'child').order('created_at');
  state.children = kids || [];
  if (!state.selectedTaskChildId && state.children.length) state.selectedTaskChildId = state.children[0].id;

  // recalcula streaks (checa se alguma criança perdeu sequência desde a última visita)
  for (const c of state.children) await checkStreakBreak(c);
  const { data: kids2 } = await sb.from('profiles').select('*').eq('family_id', state.family.id).eq('role', 'child').order('created_at');
  state.children = kids2 || [];

  renderParentChildChips();
  await renderFamilyChildrenList();
  await renderParentTaskList();
  await renderApprovalsList();
  await renderParentRewardList();
  await renderDeliveriesList();
}

function renderParentChildChips() {
  const row = $('#parent-child-chips');
  row.innerHTML = '';
  if (!state.children.length) {
    row.innerHTML = `<p class="small-note" style="margin:0">Adicione uma criança na aba Família para criar missões 👪</p>`;
    return;
  }
  state.children.forEach(c => {
    const chip = document.createElement('div');
    chip.className = 'child-chip' + (c.id === state.selectedTaskChildId ? ' active' : '');
    chip.innerHTML = `<span class="cc-avatar">${c.avatar}</span><span class="cc-name">${c.name}</span>`;
    chip.addEventListener('click', async () => { state.selectedTaskChildId = c.id; await renderParentTaskList(); renderParentChildChips(); });
    row.appendChild(chip);
  });
}

async function renderParentTaskList() {
  const wrap = $('#parent-task-list');
  wrap.innerHTML = '';
  if (!state.selectedTaskChildId) return;
  const { data: tasks } = await sb.from('tasks').select('*').eq('child_id', state.selectedTaskChildId).eq('active', true).order('created_at');
  if (!tasks || !tasks.length) {
    wrap.innerHTML = `<div class="empty-state"><span class="emoji">🗒️</span><h3>Nenhuma missão ainda</h3><p>Toque em "Nova missão" para criar a primeira!</p></div>`;
    return;
  }
  const today = todayStr();
  const { data: logs } = await sb.from('task_logs').select('*').eq('child_id', state.selectedTaskChildId).eq('log_date', today);
  const logByTask = Object.fromEntries((logs || []).map(l => [l.task_id, l]));
  tasks.forEach(t => {
    const log = logByTask[t.id];
    const statusEmoji = !log ? '⏳' : log.status === 'approved' ? '✅' : log.status === 'waiting_approval' ? '📨' : log.status === 'rejected' ? '↩️' : '⏳';
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="lr-icon">${t.icon}</div>
      <div class="lr-info"><div class="lr-title">${t.title}</div><div class="lr-sub">⭐ ${t.points} pontos • ${statusEmoji} ${statusText(log)}</div></div>
      <div class="lr-actions"><button class="icon-btn btn-del-task" title="Remover">🗑️</button></div>`;
    row.querySelector('.btn-del-task').addEventListener('click', async () => {
      if (!confirm(`Remover a missão "${t.title}"?`)) return;
      await sb.from('tasks').update({ active: false }).eq('id', t.id);
      await renderParentTaskList();
    });
    wrap.appendChild(row);
  });
}
function statusText(log) {
  if (!log) return 'ainda não feita';
  if (log.status === 'waiting_approval') return 'esperando você aprovar';
  if (log.status === 'approved') return 'concluída hoje';
  if (log.status === 'rejected') return 'marcada como não feita';
  return '';
}

async function renderApprovalsList() {
  const wrap = $('#approvals-list');
  wrap.innerHTML = '';
  const { data: logs } = await sb.from('task_logs').select('*, tasks(title, icon, points)').eq('family_id', state.family.id).eq('status', 'waiting_approval').order('submitted_at');
  const badge = $('#badge-approvals');
  const count = logs ? logs.length : 0;
  badge.textContent = count; badge.classList.toggle('hidden', count === 0);
  if (!count) {
    wrap.innerHTML = `<div class="empty-state"><span class="emoji">📭</span><h3>Nada esperando</h3><p>Quando uma criança concluir uma missão, aparece aqui.</p></div>`;
    return;
  }
  const childById = Object.fromEntries(state.children.map(c => [c.id, c]));
  logs.forEach(log => {
    const child = childById[log.child_id];
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="lr-icon">${log.tasks?.icon || '🗒️'}</div>
      <div class="lr-info">
        <div class="lr-title">${log.tasks?.title || 'Missão'}</div>
        <div class="lr-sub">${child?.avatar || ''} ${child?.name || ''} • ⭐ ${log.tasks?.points || 0} pontos</div>
      </div>
      <div class="lr-actions">
        <button class="icon-btn btn-reject" title="Não feita">✋</button>
        <button class="icon-btn btn-approve" title="Aprovar" style="background:var(--mint);color:#053e35">✔️</button>
      </div>`;
    row.querySelector('.btn-approve').addEventListener('click', () => {
      requireApprovalPin(() => resolveTaskLog(log, 'approved', child));
    });
    row.querySelector('.btn-reject').addEventListener('click', () => {
      requireApprovalPin(() => resolveTaskLog(log, 'rejected', child), 'Confirme sua senha para marcar como não feita');
    });
    wrap.appendChild(row);
  });
}

async function resolveTaskLog(log, decision, child) {
  const level = levelForStreak(child.streak_count);
  let pointsAwarded = 0;
  if (decision === 'approved') {
    pointsAwarded = Math.round((log.tasks?.points || 0) * level.mult);
    await sb.from('profiles').update({ points_balance: child.points_balance + pointsAwarded }).eq('id', child.id);
  }
  await sb.from('task_logs').update({
    status: decision, points_awarded: pointsAwarded, resolved_at: new Date().toISOString(), resolved_by: state.parentProfile.id,
  }).eq('id', log.id);

  if (decision === 'approved') {
    sfx.approve();
    toast(`${child.name} ganhou ${pointsAwarded} pontos! ⭐`, '✅');
    await registerValidDayIfNeeded(child);
  } else {
    sfx.reject();
    toast(`Missão marcada como não feita`, '↩️');
  }
  await refreshParentDashboard();
}

// ---------------------------------------------------------------------------
// STREAK ENGINE
// ---------------------------------------------------------------------------
/** Roda ao carregar o painel: se passou algum dia de semana (seg-sex) sem que
 *  a criança completasse TODAS as missões daquele dia, a sequência quebra
 *  seguindo a regra de "voltar um nível" (não some tudo se já estava no nível máximo). */
async function checkStreakBreak(child) {
  const missed = missedWeekdaysBetween(child.last_valid_date, todayStr());
  if (missed <= 0) return;
  const currentLevel = levelForStreak(child.streak_count).level;
  let newLevel, newCount;
  if (currentLevel >= 3) { newLevel = 2; newCount = 3; }
  else if (currentLevel === 2) { newLevel = 1; newCount = 0; }
  else { newLevel = 1; newCount = 0; }
  await sb.from('profiles').update({ streak_count: newCount, streak_level: newLevel, last_valid_date: null }).eq('id', child.id);
  child.streak_count = newCount; child.streak_level = newLevel; child.last_valid_date = null;
}

/** Chamado após aprovar uma missão: se TODAS as missões ativas da criança de
 *  hoje já estão aprovadas, e hoje ainda não contou, registra o dia válido. */
async function registerValidDayIfNeeded(child) {
  const today = todayStr();
  const { data: tasks } = await sb.from('tasks').select('id').eq('child_id', child.id).eq('active', true);
  if (!tasks || !tasks.length) return;
  const { data: logs } = await sb.from('task_logs').select('task_id,status').eq('child_id', child.id).eq('log_date', today);
  const approvedIds = new Set((logs || []).filter(l => l.status === 'approved').map(l => l.task_id));
  const allDone = tasks.every(t => approvedIds.has(t.id));
  if (!allDone) return;

  const todayDate = new Date();
  const weekday = isWeekday(todayDate);
  const { data: fresh } = await sb.from('profiles').select('*').eq('id', child.id).single();
  if (fresh.last_valid_date === today) return; // já contabilizado hoje

  if (!weekday) {
    // fim de semana: bônus de pontos já foi dado na aprovação, mas não mexe na sequência
    await sb.from('profiles').update({ last_valid_date: today }).eq('id', child.id).select();
    return;
  }
  const oldLevel = levelForStreak(fresh.streak_count);
  const newCount = fresh.streak_count + 1;
  const newLevelObj = levelForStreak(newCount);
  await sb.from('profiles').update({ streak_count: newCount, streak_level: newLevelObj.level, last_valid_date: today }).eq('id', child.id);
  if (newLevelObj.level > oldLevel.level && state.activeChildProfile?.id === child.id) {
    showLevelUpBanner(newLevelObj);
  }
}

// ---------------------------------------------------------------------------
// LOJA (responsável)
// ---------------------------------------------------------------------------
async function renderParentRewardList() {
  const wrap = $('#parent-reward-list');
  wrap.innerHTML = '';
  const { data: rewards } = await sb.from('rewards').select('*').eq('family_id', state.family.id).eq('active', true).order('created_at');
  if (!rewards || !rewards.length) {
    wrap.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span class="emoji">🎁</span><h3>Nenhum prêmio ainda</h3><p>Crie prêmios para a criança trocar os pontos dela!</p></div>`;
    return;
  }
  rewards.forEach(r => {
    const card = document.createElement('div');
    card.className = 'reward-card';
    card.innerHTML = `<div class="r-icon">${r.icon}</div><div class="r-title">${r.title}</div><div class="r-cost">⭐ ${r.cost_points}</div><button class="icon-btn btn-del-reward" style="margin-top:4px">🗑️</button>`;
    card.querySelector('.btn-del-reward').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Remover o prêmio "${r.title}"?`)) return;
      await sb.from('rewards').update({ active: false }).eq('id', r.id);
      await renderParentRewardList();
    });
    wrap.appendChild(card);
  });
}

async function renderDeliveriesList() {
  const wrap = $('#deliveries-list');
  wrap.innerHTML = '';
  const { data: reds } = await sb.from('redemptions').select('*').eq('family_id', state.family.id).eq('status', 'pending_delivery').order('created_at');
  const badge = $('#badge-deliveries');
  const count = reds ? reds.length : 0;
  badge.textContent = count; badge.classList.toggle('hidden', count === 0);
  if (!count) {
    wrap.innerHTML = `<div class="empty-state"><span class="emoji">📦</span><h3>Nada para entregar</h3><p>Prêmios resgatados pela criança aparecem aqui.</p></div>`;
    return;
  }
  const childById = Object.fromEntries(state.children.map(c => [c.id, c]));
  reds.forEach(r => {
    const child = childById[r.child_id];
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="lr-icon">${r.reward_icon}</div>
      <div class="lr-info"><div class="lr-title">${r.reward_title}</div><div class="lr-sub">${child?.avatar || ''} ${child?.name || ''} • resgatado</div></div>
      <div class="lr-actions"><button class="btn btn-mint btn-sm btn-mark-delivered">Entreguei ✅</button></div>`;
    row.querySelector('.btn-mark-delivered').addEventListener('click', () => {
      requireApprovalPin(async () => {
        await sb.from('redemptions').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', r.id);
        toast('Entrega registrada! 🎉', '📦');
        await refreshParentDashboard();
      }, 'Confirme a entrega do prêmio');
    });
    wrap.appendChild(row);
  });
}

async function renderFamilyChildrenList() {
  const wrap = $('#family-children-list');
  wrap.innerHTML = '';
  if (!state.children.length) {
    wrap.innerHTML = `<p class="small-note" style="margin:0">Nenhuma criança adicionada ainda.</p>`;
    return;
  }
  state.children.forEach(c => {
    const lvl = levelForStreak(c.streak_count);
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="lr-icon">${c.avatar}</div>
      <div class="lr-info"><div class="lr-title">${c.name}</div><div class="lr-sub">⭐ ${c.points_balance} pts • ${lvl.emoji} ${lvl.name} • 🔥 ${c.streak_count}d</div></div>`;
    wrap.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// SHEETS: nova tarefa / novo prêmio / nova criança
// ---------------------------------------------------------------------------
function openTaskSheet() {
  if (!state.children.length) { toast('Adicione uma criança primeiro na aba Família', '👪'); return; }
  $('#in-task-title').value = '';
  $('#in-task-points').value = 10;
  $('#err-task').textContent = '';
  state.taskEmojiSel = TASK_EMOJIS[0];
  buildPicker($('#task-emoji-picker'), TASK_EMOJIS, state.taskEmojiSel, (e) => state.taskEmojiSel = e);
  const assignWrap = $('#task-assign-chips');
  assignWrap.innerHTML = '';
  const assigned = new Set([state.selectedTaskChildId]);
  state.children.forEach(c => {
    const chip = document.createElement('div');
    chip.className = 'child-chip' + (assigned.has(c.id) ? ' active' : '');
    chip.dataset.childId = c.id;
    chip.innerHTML = `<span class="cc-avatar">${c.avatar}</span><span class="cc-name">${c.name}</span>`;
    chip.addEventListener('click', () => {
      if (assigned.has(c.id)) assigned.delete(c.id); else assigned.add(c.id);
      chip.classList.toggle('active');
    });
    assignWrap.appendChild(chip);
  });
  assignWrap._getAssigned = () => assigned;
  openSheet('overlay-task');
}

async function saveNewTask() {
  const title = $('#in-task-title').value.trim();
  const points = parseInt($('#in-task-points').value, 10) || 10;
  const assigned = Array.from($('#task-assign-chips')._getAssigned());
  const errEl = $('#err-task');
  if (!title) { errEl.textContent = 'Dê um nome para a missão'; return; }
  if (!assigned.length) { errEl.textContent = 'Escolha para qual criança'; return; }
  for (const childId of assigned) {
    await sb.from('tasks').insert({
      family_id: state.family.id, child_id: childId, created_by: state.parentProfile.id,
      title, icon: state.taskEmojiSel, points, repeat_daily: true, active: true,
    });
  }
  closeSheet('overlay-task');
  toast('Missão criada! 🎉', '🗒️');
  await renderParentTaskList();
}

function openRewardSheet() {
  $('#in-reward-title').value = '';
  $('#in-reward-cost').value = 50;
  $('#err-reward').textContent = '';
  state.rewardEmojiSel = REWARD_EMOJIS[0];
  buildPicker($('#reward-emoji-picker'), REWARD_EMOJIS, state.rewardEmojiSel, (e) => state.rewardEmojiSel = e);
  openSheet('overlay-reward');
}

async function saveNewReward() {
  const title = $('#in-reward-title').value.trim();
  const cost = parseInt($('#in-reward-cost').value, 10) || 10;
  const errEl = $('#err-reward');
  if (!title) { errEl.textContent = 'Dê um nome para o prêmio'; return; }
  await sb.from('rewards').insert({ family_id: state.family.id, title, icon: state.rewardEmojiSel, cost_points: cost, active: true });
  closeSheet('overlay-reward');
  toast('Prêmio criado! 🎁', '🎉');
  await renderParentRewardList();
}

function openChildSheet() {
  $('#in-child-name').value = '';
  $('#in-child-pin').value = '';
  $('#err-child').textContent = '';
  state.childAvatarSel = AVATAR_EMOJIS[0];
  buildPicker($('#child-avatar-picker'), AVATAR_EMOJIS, state.childAvatarSel, (e) => state.childAvatarSel = e, 'avatar-opt');
  openSheet('overlay-child');
}

async function saveNewChild() {
  const name = $('#in-child-name').value.trim();
  const pin = $('#in-child-pin').value.trim();
  const errEl = $('#err-child');
  if (!name) { errEl.textContent = 'Digite o nome da criança'; return; }
  if (!/^\d{4}$/.test(pin)) { errEl.textContent = 'A senha precisa ter exatamente 4 números'; return; }
  await sb.from('profiles').insert({
    family_id: state.family.id, role: 'child', name, avatar: state.childAvatarSel, child_pin: pin,
    points_balance: 0, streak_count: 0, streak_level: 1,
  });
  closeSheet('overlay-child');
  toast(`${name} foi adicionado(a)! 🎉`, '👪');
  await refreshParentDashboard();
}

// ---------------------------------------------------------------------------
// PAINEL DA CRIANÇA
// ---------------------------------------------------------------------------
async function enterChildDashboard() {
  showScreen('screen-child-dash');
  await checkStreakBreak(state.activeChildProfile);
  await refreshChildDashboard();
  subscribeRealtime();
}

async function refreshChildDashboard() {
  const { data: fresh } = await sb.from('profiles').select('*').eq('id', state.activeChildProfile.id).single();
  state.activeChildProfile = fresh;
  const c = fresh;
  $('#cd-avatar').textContent = c.avatar;
  $('#cd-name').textContent = c.name;
  $('#cd-points').textContent = c.points_balance;

  const lvl = levelForStreak(c.streak_count);
  $('#cd-level-label').textContent = `${lvl.emoji} ${lvl.name}`;
  $('#cd-streak-title').textContent = `🔥 Sequência: ${c.streak_count} dia${c.streak_count === 1 ? '' : 's'}`;
  $('#cd-streak-mult').textContent = `x${lvl.mult.toFixed(2)}`;

  const track = $('#cd-streak-track');
  track.innerHTML = '';
  for (let i = 1; i <= MAX_STREAK_FOR_BAR; i++) {
    const dot = document.createElement('div');
    dot.className = 'streak-dot' + (i <= c.streak_count ? ' filled' : '') + (i === c.streak_count + 1 ? ' current' : '');
    track.appendChild(dot);
  }

  await renderChildTasks();
  await renderChildRewards();
  await renderChildMeTab();
}

async function renderChildTasks() {
  const wrap = $('#child-task-list');
  wrap.innerHTML = '';
  const c = state.activeChildProfile;
  const { data: tasks } = await sb.from('tasks').select('*').eq('child_id', c.id).eq('active', true).order('created_at');
  if (!tasks || !tasks.length) {
    wrap.innerHTML = `<div class="empty-state"><span class="emoji">🎈</span><h3>Sem missões hoje</h3><p>Seu responsável ainda não criou nenhuma missão pra você.</p></div>`;
    return;
  }
  const today = todayStr();
  const { data: logs } = await sb.from('task_logs').select('*').eq('child_id', c.id).eq('log_date', today);
  const logByTask = Object.fromEntries((logs || []).map(l => [l.task_id, l]));

  tasks.forEach(t => {
    const log = logByTask[t.id];
    const status = log?.status || 'pending';
    const tile = document.createElement('div');
    tile.className = 'task-tile status-' + status;
    const statusIcon = status === 'approved' ? '✅' : status === 'waiting_approval' ? '⏳' : status === 'rejected' ? '🔁' : '👉';
    tile.innerHTML = `
      <div class="t-icon">${t.icon}</div>
      <div class="t-info"><div class="t-title">${t.title}</div><div class="t-points">⭐ ${t.points} pontos</div></div>
      <div class="t-status">${statusIcon}</div>`;
    tile.addEventListener('click', () => {
      if (status === 'pending' || status === 'rejected') completeTask(t, log);
    });
    wrap.appendChild(tile);
  });
}

async function completeTask(task, existingLog) {
  const tile = event?.currentTarget;
  if (tile) { tile.classList.add('tap-anim'); setTimeout(() => tile.classList.remove('tap-anim'), 350); }
  sfx.submit();
  const today = todayStr();
  if (existingLog) {
    await sb.from('task_logs').update({ status: 'waiting_approval', submitted_at: new Date().toISOString() }).eq('id', existingLog.id);
  } else {
    await sb.from('task_logs').insert({
      task_id: task.id, child_id: state.activeChildProfile.id, family_id: state.family.id,
      log_date: today, status: 'waiting_approval', submitted_at: new Date().toISOString(),
    });
  }
  toast('Enviado! Esperando seu responsável aprovar ⏳', '📨');
  await renderChildTasks();
}

async function renderChildRewards() {
  const wrap = $('#child-reward-list');
  wrap.innerHTML = '';
  const { data: rewards } = await sb.from('rewards').select('*').eq('family_id', state.family.id).eq('active', true).order('cost_points');
  if (!rewards || !rewards.length) {
    wrap.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span class="emoji">🎁</span><h3>Loja vazia</h3><p>Seu responsável ainda não colocou prêmios.</p></div>`;
    return;
  }
  const balance = state.activeChildProfile.points_balance;
  rewards.forEach(r => {
    const canBuy = balance >= r.cost_points;
    const card = document.createElement('div');
    card.className = 'reward-card';
    card.style.opacity = canBuy ? '1' : '.5';
    card.innerHTML = `<div class="r-icon">${r.icon}</div><div class="r-title">${r.title}</div><div class="r-cost">⭐ ${r.cost_points}</div>`;
    card.addEventListener('click', () => { if (canBuy) openRedeemConfirm(r); else { sfx.error(); toast('Faltam pontos para esse prêmio', '⭐'); } });
    wrap.appendChild(card);
  });
}

function openRedeemConfirm(reward) {
  $('#redeem-title').textContent = `Trocar por "${reward.title}"?`;
  $('#redeem-icon').textContent = reward.icon;
  $('#redeem-cost-label').textContent = `${reward.cost_points} pontos`;
  const btn = $('#btn-confirm-redeem');
  const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => redeemReward(reward));
  openSheet('overlay-redeem');
}

async function redeemReward(reward) {
  const c = state.activeChildProfile;
  await sb.from('redemptions').insert({
    family_id: state.family.id, child_id: c.id, reward_id: reward.id,
    reward_title: reward.title, reward_icon: reward.icon, cost_points: reward.cost_points, status: 'pending_delivery',
  });
  await sb.from('profiles').update({ points_balance: c.points_balance - reward.cost_points }).eq('id', c.id);
  closeSheet('overlay-redeem');
  burstConfetti(110);
  sfx.coin();
  toast('Resgatado! Avise seu responsável para receber 🎁', '🎉');
  await refreshChildDashboard();
}

async function renderChildMeTab() {
  const c = state.activeChildProfile;
  $('#me-points').textContent = c.points_balance;
  const { count: approvedCount } = await sb.from('task_logs').select('id', { count: 'exact', head: true }).eq('child_id', c.id).eq('status', 'approved');
  const { count: redeemedCount } = await sb.from('redemptions').select('id', { count: 'exact', head: true }).eq('child_id', c.id);
  $('#me-approved').textContent = approvedCount || 0;
  $('#me-redeemed').textContent = redeemedCount || 0;
}

// Saída do painel da criança
function onChildExitTapped() {
  if (state.deviceMode === 'dual') {
    if (!confirm('Sair da sua conta neste aparelho?')) return;
    localStorage.removeItem('mf_child_profile_id');
    state.activeChildProfile = null;
    showScreen('screen-child-join');
  } else {
    // modo aparelho único: voltar para o responsável exige o PIN dele
    requireApprovalPin(() => {
      state.activeChildProfile = null;
      showScreen('screen-parent-dash');
      refreshParentDashboard();
    }, 'Senha do responsável para voltar');
  }
}

// ---------------------------------------------------------------------------
// MODO ÚNICO APARELHO: acesso "modo criança" a partir do painel do responsável
// ---------------------------------------------------------------------------
// (acionado pelo toque num item da lista de crianças na aba Família)
function wireFamilyChildTapToSwitch() {
  $('#family-children-list').addEventListener('click', (e) => {
    const row = e.target.closest('.list-row');
    if (!row) return;
  });
}

// Permite trocar para o modo criança tocando no card da criança (aba Família) — modo aparelho único
document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.getElementById('family-children-list');
  if (wrap) {
    wrap.addEventListener('click', async (e) => {
      if (state.deviceMode !== 'single') return;
      const row = e.target.closest('.list-row');
      if (!row) return;
      const idx = Array.from(wrap.children).indexOf(row);
      const child = state.children[idx];
      if (!child) return;
      state.activeChildProfile = child;
      await enterChildDashboard();
    });
  }
});

// ---------------------------------------------------------------------------
// REALTIME
// ---------------------------------------------------------------------------
function subscribeRealtime() {
  if (state.channel) sb.removeChannel(state.channel);
  if (!state.family) return;
  state.channel = sb.channel(`family-${state.family.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_logs', filter: `family_id=eq.${state.family.id}` }, handleRealtimeTaskLog)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'redemptions', filter: `family_id=eq.${state.family.id}` }, handleRealtimeRedemption)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `family_id=eq.${state.family.id}` }, handleRealtimeProfile)
    .subscribe();
}

function handleRealtimeTaskLog(payload) {
  const isParentView = document.getElementById('screen-parent-dash').classList.contains('active');
  const isChildView = document.getElementById('screen-child-dash').classList.contains('active');
  if (isParentView) { renderApprovalsList(); renderParentTaskList(); }
  if (isChildView) {
    const row = payload.new || payload.old;
    if (row && row.child_id === state.activeChildProfile?.id) {
      if (row.status === 'approved') { burstConfetti(70); sfx.coin(); }
      refreshChildDashboard();
    }
  }
}
function handleRealtimeRedemption() {
  const isParentView = document.getElementById('screen-parent-dash').classList.contains('active');
  if (isParentView) renderDeliveriesList();
}
function handleRealtimeProfile(payload) {
  const isChildView = document.getElementById('screen-child-dash').classList.contains('active');
  const row = payload.new;
  if (isChildView && row && row.id === state.activeChildProfile?.id) refreshChildDashboard();
  const isParentView = document.getElementById('screen-parent-dash').classList.contains('active');
  if (isParentView) renderFamilyChildrenList();
}

// ---------------------------------------------------------------------------
// SERVICE WORKER (PWA)
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// desbloqueia áudio no primeiro toque (política dos navegadores)
document.addEventListener('click', () => { try { ctx(); } catch (e) {} }, { once: true });

init();
