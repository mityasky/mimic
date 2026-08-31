// tests/setup.js — Настройка тестового окружения

// Мок localStorage (используем let для возможности переназначения)
let store = {};
const localStorageMock = {
  getItem: (key) => store[key] || null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: (key) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (i) => Object.keys(store)[i] || null,
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Мок localforage (упрощённая версия IndexedDB)
let forageStore = {};
const localforageMock = {
  config: () => {},
  getItem: async (key) => forageStore[key] ?? null,
  setItem: async (key, value) => { forageStore[key] = value; return value; },
  removeItem: async (key) => { delete forageStore[key]; },
  clear: async () => { Object.keys(forageStore).forEach(k => delete forageStore[k]); },
  keys: async () => Object.keys(forageStore),
  length: async () => Object.keys(forageStore).length,
  INDEXEDDB: 'asyncStorage',
  LOCALSTORAGE: 'localStorageWrapper',
  WEBSQL: 'webSQLStorage',
};

globalThis.localforage = localforageMock;

// Мок Chart.js
globalThis.Chart = {
  getChart: () => null,
};

// Мок requestAnimationFrame
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// Функция создания мок-элемента
function createMockElement(id, tag = 'div') {
  const el = document.createElement(tag);
  el.id = id;
  el.textContent = '';
  el.classList = {
    add: () => {},
    remove: () => {},
    contains: () => false,
    toggle: () => {},
  };
  el.style = {};
  el.hidden = false;
  el.innerHTML = '';
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  el.querySelector = () => null;
  el.querySelectorAll = () => [];
  el.appendChild = (child) => child;
  el.removeChild = (child) => child;
  // ❌ УДАЛЕНО: el.firstElementChild = null; (это свойство только для чтения)
  return el;
}

// Создаём базовые элементы DOM
const requiredElements = [
  'camera-feed', 'feedback', 'score', 'high-score', 'emotion-name',
  'emotion-image', 'detected-emotion', 'difficulty-slider',
  'progress-modal', 'stat-sessions', 'stat-streak', 'stat-accuracy',
  'progress-chart-data', 'advanced-stats-modal',
  'advanced-emotion-radar-chart', 'advanced-emotion-stats-tbody',
  'clear-advanced-stats-btn', 'stats-time-filter',
  'portrait-readiness-block', 'portrait-content-block',
  'portrait-trend-chart', 'error-matrix-container',
  'psychologist-report', 'hard-progress',
];

beforeEach(() => {
  document.body.innerHTML = '';
  requiredElements.forEach(id => {
    const el = createMockElement(id);
    document.body.appendChild(el);
  });
});

afterEach(() => {
  // ✅ Исправлено: очищаем объекты вместо переназначения
  Object.keys(store).forEach(k => delete store[k]);
  Object.keys(forageStore).forEach(k => delete forageStore[k]);
  document.body.innerHTML = '';
});

console.log('✅ Test environment initialized (jsdom + localStorage + localforage mocks)');