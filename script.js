'use strict';

/* =========================================================
   Firebase
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCpz9oVvD0ltHa6nwOdKatapS17qo-u8t4",
  authDomain: "jadwal-lantai-4.firebaseapp.com",
  projectId: "jadwal-lantai-4",
  storageBucket: "jadwal-lantai-4.firebasestorage.app",
  messagingSenderId: "641513753578",
  appId: "1:641513753578:web:39193cdfe9599fb7e34093",
  measurementId: "G-GK6F5KBD4E"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* Satu dokumen untuk seluruh state */
const STATE_DOC = doc(db, 'app', 'state');

/* =========================================================
   State lokal
   ========================================================= */
let state = null;
let unsubscribe = null;
let isSyncing = false;

const ui = {
  activeDayId: null,
  session: 'pagi',
  selectedPerson: null,
  selectedTasks: new Set(),
  editingRowId: null
};

/* =========================================================
   Utils
   ========================================================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => 'id-' + Math.random().toString(36).slice(2, 10);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function toLines(s) {
  return String(s).split('\n').map(x => x.trim()).filter(Boolean);
}
function toList(s) {
  return String(s).split(',').map(x => x.trim()).filter(Boolean);
}
function colorForName(name) {
  const COLORS = ['#d2691e','#1e88e5','#7cb342','#8e24aa','#e53935','#00897b','#f4511e','#3949ab','#c0ca33','#6d4c41','#00acc1','#5e35b1'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h * 31) + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/* =========================================================
   Default state (dipakai kalau Firestore kosong)
   ========================================================= */
function newRow(nama = '', tugas = []) {
  return { id: uid(), nama, tugas };
}
function newDay() {
  return { id: uid(), tanggal: '', pagi: [], sore: [], libur: [], catatan: '' };
}
function defaultState() {
  return {
    judul: 'JADWAL LANTAI 4',
    anggota: ['Faizul', 'Ilham', 'Rosa'],
    tugasMaster: [
      'cuci wadah makan anjing yang kotor',
      'siapkan air sabun',
      'serok kotoran',
      'sikat lantai',
      'serok lantai',
      'bersihkan area tedmon',
      'hidupkan lampu',
      'matikan lampu',
      'siapkan makan kcg king',
      'siapkan makan Anjing',
      'pel lantai',
      'kunci kandang',
      'siapkan lele',
      'kumpulkan wadah makan yang kotor'
    ],
    hari: [{
      id: uid(),
      tanggal: '31 agustus 2026',
      pagi: [
        newRow('Faizul', ['cuci wadah makan anjing yang kotor','siapkan air sabun','serok kotoran','sikat lantai','serok lantai','bersihkan area tedmon','hidupkan lampu']),
        newRow('Ilham', ['siapkan makan kcg king','siapkan makan Anjing']),
        newRow('Rosa', ['pel lantai','kunci kandang'])
      ],
      sore: [],
      libur: [],
      catatan: ''
    }]
  };
}

/* =========================================================
   Firestore init
   ========================================================= */
async function initFirestore() {
  try {
    const snap = await getDoc(STATE_DOC);
    if (!snap.exists()) {
      state = defaultState();
      ui.activeDayId = state.hari[0]?.id || null;
      await setDoc(STATE_DOC, state);
    } else {
      state = normalizeState(snap.data());
      ui.activeDayId = state.hari[0]?.id || null;
    }
    renderAll();
    $('#loading').hidden = true;
    $('#app').hidden = false;
    bindEvents();
    listenFirestore();
  } catch (err) {
    console.error('Firestore init error:', err);
    $('#loading').innerHTML = `
      <div style="text-align:center;padding:20px">
        <p style="font-size:40px">⚠️</p>
        <p>Gagal terhubung ke server.</p>
        <p style="font-size:12px;opacity:.8;margin-top:8px">${escapeHtml(err.message)}</p>
        <button onclick="location.reload()" style="margin-top:16px;padding:8px 18px;border-radius:8px;border:none;background:#fff;color:#008069;font-weight:600;cursor:pointer">Coba Lagi</button>
      </div>`;
  }
}

function listenFirestore() {
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(STATE_DOC, (snap) => {
    if (!snap.exists()) return;
    const incoming = normalizeState(snap.data());
    if (isSyncing) return;
    state = incoming;
    if (!state.hari.find(h => h.id === ui.activeDayId)) {
      ui.activeDayId = state.hari[0]?.id || null;
    }
    renderAll();
  }, (err) => {
    console.error('onSnapshot error:', err);
    toast('Koneksi terputus, mencoba lagi...');
  });
}

async function pushState() {
  isSyncing = true;
  try {
    await setDoc(STATE_DOC, state);
  } catch (err) {
    console.error('Gagal menyimpan:', err);
    toast('Gagal menyimpan ke server');
  } finally {
    setTimeout(() => { isSyncing = false; }, 400);
  }
}

function normalizeState(s) {
  if (!s || !Array.isArray(s.hari)) return defaultState();
  if (!Array.isArray(s.anggota)) s.anggota = [];
  if (typeof s.judul !== 'string') s.judul = 'JADWAL LANTAI 4';
  if (!Array.isArray(s.tugasMaster)) s.tugasMaster = defaultState().tugasMaster;
  s.hari.forEach(h => {
    if (!h.id) h.id = uid();
    if (!Array.isArray(h.pagi)) h.pagi = [];
    if (!Array.isArray(h.sore)) h.sore = [];
    if (!Array.isArray(h.libur)) h.libur = [];
    if (typeof h.tanggal !== 'string') h.tanggal = '';
    if (typeof h.catatan !== 'string') h.catatan = '';
    ['pagi','sore'].forEach(k => h[k].forEach(r => {
      if (!r.id) r.id = uid();
      if (!Array.isArray(r.tugas)) r.tugas = [];
      if (typeof r.nama !== 'string') r.nama = '';
    }));
  });
  return s;
}

/* =========================================================
   Render
   ========================================================= */
function renderAll() {
  renderDayList();
  renderChat();
  renderComposer();
}

function renderDayList() {
  const list = $('#day-list');
  if (!list) return;
  const q = ($('#search-day')?.value || '').trim().toLowerCase();
  if (!state.hari.length) {
    list.innerHTML = `<div class="empty-list">📅<div>Belum ada hari</div></div>`;
    return;
  }
  const items = state.hari.filter(h => !q || (h.tanggal || '').toLowerCase().includes(q));
  if (!items.length) {
    list.innerHTML = `<div class="empty-list">🔍<div>Tidak ditemukan</div></div>`;
    return;
  }
  list.innerHTML = items.map(h => {
    const idx = state.hari.indexOf(h) + 1;
    const total = h.pagi.length + h.sore.length;
    const preview = total ? `${h.pagi.length} pagi · ${h.sore.length} sore` : 'Belum ada penugasan';
    const active = h.id === ui.activeDayId ? ' active' : '';
    return `
      <div class="day-item${active}" data-day="${h.id}">
        <div class="day-avatar">${idx}</div>
        <div class="day-info">
          <div class="day-name">${escapeHtml(h.tanggal || '(tanpa tanggal)')}</div>
          <div class="day-preview">${escapeHtml(preview)}</div>
        </div>
      </div>`;
  }).join('');
}

function bubbleHtml(r) {
  const color = colorForName(r.nama);
  const editing = ui.editingRowId === r.id ? ' editing' : '';
  const tasks = r.tugas.length
    ? r.tugas.map(t => '• ' + escapeHtml(t)).join('\n')
    : '<em style="color:#999">(belum ada tugas)</em>';
  return `
    <div class="bubble${editing}" data-row="${r.id}">
      <div class="sender" style="color:${color}">${escapeHtml(r.nama)}</div>
      <div class="tasks">${tasks}</div>
      <div class="bubble-actions">
        <button class="del" data-act="del-row" data-row="${r.id}" title="Hapus">✕</button>
      </div>
    </div>`;
}

function renderChat() {
  const day = state.hari.find(h => h.id === ui.activeDayId);
  const body = $('#chat-body');
  if (!day) {
    $('#chat-avatar').textContent = '?';
    $('#chat-title').textContent = 'Pilih hari';
    $('#chat-sub').textContent = '—';
    body.innerHTML = `<div class="empty"><div class="big">💬</div><div>Pilih hari di sebelah kiri<br>atau tambah hari baru</div></div>`;
    $('#composer').style.display = 'none';
    return;
  }
  $('#composer').style.display = '';
  const idx = state.hari.indexOf(day) + 1;
  $('#chat-avatar').textContent = idx;
  $('#chat-title').textContent = 'Tanggal ' + (day.tanggal || '(belum diisi)');
  $('#chat-sub').textContent = `${day.pagi.length} pagi · ${day.sore.length} sore`;

  let html = '';
  html += `<div class="sys-pill">☀️ PAGI</div>`;
  html += day.pagi.length ? day.pagi.map(bubbleHtml).join('') : `<div class="sys-pill muted">Belum ada penugasan pagi</div>`;
  html += `<div class="sys-pill">🌙 SORE</div>`;
  html += day.sore.length ? day.sore.map(bubbleHtml).join('') : `<div class="sys-pill muted">Belum ada penugasan sore</div>`;
  if (day.libur && day.libur.length) html += `<div class="sys-pill muted">🚫 Libur: ${day.libur.map(escapeHtml).join(', ')}</div>`;
  if (day.catatan && day.catatan.trim()) html += `<div class="sys-pill note">📝 ${escapeHtml(day.catatan)}</div>`;
  body.innerHTML = html;
}

function getTakenTasks(day, excludeRowId, session) {
  const taken = new Set();
  day[session].forEach(r => {
    if (r.id === excludeRowId) return;
    r.tugas.forEach(t => taken.add(t));
  });
  return taken;
}

function renderComposer() {
  const day = state.hari.find(h => h.id === ui.activeDayId);
  if (!day) return;

  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.session === ui.session));

  const pc = $('#person-chips');
  if (!state.anggota.length) {
    pc.innerHTML = `<span class="muted-text">(belum ada anggota — buka ⚙️)</span>`;
  } else {
    pc.innerHTML = state.anggota.map(n => {
      const on = ui.selectedPerson === n ? ' on' : '';
      return `<div class="chip${on}" data-person="${escapeHtml(n)}">${escapeHtml(n)}</div>`;
    }).join('');
  }

  const tc = $('#task-chips');
  const taken = getTakenTasks(day, ui.editingRowId, ui.session);
  tc.innerHTML = state.tugasMaster.map(t => {
    const isTaken = taken.has(t);
    const isOn = ui.selectedTasks.has(t);
    let cls = 'chip';
    if (isTaken) cls += ' disabled';
    else if (isOn) cls += ' on';
    return `<div class="${cls}" data-task="${escapeHtml(t)}">${escapeHtml(t)}</div>`;
  }).join('') || `<span class="muted-text">(belum ada tugas — buka ⚙️)</span>`;

  const btn = $('#btn-send');
  btn.textContent = ui.editingRowId ? 'Simpan ✓' : 'Kirim ➤';
  btn.disabled = !ui.selectedPerson || ui.selectedTasks.size === 0;
  $('#btn-cancel-edit').hidden = !ui.editingRowId;
}

/* =========================================================
   Operasi
   ========================================================= */
function sendAssignment() {
  const day = state.hari.find(h => h.id === ui.activeDayId);
  if (!day || !ui.selectedPerson || ui.selectedTasks.size === 0) return;
  const tasks = Array.from(ui.selectedTasks);

  if (ui.editingRowId) {
    for (const s of ['pagi','sore']) {
      const i = day[s].findIndex(r => r.id === ui.editingRowId);
      if (i >= 0) {
        const row = day[s][i];
        if (s !== ui.session) {
          day[s].splice(i, 1);
          day[ui.session].push({ ...row, nama: ui.selectedPerson, tugas: tasks });
        } else {
          row.nama = ui.selectedPerson;
          row.tugas = tasks;
        }
        break;
      }
    }
    cancelEdit();
  } else {
    day[ui.session].push({ id: uid(), nama: ui.selectedPerson, tugas: tasks });
    ui.selectedTasks.clear();
    ui.selectedPerson = null;
  }
  pushState();
  renderAll();
}

function cancelEdit() {
  ui.editingRowId = null;
  ui.selectedPerson = null;
  ui.selectedTasks.clear();
}

function startEdit(rowId) {
  const day = state.hari.find(h => h.id === ui.activeDayId);
  if (!day) return;
  for (const s of ['pagi','sore']) {
    const r = day[s].find(x => x.id === rowId);
    if (r) {
      ui.editingRowId = rowId;
      ui.session = s;
      ui.selectedPerson = r.nama;
      ui.selectedTasks = new Set(r.tugas);
      renderAll();
      $('#composer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
  }
}

function deleteRow(rowId) {
  const day = state.hari.find(h => h.id === ui.activeDayId);
  if (!day) return;
  for (const s of ['pagi','sore']) {
    const i = day[s].findIndex(r => r.id === rowId);
    if (i >= 0) {
      if (!confirm('Hapus penugasan ini?')) return;
      day[s].splice(i, 1);
      if (ui.editingRowId === rowId) cancelEdit();
      pushState();
      renderAll();
      return;
    }
  }
}

function duplicateDay() {
  const day = state.hari.find(h => h.id === ui.activeDayId);
  if (!day) return;
  const idx = state.hari.indexOf(day);
  const copy = JSON.parse(JSON.stringify(day));
  copy.id = uid();
  ['pagi','sore'].forEach(k => copy[k].forEach(r => r.id = uid()));
  copy.tanggal = '';
  state.hari.splice(idx + 1, 0, copy);
  ui.activeDayId = copy.id;
  cancelEdit();
  pushState();
  renderAll();
  toast('Hari diduplikat');
}

function deleteDay() {
  const day = state.hari.find(h => h.id === ui.activeDayId);
  if (!day) return;
  if (!confirm(`Hapus hari "${day.tanggal || '(tanpa tanggal)'}"?`)) return;
  const idx = state.hari.indexOf(day);
  state.hari.splice(idx, 1);
  if (!state.hari.length) state.hari.push(newDay());
  ui.activeDayId = state.hari[Math.min(idx, state.hari.length - 1)].id;
  cancelEdit();
  pushState();
  renderAll();
  toast('Hari dihapus');
}

/* =========================================================
   Modal
   ========================================================= */
function openSettingsModal() {
  $('#set-judul').value = state.judul;
  $('#set-anggota').value = state.anggota.join('\n');
  $('#set-tugas').value = state.tugasMaster.join('\n');
  $('#modal-settings').hidden = false;
  document.body.classList.add('modal-open');
}
function saveSettings() {
  state.judul = $('#set-judul').value.trim() || 'JADWAL LANTAI 4';
  state.anggota = toLines($('#set-anggota').value);
  state.tugasMaster = toLines($('#set-tugas').value);
  pushState();
  closeSettingsModal();
  renderAll();
  toast('Pengaturan disimpan');
}
function closeSettingsModal() {
  $('#modal-settings').hidden = true;
  document.body.classList.remove('modal-open');
}

function openDayModal() {
  const day = state.hari.find(h => h.id === ui.activeDayId);
  if (!day) return;
  $('#day-tanggal').value = day.tanggal || '';
  $('#day-libur').value = (day.libur || []).join(', ');
  $('#day-catatan').value = day.catatan || '';
  $('#modal-day').hidden = false;
  document.body.classList.add('modal-open');
}
function saveDayModal() {
  const day = state.hari.find(h => h.id === ui.activeDayId);
  if (!day) return;
  day.tanggal = $('#day-tanggal').value.trim();
  day.libur = toList($('#day-libur').value);
  day.catatan = $('#day-catatan').value.trim();
  pushState();
  closeDayModal();
  renderAll();
  toast('Info hari disimpan');
}
function closeDayModal() {
  $('#modal-day').hidden = true;
  document.body.classList.remove('modal-open');
}

/* =========================================================
   Teks & copy
   ========================================================= */
function generateDayText(day) {
  const out = [];
  out.push(state.judul || 'JADWAL LANTAI 4');
  out.push('');
  out.push('Tanggal ' + day.tanggal);
  out.push('');
  out.push('PAGI');
  if (day.pagi.length) {
    day.pagi.forEach(r => {
      out.push(`${r.nama} : ${r.tugas.join(', ')}`);
    });
  } else {
    out.push('(belum ada penugasan)');
  }
  out.push('');
  out.push('SORE');
  if (day.sore.length) {
    day.sore.forEach(r => {
      out.push(`${r.nama} : ${r.tugas.join(', ')}`);
    });
  } else {
    out.push('(belum ada penugasan)');
  }
  if (day.libur && day.libur.length) {
    out.push('');
    day.libur.forEach(n => out.push('- ' + n + ' libur'));
  }
  if (day.catatan) {
    out.push('');
    out.push(day.catatan);
  }
  return out.join('\n').trim();
}

function generateAllText() {
  return state.hari.map(h => generateDayText(h)).join('\n\n\n').trim();
}

function copyText(text, msg = 'Tersalin!') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(msg)).catch(fallback);
  } else fallback();
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(msg); } catch (e) {}
    document.body.removeChild(ta);
  }
}
function copyDay() {
  const day = state.hari.find(h => h.id === ui.activeDayId);
  if (!day) return;
  copyText(generateDayText(day), 'Hari tersalin!');
}
function copyAll() {
  if (!state.hari.length) return;
  copyText(generateAllText(), 'Semua hari tersalin!');
}

/* =========================================================
   Toast
   ========================================================= */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* =========================================================
   Event binding
   ========================================================= */
function bindEvents() {
  $('#btn-add-day').addEventListener('click', () => {
    const d = newDay();
    state.hari.push(d);
    ui.activeDayId = d.id;
    cancelEdit();
    pushState();
    renderAll();
    document.body.classList.add('day-open');
    openDayModal();
  });

  $('#search-day').addEventListener('input', renderDayList);

  $('#day-list').addEventListener('click', e => {
    const item = e.target.closest('[data-day]');
    if (!item) return;
    ui.activeDayId = item.dataset.day;
    cancelEdit();
    renderAll();
    document.body.classList.add('day-open');
  });

  $('#btn-back').addEventListener('click', () => {
    document.body.classList.remove('day-open');
  });

  $('#composer').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    const newSession = tab.dataset.session;
    if (newSession === ui.session) return;
    ui.session = newSession;
    const day = state.hari.find(h => h.id === ui.activeDayId);
    if (day) {
      const taken = getTakenTasks(day, ui.editingRowId, ui.session);
      ui.selectedTasks = new Set([...ui.selectedTasks].filter(t => !taken.has(t)));
    }
    renderComposer();
  });

  $('#person-chips').addEventListener('click', e => {
    const chip = e.target.closest('[data-person]');
    if (!chip) return;
    const n = chip.dataset.person;
    ui.selectedPerson = ui.selectedPerson === n ? null : n;
    renderComposer();
  });

  $('#task-chips').addEventListener('click', e => {
    const chip = e.target.closest('[data-task]');
    if (!chip || chip.classList.contains('disabled')) return;
    const t = chip.dataset.task;
    if (ui.selectedTasks.has(t)) ui.selectedTasks.delete(t);
    else ui.selectedTasks.add(t);
    renderComposer();
  });

  $('#btn-send').addEventListener('click', sendAssignment);
  $('#btn-cancel-edit').addEventListener('click', () => { cancelEdit(); renderAll(); });

  $('#chat-body').addEventListener('click', e => {
    const del = e.target.closest('[data-act="del-row"]');
    if (del) { e.stopPropagation(); deleteRow(del.dataset.row); return; }
    const bubble = e.target.closest('.bubble');
    if (bubble) startEdit(bubble.dataset.row);
  });

  $('#btn-copy-day').addEventListener('click', copyDay);
  $('#btn-dup-day').addEventListener('click', duplicateDay);
  $('#btn-info-day').addEventListener('click', openDayModal);
  $('#btn-del-day').addEventListener('click', deleteDay);

  $('#btn-copy-all').addEventListener('click', copyAll);
  $('#btn-settings').addEventListener('click', openSettingsModal);
  $('#btn-save-settings').addEventListener('click', saveSettings);

  /* Tutup modal: klik backdrop atau tombol close */
  $('#modal-settings').addEventListener('click', e => {
    if (e.target.dataset.close !== undefined || e.target.id === 'modal-settings') {
      closeSettingsModal();
    }
  });
  $('#modal-day').addEventListener('click', e => {
    if (e.target.dataset.close !== undefined || e.target.id === 'modal-day') {
      closeDayModal();
    }
  });
  $('#btn-save-day').addEventListener('click', saveDayModal);

  /* Escape untuk tutup modal */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeSettingsModal();
      closeDayModal();
    }
  });
}

/* =========================================================
   Start
   ========================================================= */
initFirestore();
