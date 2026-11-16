'use strict';

const STORAGE_KEY = 'po-poryadku.tasks.v1';
const form = document.querySelector('#task-form');
const input = document.querySelector('#task-input');
const list = document.querySelector('#task-list');
const error = document.querySelector('#error');
const reset = document.querySelector('#reset');
const status = document.querySelector('#status');
let tasks = [];
let unreadable = false;

function showError(message) {
  error.textContent = message;
  error.hidden = !message;
}

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(task =>
      task && typeof task.id === 'string' && typeof task.text === 'string' &&
      task.text.trim().length > 0 && task.text.length <= 300 && typeof task.done === 'boolean'
    ) || new Set(parsed.map(task => task.id)).size !== parsed.length) {
      throw new Error('Invalid saved tasks');
    }
    tasks = parsed;
  }
} catch {
  unreadable = true;
  showError('Не удалось прочитать сохранённый список. Он не будет перезаписан. Чтобы начать заново, нажмите кнопку ниже.');
  reset.hidden = false;
}

// Persist first: a failed save must not silently discard the previous list or input.
function commit(next, announcement) {
  if (unreadable) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    showError('Не удалось сохранить изменения. Проверьте, разрешено ли браузеру хранить данные сайта, и попробуйте снова.');
    return false;
  }
  tasks = next;
  showError('');
  render();
  status.textContent = announcement;
  return true;
}

function render() {
  list.replaceChildren();
  for (const task of tasks) {
    const row = document.createElement('li');
    row.className = `task${task.done ? ' done' : ''}`;
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.text;
    checkbox.addEventListener('change', () => {
      if (commit(tasks.map(item => item.id === task.id ? {...item, done: checkbox.checked} : item),
        checkbox.checked ? 'Задача выполнена' : 'Задача возвращена в работу')) {
        list.children[tasks.findIndex(item => item.id === task.id)].querySelector('input').focus();
      } else checkbox.checked = task.done;
    });
    label.append(checkbox, text);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete';
    remove.setAttribute('aria-label', `Удалить задачу: ${task.text}`);
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/></svg>';
    remove.addEventListener('click', () => {
      const index = tasks.findIndex(item => item.id === task.id);
      if (commit(tasks.filter(item => item.id !== task.id), 'Задача удалена')) {
        const next = list.children[Math.min(index, list.children.length - 1)];
        (next?.querySelector('.delete') || input).focus();
      }
    });
    row.dataset.id = task.id;
    row.append(label, remove);
    list.append(row);
  }
  document.querySelector('#counter').textContent = `${tasks.filter(task => task.done).length} из ${tasks.length} выполнено`;
  document.querySelector('#empty').hidden = tasks.length > 0;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    input.value = '';
    input.focus();
    return;
  }
  if (commit([...tasks, {id: crypto.randomUUID(), text, done: false}], 'Задача добавлена')) {
    input.value = '';
    input.focus();
  }
});

reset.addEventListener('click', () => {
  if (!confirm('Начать новый список? Ранее сохранённые данные будут удалены.')) return;
  unreadable = false;
  if (commit([], 'Создан новый список')) reset.hidden = true;
  else unreadable = true;
});

render();
