const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], {
    cwd: path.join(__dirname, '..'), stdio: 'ignore'
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
    const input = page.getByRole('textbox', { name: 'Новая задача' });
    const add = async text => { await input.fill(text); await input.press('Enter'); };
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
    await page.getByRole('checkbox').first().uncheck();
    await page.getByRole('button', { name: 'Удалить задачу: <img', exact: false }).click();
    await page.reload();
    assert.equal(await page.locator('.task').count(), 2, 'Deleted task must stay deleted');
    assert.equal(await page.getByRole('checkbox').first().isChecked(), false);
    await add('Отправить тестовое задание');
    await page.getByRole('checkbox').first().check();
    if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/todo-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/todo-mobile.png`, fullPage: true });
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
    await page.getByRole('button', { name: 'Удалить задачу: Новый список работает', exact: true }).click();
    assert.equal(await page.locator('#empty').isVisible(), true);
    await page.reload();
    assert.equal(await page.locator('.task').count(), 0);
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('PASS: add, whitespace, safe text, toggle, delete, reload persistence, empty state, mobile, failed save, corrupt storage recovery.');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
