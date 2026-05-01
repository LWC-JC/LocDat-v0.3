// ===== LocDat main application =====
'use strict';

// ----- Configure proj4 for GDA2020 MGA Zone 54 -----
function setupProj4() {
  if (typeof proj4 === 'undefined') return false;
  proj4.defs('MGA54', '+proj=utm +zone=54 +south +ellps=GRS80 +units=m +no_defs');
  return true;
}
const _proj4Ready = setupProj4();
function latLngToMGA(lat, lng) {
  if (!_proj4Ready || typeof proj4 === 'undefined') return { easting: null, northing: null };
  const [e, n] = proj4('EPSG:4326', 'MGA54', [lng, lat]);
  return { easting: e, northing: n };
}
function mgaToLatLng(easting, northing) {
  if (!_proj4Ready || typeof proj4 === 'undefined') return { lat: null, lng: null };
  const [lng, lat] = proj4('MGA54', 'EPSG:4326', [easting, northing]);
  return { lat, lng };
}

// ===== Authentication (password-only) =====
async function fetchAuthConfig() {
  try {
    const resp = await fetch(AUTH_CONFIG_URL);
    if (!resp.ok) throw new Error('Config fetch failed: ' + resp.status);
    return await resp.json();
  } catch (err) {
    console.error('Auth config fetch error:', err);
    return null;
  }
}

function getAuthData() {
  try {
    const raw = localStorage.getItem('locdat_auth');
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function saveAuthData(passwordHash, timestamp) {
  localStorage.setItem('locdat_auth', JSON.stringify({ passwordHash, timestamp }));
}

function clearAuthData() {
  localStorage.removeItem('locdat_auth');
}

// Simple hash so we don't store the password in plaintext in localStorage
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

async function validateAuth(password) {
  const config = await fetchAuthConfig();
  if (!config) {
    return { success: false, error: 'Cannot reach authentication server. Check your internet connection.' };
  }
  if (config.password !== password) {
    return { success: false, error: 'Incorrect password.' };
  }
  // Cache the password hash so we can detect password changes on re-validation
  saveAuthData(simpleHash(password), new Date().toISOString());
  return { success: true };
}

async function checkAuthStatus() {
  const authData = getAuthData();
  if (!authData) return { authenticated: false };

  // Check if cache expired
  const daysSinceAuth = (new Date() - new Date(authData.timestamp)) / (1000 * 60 * 60 * 24);

  if (daysSinceAuth < AUTH_CACHE_DAYS) {
    // Within grace period — allow without server check
    return { authenticated: true, cached: true };
  }

  // Cache expired — re-validate against server
  const config = await fetchAuthConfig();
  if (!config) {
    // Can't reach server but cache exists — allow offline grace
    return { authenticated: true, cached: true, offline: true };
  }

  // Check if the password has changed since user last authenticated
  if (simpleHash(config.password) !== authData.passwordHash) {
    // Password changed — force re-login
    clearAuthData();
    return { authenticated: false, passwordChanged: true };
  }

  // Still valid — refresh timestamp
  saveAuthData(authData.passwordHash, new Date().toISOString());
  return { authenticated: true, refreshed: true };
}

// ===== IndexedDB wrapper =====
const DB_NAME = 'locdat';
const DB_VERSION = 2;
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('locations')) {
        const s = db.createObjectStore('locations', { keyPath: 'id', autoIncrement: true });
        s.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains('spatial')) {
        const s = db.createObjectStore('spatial', { keyPath: 'locationId' });
      }
      if (!db.objectStoreNames.contains('soilBoreholes')) {
        const s = db.createObjectStore('soilBoreholes', { keyPath: 'id', autoIncrement: true });
        s.createIndex('locationId', 'locationId');
      }
      if (!db.objectStoreNames.contains('soilLithologies')) {
        const s = db.createObjectStore('soilLithologies', { keyPath: 'id', autoIncrement: true });
        s.createIndex('boreholeId', 'boreholeId');
      }
      if (!db.objectStoreNames.contains('soilBoreSamples')) {
        const s = db.createObjectStore('soilBoreSamples', { keyPath: 'id', autoIncrement: true });
        s.createIndex('boreholeId', 'boreholeId');
      }
      if (!db.objectStoreNames.contains('soilBoreFieldMeas')) {
        const s = db.createObjectStore('soilBoreFieldMeas', { keyPath: 'id', autoIncrement: true });
        s.createIndex('boreholeId', 'boreholeId');
      }
      if (!db.objectStoreNames.contains('soilSamples')) {
        const s = db.createObjectStore('soilSamples', { keyPath: 'id', autoIncrement: true });
        s.createIndex('locationId', 'locationId');
      }
      if (!db.objectStoreNames.contains('fieldMeasurements')) {
        const s = db.createObjectStore('fieldMeasurements', { keyPath: 'id', autoIncrement: true });
        s.createIndex('locationId', 'locationId');
      }
      if (!db.objectStoreNames.contains('customRecords')) {
        const s = db.createObjectStore('customRecords', { keyPath: 'id', autoIncrement: true });
        s.createIndex('locationId', 'locationId');
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        s.createIndex('entityKey', 'entityKey');
        s.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      // v2 additions
      if (!db.objectStoreNames.contains('gwSamples')) {
        const s = db.createObjectStore('gwSamples', { keyPath: 'id', autoIncrement: true });
        s.createIndex('locationId', 'locationId');
      }
      if (!db.objectStoreNames.contains('svSamples')) {
        const s = db.createObjectStore('svSamples', { keyPath: 'id', autoIncrement: true });
        s.createIndex('locationId', 'locationId');
      }
      if (!db.objectStoreNames.contains('gwWellGauges')) {
        const s = db.createObjectStore('gwWellGauges', { keyPath: 'id', autoIncrement: true });
        s.createIndex('locationId', 'locationId');
      }
      if (!db.objectStoreNames.contains('wellConstruction')) {
        db.createObjectStore('wellConstruction', { keyPath: 'boreholeId' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return _db.transaction(store, mode).objectStore(store);
}
function dbGet(store, key) {
  return new Promise((res, rej) => { const r = tx(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function dbPut(store, obj) {
  return new Promise((res, rej) => { const r = tx(store, 'readwrite').put(obj); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function dbAdd(store, obj) {
  return new Promise((res, rej) => { const r = tx(store, 'readwrite').add(obj); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function dbDelete(store, key) {
  return new Promise((res, rej) => { const r = tx(store, 'readwrite').delete(key); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}
function dbGetAll(store) {
  return new Promise((res, rej) => { const r = tx(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function dbGetAllByIndex(store, indexName, value) {
  return new Promise((res, rej) => {
    const idx = tx(store).index(indexName);
    const r = idx.getAll(value);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// ===== Settings =====
async function getSettings() {
  const s = await dbGet('settings', 1);
  if (s) return s;
  const def = { id: 1, ...DEFAULT_SETTINGS };
  await dbPut('settings', def);
  return def;
}
async function saveSettings(settings) {
  settings.id = 1;
  await dbPut('settings', settings);
}

// ===== State / Router =====
const state = {
  currentProjectId: null,
  currentLocationId: null,
  currentBoreholeId: null,
  dirty: false,
  pendingNav: null,
  screenStack: []
};

function setDirty(v = true) { state.dirty = v; }

async function navigate(screenFn, ...args) {
  if (state.dirty) {
    const confirmed = await confirmDialog('You have unsaved changes. Discard them?', 'Unsaved changes', 'Discard', 'Cancel');
    if (!confirmed) return;
    state.dirty = false;
  }
  state.screenStack.push({ fn: screenFn, args });
  screenFn(...args);
}

async function navBack() {
  if (state.dirty) {
    const confirmed = await confirmDialog('You have unsaved changes. Discard them?', 'Unsaved changes', 'Discard', 'Cancel');
    if (!confirmed) return;
    state.dirty = false;
  }
  state.screenStack.pop();
  const prev = state.screenStack[state.screenStack.length - 1];
  if (prev) prev.fn(...prev.args);
  else screenHome();
}

// ===== Utility rendering =====
const $app = () => document.getElementById('app');
const $modals = () => document.getElementById('modal-root');

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v === false || v == null) { /* skip */ }
    else e.setAttribute(k, v);
  }
  if (!Array.isArray(children)) children = [children];
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

function clearApp() { $app().innerHTML = ''; }

function header(opts) {
  const row1 = el('div', { class: 'hdr-row' }, [
    opts.back !== false ? el('button', { class: 'hdr-back', onclick: opts.onBack || navBack }, '◀') : null,
    el('span', { class: 'hdr-label' }, opts.breadcrumb || ''),
    el('img', { class: 'hdr-logo-img', src: 'logo.png', alt: 'LocDat' })
  ]);
  const titleRow = el('div', { class: 'hdr-row' }, [
    el('div', { class: 'hdr-title' }, opts.title || ''),
    opts.onEdit ? el('button', { class: 'hdr-edit', onclick: opts.onEdit }, 'Edit') : null
  ]);
  const children = [row1, titleRow];
  if (opts.subtitle) children.push(el('div', { class: 'hdr-sub' }, opts.subtitle));
  return el('div', { class: 'header' }, children);
}

function formRow(label, input) {
  return el('div', { class: 'form-field' }, [
    el('label', {}, label),
    input
  ]);
}

function textInput(id, value = '', opts = {}) {
  const i = el('input', { id, type: opts.type || 'text', value: value || '' });
  if (opts.readonly) i.readOnly = true;
  if (opts.placeholder) i.placeholder = opts.placeholder;
  i.addEventListener('input', () => setDirty());
  return i;
}

function numInput(id, value = '', opts = {}) {
  const i = el('input', { id, type: 'number', step: opts.step || 'any', value: value ?? '' });
  if (opts.readonly) i.readOnly = true;
  i.addEventListener('input', () => setDirty());
  return i;
}

function depthInput(id, value = '') {
  const i = el('input', { id, type: 'number', step: '0.1', inputmode: 'decimal', value: value ?? '' });
  i.addEventListener('input', () => setDirty());
  return i;
}

// Depth input with +/- 0.1m buttons
function depthInputWithButtons(id, value = '') {
  const inp = depthInput(id, value);
  const upBtn = el('button', { class: 'btn btn-small', type: 'button', onclick: () => {
    const v = parseFloat(inp.value) || 0;
    inp.value = (v + 0.1).toFixed(1);
    setDirty();
  }}, '▲');
  const downBtn = el('button', { class: 'btn btn-small', type: 'button', onclick: () => {
    const v = parseFloat(inp.value) || 0;
    inp.value = Math.max(0, v - 0.1).toFixed(1);
    setDirty();
  }}, '▼');
  const container = el('div', { class: 'depth-input-group' }, [inp, upBtn, downBtn]);
  // Expose the input element as a property so callers can access .value
  container.input = inp;
  // Also expose .value getter/setter for backward compatibility
  Object.defineProperty(container, 'value', {
    get: () => inp.value,
    set: (v) => { inp.value = v; }
  });
  return container;
}

function textArea(id, value = '') {
  const t = el('textarea', { id, rows: 3 }, []);
  t.value = value || '';
  t.addEventListener('input', () => setDirty());
  return t;
}

function selectInput(id, options, value = '') {
  const s = el('select', { id });
  for (const o of options) {
    const opt = el('option', { value: o }, o || '—');
    if (o === value) opt.selected = true;
    s.appendChild(opt);
  }
  s.addEventListener('change', () => setDirty());
  return s;
}

// Renders a wrapping row of small toggle buttons. Single-select.
// Stores the current value on the container's dataset.value so getButtonGroupVal(id) returns it.
function buttonGroup(id, options, value = '') {
  const container = el('div', { id, class: 'btn-group' });
  container.dataset.value = value || '';
  for (const o of options) {
    const label = o === '' ? '—' : o;
    const btn = el('button', { type: 'button', class: 'bg-btn' + (o === value ? ' selected' : ''), 'data-val': o }, label);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const current = container.dataset.value || '';
      // If clicking already-selected, clear it (allows unsetting)
      if (current === o) {
        container.dataset.value = '';
      } else {
        container.dataset.value = o;
      }
      // Re-render selection state
      for (const child of container.children) {
        if (child.dataset && child.dataset.val != null) {
          child.classList.toggle('selected', child.dataset.val === container.dataset.value);
        }
      }
      setDirty();
    });
    container.appendChild(btn);
  }
  return container;
}

function getButtonGroupVal(id) {
  const e = document.getElementById(id);
  return e && e.dataset ? (e.dataset.value || '') : '';
}

function getVal(id) { const e = document.getElementById(id); return e ? e.value : ''; }

// ===== Modals / dialogs =====
function modal(content) {
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, [
    el('div', { class: 'modal' }, content)
  ]);
  function close() { overlay.remove(); }
  $modals().appendChild(overlay);
  return { close, overlay };
}

function confirmDialog(message, title = 'Confirm', yesLabel = 'Yes', noLabel = 'No') {
  return new Promise((resolve) => {
    const m = modal([
      el('h3', {}, title),
      el('p', {}, message),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn', onclick: () => { m.close(); resolve(false); } }, noLabel),
        el('button', { class: 'btn btn-danger', onclick: () => { m.close(); resolve(true); } }, yesLabel)
      ])
    ]);
  });
}

function alertDialog(message, title = 'Notice') {
  return new Promise((resolve) => {
    const m = modal([
      el('h3', {}, title),
      el('p', {}, message),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-primary', onclick: () => { m.close(); resolve(); } }, 'OK')
      ])
    ]);
  });
}

function toast(msg, ms = 2000) {
  const t = el('div', { class: 'toast' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ===== Photos =====
async function takePhoto() {
  return new Promise((resolve) => {
    const input = document.getElementById('photo-input');
    input.value = '';
    const handler = () => {
      input.removeEventListener('change', handler);
      const file = input.files[0];
      if (!file) { resolve(null); return; }
      resolve(file);
    };
    input.addEventListener('change', handler);
    input.click();
  });
}

function dateStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function savePhoto(file, entityKey, projectId, filenameBase) {
  const photo = {
    entityKey,
    projectId,
    filename: `${dateStamp()}_${filenameBase}.jpeg`,
    blob: file,
    createdAt: new Date().toISOString()
  };
  photo.id = await dbAdd('photos', photo);
  return photo;
}

async function getLatestPhoto(entityKey) {
  const all = await dbGetAllByIndex('photos', 'entityKey', entityKey);
  if (!all || all.length === 0) return null;
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

async function getPhotosFor(entityKey) {
  return await dbGetAllByIndex('photos', 'entityKey', entityKey);
}

function photoPreviewUI(entityKey, projectId, filenameBase, extraLabel = 'Photo') {
  const wrap = el('div', { class: 'photo-preview empty' }, 'No photo yet');
  const fnameEl = el('div', { class: 'photo-filename' });
  const cameraBtn = el('button', { class: 'btn-icon', style: 'background:#9CE076;font-size:18px', onclick: async () => {
    const file = await takePhoto();
    if (!file) return;
    const photo = await savePhoto(file, entityKey, projectId, filenameBase);
    await renderPhoto(photo);
    toast('Photo saved');
  }}, '📷');

  async function renderPhoto(photo) {
    wrap.innerHTML = '';
    wrap.className = 'photo-preview';
    if (!photo) { wrap.className = 'photo-preview empty'; wrap.textContent = 'No photo yet'; fnameEl.textContent = ''; return; }
    const url = URL.createObjectURL(photo.blob);
    const img = el('img', { src: url, alt: 'Photo' });
    img.onclick = () => {
      const fs = el('div', { class: 'modal-overlay', style: 'background:#000', onclick: () => fs.remove() }, [
        el('img', { src: url, style: 'max-width:100%;max-height:100%' })
      ]);
      $modals().appendChild(fs);
    };
    wrap.appendChild(img);
    fnameEl.textContent = photo.filename;
  }

  // init
  getLatestPhoto(entityKey).then(renderPhoto);

  const container = el('div', {}, [
    el('div', { class: 'row' }, [
      el('span', {}, `Add ${extraLabel}`),
      cameraBtn
    ]),
    wrap,
    fnameEl
  ]);
  return container;
}

// ===== Helpers =====
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;
}
function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  let h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${p(d.getMinutes())} ${ampm} ${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;
}

// Auto-increment a prefix against existing values
function nextAutoId(prefix, existingIds) {
  // find highest numeric suffix after prefix
  let max = 0;
  const rx = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
  for (const id of existingIds) {
    const m = (id || '').match(rx);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return prefix + String(max + 1).padStart(2, '0');
}

// ===== Save button bar =====
// saveFn performs the DB save. By default, saveBar clears the dirty flag and calls navBack().
// If saveFn returns the literal boolean `false`, saveBar will NOT call navBack (used for
// flows that navigate forward after save).
//
// Side effect: a compact "Save and Return" button is also injected into the most recent
// header so the action is reachable without scrolling on long forms.
function saveBar(saveFn, opts = {}) {
  const label = opts.label || 'Save and Return';
  const handler = async () => {
    try {
      const ret = await saveFn();
      setDirty(false);
      toast('Saved');
      if (ret !== false && opts.returnAfter !== false) navBack();
    } catch (err) {
      if (err && err.message === 'validation') return;
      console.error(err);
      await alertDialog('Error saving: ' + (err?.message || err), 'Error');
    }
  };

  // Inject compact save button into the latest header
  injectTopSaveButton(handler, label);

  return el('div', { style: 'text-align:center; padding:16px 0 24px 0' }, [
    el('button', { class: 'btn btn-save', onclick: handler }, label)
  ]);
}

function injectTopSaveButton(handler, label) {
  const headers = document.getElementsByClassName('header');
  if (!headers || headers.length === 0) return;
  const lastHeader = headers[headers.length - 1];
  // Remove any prior save row to avoid duplication on re-renders
  const existing = lastHeader.querySelector ? lastHeader.querySelector('.hdr-save-row') : null;
  if (existing) existing.remove();
  const row = el('div', { class: 'hdr-row hdr-save-row' }, [
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-save-compact', onclick: handler }, label)
  ]);
  lastHeader.appendChild(row);
}
