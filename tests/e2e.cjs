const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], {
    cwd: path.join(__dirname, '..', 'docs'), stdio: 'ignore'
  });
  let browser;
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch('http://127.0.0.1:8766')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8766');
    assert.equal(await page.getByRole('button', { name: 'Добавить задачу' }).count(), 0, 'Add button is hidden until text is entered');
    assert.equal(await page.locator('#task-input').getAttribute('required'), null, 'No English browser validation bubble');
    const input = page.getByRole('textbox', { name: 'Новая задача' });
    const add = async text => { await input.fill(text); await input.press('Enter'); };
    const removeTask = async text => {
      const started = Date.now();
      await page.getByRole('button', {name:`Удалить задачу: ${text}`,exact:true}).click();
      assert.equal(await page.locator('#task-list').getByText(text,{exact:true}).isVisible(),true, 'Task remains during countdown');
      assert.equal(await page.evaluate(text => JSON.parse(localStorage.getItem('po-poryadku.tasks.v1')).some(task => task.text===text), text), true, 'Storage is unchanged until deadline');
      await page.locator('#task-list').getByText(text,{exact:true}).waitFor({state:'detached',timeout:5000});
      assert.ok(Date.now()-started >= 2900, 'Delete waits three seconds');
    };
    await input.press('Enter');
    assert.equal(await page.locator('.task').count(), 0);
    await add('   ');
    assert.equal(await page.locator('.task').count(), 0, 'Whitespace must not create a task');
    await add('Собрать портфолио');
    await input.fill('Подготовиться к собеседованию');
    await page.getByRole('button', { name: 'Добавить задачу' }).click();
    await add('<img src=x onerror="window.injected=true">');
    assert.equal(await page.locator('.task').count(), 3);
    assert.equal(await page.locator('.task img').count(), 0, 'Task text must not become HTML');
    await page.getByRole('checkbox').first().check();
    await page.reload();
    assert.equal(await page.locator('.task').count(), 3, 'Tasks must survive reload');
    assert.equal(await page.getByRole('checkbox').first().isChecked(), true, 'Completion must survive reload');
    await page.getByRole('button',{name:'Выполненные',exact:true}).click();
    assert.equal(await page.locator('#task-list .task').count(),1);
    await page.getByRole('button',{name:'В работе',exact:true}).click();
    assert.equal(await page.locator('#task-list .task').count(),2);
    await page.getByRole('button',{name:'Все',exact:true}).click();
    assert.equal(await page.locator('#task-list .task').count(),3);
    await page.getByRole('button',{name:'Удалить задачу: Собрать портфолио',exact:true}).click();
    await page.getByRole('button',{name:'Отменить удаление: Собрать портфолио',exact:true}).click();
    await page.waitForTimeout(3100);
    assert.equal(await page.locator('#task-list .task').count(),3,'Cancelled deletion never fires');
    await page.getByRole('checkbox').first().uncheck();
    await removeTask('<img src=x onerror="window.injected=true">');
    await page.reload();
    assert.equal(await page.locator('.task').count(), 2, 'Deleted task must stay deleted');
    assert.equal(await page.getByRole('checkbox').first().isChecked(), false);
    await add('Отправить тестовое задание');
    await page.getByRole('checkbox').first().check();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.task-panel').parentElement).opacity) > .99);
    if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/todo-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.task-panel').parentElement).opacity) > .99);
    if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/todo-mobile.png`, fullPage: true });
    await input.fill('Проверить выравнивание');
    const buttonBox = await page.locator('.add').boundingBox();
    const plusBox = await page.locator('.add svg').boundingBox();
    assert.ok(Math.abs(buttonBox.x + buttonBox.width / 2 - plusBox.x - plusBox.width / 2) < 1, 'Plus is horizontally centered on mobile');
    assert.ok(Math.abs(buttonBox.y + buttonBox.height / 2 - plusBox.y - plusBox.height / 2) < 1, 'Plus is vertically centered on mobile');
    await add('ОченьДлиннаяЗадача'.repeat(15));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile must not overflow');
    // A failed save must keep the last successful data and the unsaved input.
    const before = await page.evaluate(() => localStorage.getItem('po-poryadku.tasks.v1'));
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Quota exceeded'); }; });
    await add('Не потерять этот текст');
    assert.equal(await input.inputValue(), 'Не потерять этот текст');
    assert.equal(await page.locator('#error').isVisible(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('po-poryadku.tasks.v1')), before);
    await page.reload();
    await page.evaluate(() => localStorage.setItem('po-poryadku.tasks.v1', '{broken-json'));
    await page.reload();
    assert.equal(await page.locator('#reset').isVisible(), true);
    await add('Не перезаписывать повреждённый список');
    assert.equal(await page.evaluate(() => localStorage.getItem('po-poryadku.tasks.v1')), '{broken-json');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#reset').click();
    await add('Новый список работает');
    await page.reload();
    assert.equal(await page.locator('.task-text').textContent(), 'Новый список работает');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.task-panel').parentElement).visibility !== 'hidden');
    await page.getByRole('checkbox').check();
    assert.equal(await page.locator('.task').evaluate(el => el.classList.contains('done')), true);
    await removeTask('Новый список работает');
    assert.equal(await page.locator('#empty').isVisible(), true);
    await page.reload();
    assert.equal(await page.locator('.task').count(), 0);
    await page.evaluate(() => localStorage.setItem('po-poryadku.tasks.v1', JSON.stringify([{id:'legacy-task', text:'Задача из предыдущей версии', done:true}])));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    assert.equal(await page.locator('.task-text').textContent(), 'Задача из предыдущей версии');
    assert.equal(await page.getByRole('checkbox').isChecked(), true, 'Previous version storage is preserved');
    await page.getByRole('button', {name:'Удалить задачу: Задача из предыдущей версии'}).click();
    await add('Задача, добавленная во время отсчёта');
    await page.getByRole('checkbox').last().check();
    await page.waitForFunction(() => document.querySelectorAll('.task-particle').length === 28, {timeout:5000});
    await page.locator('.dissolve-layer').waitFor({state:'detached'});
    assert.equal(await page.locator('#task-list .task-text').textContent(), 'Задача, добавленная во время отсчёта');
    assert.equal(await page.getByRole('checkbox').isChecked(),true,'Concurrent edits survive delayed deletion');
    await page.reload();
    assert.equal(await page.locator('#task-list .task-text').textContent(), 'Задача, добавленная во время отсчёта');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('PASS: add, whitespace, safe text, toggle, filters, 3-second delete, cancel, concurrent edits, reload persistence, empty state, mobile, failed save, corrupt storage recovery.');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
