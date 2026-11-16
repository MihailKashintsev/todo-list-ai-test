import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AnimatedContent from './components/AnimatedContent';
import '../styles.css';
import { dissolve, reducedMotion } from './motion';

const STORAGE_KEY = 'po-poryadku.tasks.v1';
const ease = 'cubic-bezier(0.23, 1, 0.32, 1)';
const storageMessage = 'Не удалось прочитать сохранённый список. Он не будет перезаписан. Чтобы начать заново, нажмите кнопку ниже.';

function readStoredTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const tasks = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(tasks) || !tasks.every(task => task && typeof task.id === 'string' &&
      typeof task.text === 'string' && task.text.trim().length > 0 && task.text.length <= 300 &&
      typeof task.done === 'boolean') || new Set(tasks.map(task => task.id)).size !== tasks.length) {
      throw new Error('Invalid saved tasks');
    }
    return { tasks, error: '', blocked: false };
  } catch { return { tasks: [], error: storageMessage, blocked: true }; }
}

function Icon({ name, ...props }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    leaf: <><path d="M19 4C8 3 3 8 5 15c7 3 14-2 14-11Z" /><path d="M5 20 15 9" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function Task({ task, onToggle, onRemove, onCancel, remaining, animate, register }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = ref.current.animate([
      { opacity: 0, transform: 'translateY(10px) scale(0.98)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ], { duration: 240, easing: ease });
    return () => animation.cancel();
  }, []);
  return <li ref={ref} className={`task${task.done ? ' done' : ''}`}>
    <label>
      <input type="checkbox" className="task-check" checked={task.done} onChange={event => onToggle(task.id, event.target.checked)} />
      <span className="check-visual"><Icon name="check" /></span>
      <span className="task-text"><span className="task-words">{task.text}</span></span>
    </label>
    <div className="task-actions" ref={node => register(task.id, node)}>
      {remaining ? <div className="delete-countdown"><span>Удаление через {remaining} с</span><button type="button" className="cancel-delete" aria-label={`Отменить удаление: ${task.text}`} onClick={() => onCancel(task.id)}>Отменить</button></div>
        : <button type="button" className="delete" aria-label={`Удалить задачу: ${task.text}`} onClick={() => onRemove(task.id)}><Icon name="trash" /></button>}
    </div>
  </li>;
}

function App() {
  const [initial] = useState(readStoredTasks);
  const [tasks, setTasks] = useState(initial.tasks);
  const [error, setError] = useState(initial.error);
  const [blocked, setBlocked] = useState(initial.blocked);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [newId, setNewId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState({});
  const [now, setNow] = useState(Date.now());
  const removalTimers = useRef(new Map());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const input = useRef(null);
  const keyboardSubmit = useRef(false);
  const previousPositions = useRef(new Map());
  const previousPanelHeight = useRef(0);
  const deleteButtons = useRef(new Map());
  const focusAfterDelete = useRef(undefined);
  const visibleTasks = tasks.filter(task => filter === 'all' || (filter === 'done' ? task.done : !task.done));
  useEffect(() => {
    if (!Object.keys(pending).length) return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [pending]);
  useEffect(() => () => { for (const timer of removalTimers.current.values()) clearTimeout(timer); }, []);
  const completed = tasks.filter(task => task.done).length;
  const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const allDone = tasks.length > 0 && completed === tasks.length;
  useLayoutEffect(() => {
    if (!reducedMotion()) {
      for (const [id, top] of previousPositions.current) {
        const row = id === '__summary' ? document.querySelector('.list-summary') : deleteButtons.current.get(id)?.closest('li');
        if (!row) continue;
        const delta = top - row.getBoundingClientRect().top;
        if (delta) row.animate([{transform: `translateY(${delta}px)`}, {transform: 'translateY(0)'}], {duration: 240, easing: ease});
      }
    }
    if (previousPanelHeight.current && !reducedMotion()) {
      const panel = document.querySelector('.task-panel');
      const nextHeight = panel.getBoundingClientRect().height;
      panel.animate([{height: `${previousPanelHeight.current}px`}, {height: `${nextHeight}px`}], {duration: 240, easing: ease});
    }
    previousPanelHeight.current = 0;
    previousPositions.current.clear();
    if (focusAfterDelete.current === undefined) return;
    (deleteButtons.current.get(focusAfterDelete.current)?.querySelector('button') || input.current).focus();
    focusAfterDelete.current = undefined;
  }, [tasks, pending]);

  function commit(next, announcement, force = false) {
    if (blocked && !force) return false;
    // Save before updating UI so a failed write never discards tasks or the input.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch {
      setError('Не удалось сохранить изменения. Проверьте, разрешено ли браузеру хранить данные сайта, и попробуйте снова.');
      return false;
    }
    tasksRef.current = next;
    setTasks(next);
    setError('');
    setStatus(announcement);
    return true;
  }
  function add(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) { setText(''); input.current.focus(); return; }
    const id = crypto.randomUUID();
    if (commit([...tasksRef.current, { id, text: trimmed, done: false }], 'Задача добавлена')) {
      setNewId(keyboardSubmit.current ? null : id);
      setText(''); input.current.focus();
    }
  }
  function remove(id) {
    const current = tasksRef.current;
    const index = current.findIndex(task => task.id === id);
    const next = current.filter(task => task.id !== id);
    const row = deleteButtons.current.get(id)?.closest('li');
    const positions = new Map([...deleteButtons.current].map(([key, button]) => [key, button.closest('li').getBoundingClientRect().top]));
    positions.set('__summary', document.querySelector('.list-summary').getBoundingClientRect().top);
    const panelHeight = document.querySelector('.task-panel').getBoundingClientRect().height;
    if (commit(next, 'Задача удалена')) {
      previousPanelHeight.current = panelHeight;
      previousPositions.current = positions;
      dissolve(row);
      focusAfterDelete.current = next[Math.min(index, next.length - 1)]?.id ?? null;
    }
  }
  function cancelRemoval(id) {
    focusAfterDelete.current = id;
    clearTimeout(removalTimers.current.get(id));
    removalTimers.current.delete(id);
    setPending(current => { const next = {...current}; delete next[id]; return next; });
    setStatus('Удаление отменено');
  }
  function scheduleRemoval(id) {
    if (removalTimers.current.has(id)) return;
    const deadline = Date.now() + 3000;
    setNow(Date.now());
    setPending(current => ({...current, [id]: deadline}));
    setStatus('Задача будет удалена через 3 секунды. Можно отменить.');
    removalTimers.current.set(id, setTimeout(() => {
      removalTimers.current.delete(id);
      setPending(current => { const next = {...current}; delete next[id]; return next; });
      remove(id);
    }, 3000));
  }
  return <main className="workspace">
    <nav className="topbar" aria-label="Заголовок приложения">
      <a className="brand" href="#top" aria-label="По порядку — в начало"><span className="brand-icon"><Icon name="check" /></span>по порядку<span className="brand-period">.</span></a>
      <span className="private-note"><Icon name="lock" /> Только для вас</span>
    </nav>
    <header id="top" className="hero">
      <AnimatedContent trigger="mount" distance={16} duration={0.28} ease="power3.out">
        <p className="eyebrow"><span /> МЕСТО ДЛЯ ВАЖНОГО</p>
        <h1>Меньше в голове.<br /><em>Больше сделано.</em></h1>
        <p className="intro">Большие планы начинаются с маленьких шагов.<br className="desktop-break" /> Освободите мысли — запишите их здесь.</p>
      </AnimatedContent>
      <AnimatedContent trigger="mount" distance={12} delay={0.06} duration={0.28} className="progress-wrap">
        <div className={`progress-card${allDone ? ' complete' : ''}`}>
          <span className="progress-eyebrow">ВАШ МАЛЕНЬКИЙ ПРОГРЕСС</span>
          <div className="progress-ring" aria-hidden="true">
            <svg viewBox="0 0 140 140"><circle className="ring-track" cx="70" cy="70" r="60" /><circle className="ring-value" cx="70" cy="70" r="60" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - percent} /></svg>
            <div className="ring-number">{percent}<span>%</span></div>
          </div>
          <p>{allDone ? 'Всё сделано. Вы молодец!' : 'Одно дело — уже движение.'}</p>
          <span className="progress-caption">{completed} из {tasks.length} выполнено</span>
          <span className="leaf-stamp" aria-hidden="true"><Icon name="leaf" /></span>
        </div>
      </AnimatedContent>
    </header>
    <AnimatedContent trigger="mount" distance={12} delay={0.1} duration={0.28}>
      <section className="task-panel" aria-labelledby="list-heading">
        <div className="panel-heading"><div><p className="panel-kicker">ШАГ ЗА ШАГОМ</p><h2 id="list-heading">Мои задачи<span className="count-badge">{tasks.length}</span></h2></div><span className="today-label">{new Intl.DateTimeFormat('ru', {day:'numeric', month:'long'}).format(new Date())}</span></div>
        <form id="task-form" className={text.trim() ? "has-text" : ""} onSubmit={add} noValidate onKeyDown={event => { keyboardSubmit.current = event.key === "Enter"; }}>
          <label className="sr-only" htmlFor="task-input">Новая задача</label>
          <input ref={input} id="task-input" name="task" placeholder="Что нужно сделать?" maxLength={300} autoComplete="off" value={text} onChange={event => setText(event.target.value)} />
          <span className="enter-hint" aria-hidden="true">Enter ↵</span>
          <button className="add" type="submit" aria-label="Добавить задачу" aria-hidden={!text.trim()} tabIndex={text.trim() ? 0 : -1} disabled={!text.trim()} onPointerDown={() => { keyboardSubmit.current = false; }}><Icon name="plus" /><span>Добавить</span></button>
        </form>
        <div id="error" className="error" role="alert" hidden={!error}>{error}</div>
        <button id="reset" type="button" hidden={!blocked} onClick={() => {
          if (confirm('Начать новый список? Ранее сохранённые данные будут удалены.') && commit([], 'Создан новый список', true)) setBlocked(false);
        }}>Начать новый список</button>
        <div className="filters" role="group" aria-label="Фильтр задач">
          {[['all','Все',tasks.length],['active','В работе',tasks.length-completed],['done','Выполненные',completed]].map(([key,label,count]) => <button type="button" key={key} aria-label={label} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span>{count}</span></button>)}
        </div>
        <ul id="task-list" aria-label="Список задач">{visibleTasks.map(task => <Task key={task.id} task={task} animate={task.id === newId} register={(id,node) => node ? deleteButtons.current.set(id,node) : deleteButtons.current.delete(id)} onRemove={scheduleRemoval} onCancel={cancelRemoval} remaining={pending[task.id] ? Math.max(1,Math.ceil((pending[task.id]-now)/1000)) : 0} onToggle={(id, done) => commit(tasksRef.current.map(item => item.id === id ? {...item,done} : item), done ? 'Задача выполнена' : 'Задача возвращена в работу')} />)}</ul>
        <div id="empty" className="empty" hidden={visibleTasks.length > 0}>
          <svg hidden={tasks.length > 0} className="drawn-arrow" viewBox="0 0 112 66" fill="none" aria-hidden="true"><path className="arrow-stem" pathLength="1" d="M85 57C55 61 22 49 26 24c2-10 11-16 24-17"/><path className="arrow-head" pathLength="1" d="m41 2 11 5-7 11"/></svg>
          <div className="empty-art" aria-hidden="true"><span className="paper paper-back" /><span className="paper paper-front"><i /><i /><i /><span className="paper-check"><Icon name="check" /></span></span><span className="art-spark">✦</span></div>
          <h3>{tasks.length === 0 ? 'С чего начнём?' : filter === 'done' ? 'Всё ещё впереди' : 'Все дела сделаны'}</h3><p>{tasks.length === 0 ? <>Одно небольшое дело — отличный старт.<br />Добавьте первую задачу в строке выше.</> : filter === 'done' ? 'Здесь появятся задачи, которые вы отметите выполненными.' : 'Можно выдохнуть или записать что-нибудь новое.'}</p>
        </div>
        <div className="list-summary"><span id="counter">{completed} из {tasks.length} выполнено</span><span className="summary-note">{allDone ? 'Можно выдохнуть' : 'В своём темпе'}<Icon name={allDone ? 'check' : 'leaf'} /></span></div>
        <p id="status" className="sr-only" role="status" aria-live="polite">{status}</p>
      </section>
    </AnimatedContent>
    <footer><span><span className="storage-dot" /> Список сохраняется в этом браузере</span><span className="footer-signature">Маленькие шаги. Большие перемены.</span></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
