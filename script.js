// ====== Состояние приложения ======
const form = document.getElementById('card-form');
const input = document.getElementById('card-input');
const addBtn = document.getElementById('add-btn');
const clearBtn = document.getElementById('clear-btn');
const cardsRoot = document.getElementById('cards');

let cards = [];               // [{ id: string, text: string }]
let lastSnapshot = null;      // для отмены (Esc) при редактировании

// ====== Инициализация ======
init();

function init() {
  // 1) загрузить из localStorage
  try {
    const raw = localStorage.getItem('cards');
    cards = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Не удалось прочитать localStorage, начнём с пустого набора.', e);
    cards = [];
  }

  // 2) отрисовать
  render();

  // 3) обработчики
  form.addEventListener('submit', onAdd);
  clearBtn.addEventListener('click', onClearAll);

  // делегирование событий внутри списка карточек
  cardsRoot.addEventListener('click', onCardsClick);
  cardsRoot.addEventListener('keydown', onCardsKeydown);
  cardsRoot.addEventListener('blur', onCardsBlur, true); // useCapture для ловли blur
}

// ====== Работа с localStorage ======
function persist() {
  try {
    localStorage.setItem('cards', JSON.stringify(cards));
  } catch (e) {
    console.warn('Не удалось сохранить в localStorage.', e);
  }
}

// ====== Рендер ======
function render() {
  // очистить контейнер
  cardsRoot.innerHTML = '';

  // если пусто — показать подсказку
  if (!cards.length) {
    const empty = document.createElement('div');
    empty.className = 'badge';
    empty.innerHTML = 'Пока пусто. Добавьте первую карточку ↑';
    cardsRoot.appendChild(empty);
    return;
  }

  // создать DOM для каждой карточки
  for (const card of cards) {
    cardsRoot.appendChild(createCardElement(card));
  }
}

function createCardElement(card) {
  const wrapper = document.createElement('article');
  wrapper.className = 'card';
  wrapper.setAttribute('role', 'listitem');
  wrapper.dataset.id = card.id;

  // Текст (contenteditable)
  const text = document.createElement('div');
  text.className = 'card-text';
  text.setAttribute('contenteditable', 'true');
  text.setAttribute('spellcheck', 'false');
  text.setAttribute('aria-label', 'Текст карточки (редактируемый)');
  text.textContent = card.text;

  // Кнопки справа
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.type = 'button';
  editBtn.title = 'Редактировать';
  editBtn.setAttribute('aria-label', 'Редактировать');
  editBtn.dataset.action = 'edit';
  editBtn.innerHTML = '<span class="icon">✏️</span>';

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn';
  delBtn.type = 'button';
  delBtn.title = 'Удалить';
  delBtn.setAttribute('aria-label', 'Удалить');
  delBtn.dataset.action = 'delete';
  delBtn.innerHTML = '<span class="icon">🗑️</span>';

  actions.append(editBtn, delBtn);

  // бейдж с подсказкой (можно убрать)
  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.innerHTML = 'Двойной клик по тексту — начать редактирование. Enter — сохранить. Esc — отмена.';

  wrapper.append(text, actions, badge);
  return wrapper;
}

// ====== Обработчики верхней панели ======
function onAdd(e) {
  e.preventDefault();
  const val = (input.value || '').trim();
  if (!val) {
    input.focus();
    return;
  }
  const card = { id: genId(), text: val };
  cards.unshift(card); // добавляем в начало
  persist();
  render();

  input.value = '';
  input.focus();
}

function onClearAll() {
  if (!cards.length) return;
  if (!confirm('Удалить все карточки?')) return;
  cards = [];
  persist();
  render();
}

// ====== Делегирование событий по списку карточек ======
function onCardsClick(e) {
  const actionBtn = e.target.closest('[data-action]');
  const cardEl = e.target.closest('.card');
  if (!cardEl) return;

  const id = cardEl.dataset.id;

  // Кнопки "редактировать" / "удалить"
  if (actionBtn) {
const action = actionBtn.dataset.action;
    if (action === 'delete') {
      removeCard(id);
    } else if (action === 'edit') {
      startEdit(cardEl);
    }
    return;
  }

  // Двойной клик по тексту — начать редактирование
  const textEl = e.target.closest('.card-text');
  if (textEl && e.detail === 2) {
    startEdit(cardEl);
  }
}

function onCardsKeydown(e) {
  const textEl = e.target.closest('.card-text');
  const cardEl = e.target.closest('.card');
  if (!textEl || !cardEl) return;

  // Enter — сохранить (но не перенос строки)
  if (e.key === 'Enter') {
    e.preventDefault();
    finishEdit(cardEl, /* cancel = */ false);
  }

  // Esc — отменить
  if (e.key === 'Escape') {
    e.preventDefault();
    finishEdit(cardEl, /* cancel = */ true);
  }
}

// Потеря фокуса — тоже считаем как «сохранить»
function onCardsBlur(e) {
  const textEl = e.target.closest('.card-text');
  if (!textEl) return;
  const cardEl = textEl.closest('.card');
  if (!cardEl) return;
  finishEdit(cardEl, /* cancel = */ false);
}

// ====== CRUD-операции ======
function removeCard(id) {
  const i = cards.findIndex(c => c.id === id);
  if (i === -1) return;
  cards.splice(i, 1);
  persist();
  render();
}

function startEdit(cardEl) {
  const id = cardEl.dataset.id;
  const textEl = cardEl.querySelector('.card-text');
  if (!textEl) return;

  // снимок для возможной отмены
  lastSnapshot = textEl.textContent;

  // поставить фокус и курсор в конец
  textEl.focus();
  placeCaretAtEnd(textEl);

  // визуально пометить
  cardEl.setAttribute('aria-busy', 'true');
}

function finishEdit(cardEl, cancel = false) {
  const id = cardEl.dataset.id;
  const textEl = cardEl.querySelector('.card-text');
  if (!textEl) return;

  if (cancel && lastSnapshot !== null) {
    // откатить текст
    textEl.textContent = lastSnapshot;
  } else {
    // сохранить обновление
    const next = (textEl.textContent || '').trim();
    const idx = cards.findIndex(c => c.id === id);
    if (idx !== -1) {
      // пустой текст — удаляем карточку
      if (!next) {
        cards.splice(idx, 1);
      } else {
        cards[idx].text = next;
      }
      persist();
    }
  }

  lastSnapshot = null;
  cardEl.removeAttribute('aria-busy');
  render(); // перерисуем, чтобы очистить возможные артефакты
}

// ====== Утилиты ======
function genId() {
  // простой уникальный id
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function placeCaretAtEnd(el) {
  // корректно ставим курсор в конец contenteditable
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}