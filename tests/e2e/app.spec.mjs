// End-to-end: production build + Express server + real Chrome with a fake
// camera device. ?mock=1 swaps MediaPipe for the scriptable hand tracker so
// gestures are deterministic.
import { test, expect } from '@playwright/test';

async function open(page, prefs = {}) {
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      localStorage.setItem('omni.prefs', JSON.stringify({ speech: false, ...p }));
      sessionStorage.setItem('seeded', '1');
    }
  }, prefs);
  await page.goto('/?mock=1');
  await expect(page.getByTestId('reg-badge')).toContainText('AR element verified');
  await page.waitForFunction(() => typeof window.__omni?.pose === 'function');
}

const say = async (page, text) => {
  await page.getByTestId('command-input').fill(text);
  await page.getByTestId('command-send').click();
};

test('opens the camera and verifies + registers the AR element on load @mobile', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('camera-status')).toHaveCount(0);
  await expect.poll(() => page.getByTestId('camera').evaluate((v) => v.videoWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId('reg-receipt')).toContainText('receipt');
  await expect(page.getByTestId('tracker-status')).toContainText('mock');
  // AR layer is live and sized.
  await expect.poll(() => page.getByTestId('ar-layer').evaluate((c) => c.width)).toBeGreaterThan(0);
  // No horizontal page scroll at this viewport.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('hand gestures show wellness tips', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__omni.pose('peace'));
  await expect(page.getByTestId('gesture')).toContainText('Peace');
  await expect(page.getByTestId('twin-says')).toContainText('Two good things');
  await page.evaluate(() => window.__omni.pose('open_palm'));
  await expect(page.getByTestId('gesture')).toContainText('Open palm');
  await expect(page.getByTestId('twin-says')).toContainText('Box breathing');
  await page.evaluate(() => window.__omni.clear());
  await expect(page.getByTestId('gesture')).toContainText('Show a hand');
  await expect(page.getByTestId('activity')).toContainText('Peace → Two good things');
});

test('finger math brain exercise scores answers shown with fingers', async ({ page }) => {
  await open(page);
  await page.getByTestId('tab-train').click();
  await page.getByTestId('start-finger-math').click();
  for (let round = 1; round <= 3; round++) {
    const prompt = await page.getByTestId('exercise-prompt').textContent();
    const [, a, op, b] = /(\d+) ([+−]) (\d+)/.exec(prompt);
    const answer = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
    // Drop the hand first so a repeated answer still registers as a new gesture.
    await page.evaluate(() => window.__omni.clear());
    await expect(page.getByTestId('gesture')).toContainText('Show a hand');
    await page.evaluate((n) => window.__omni.fingers(n), answer);
    // Streak points 1 + 2 + 3 (AP) → score 1, 3, 6.
    await expect(page.getByTestId('exercise-score')).toHaveText(String((round * (round + 1)) / 2));
  }
});

test('breathing exercise follows open palm / fist', async ({ page }) => {
  await open(page);
  await say(page, 'start breathing');
  await expect(page.getByTestId('exercise-prompt')).toContainText('Breathe in');
  await page.evaluate(() => window.__omni.pose('open_palm'));
  await expect(page.getByTestId('exercise-prompt')).toContainText('Breathe out', { timeout: 6000 });
  await page.evaluate(() => window.__omni.pose('fist'));
  await expect(page.getByTestId('twin-says')).toContainText('Breath 1 complete');
});

test('digital bulb: toggle, brightness, tone, ring light and torch fallback', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('bulb-wash')).toBeHidden();
  await page.getByTestId('bulb-toggle').click();
  await expect(page.getByTestId('bulb-wash')).toBeVisible();
  await expect.poll(() => page.getByTestId('camera').evaluate((v) => v.style.filter)).toContain('brightness');

  await say(page, 'brightness 90');
  await expect(page.getByTestId('bulb-level-value')).toHaveText('90%');
  await say(page, 'dimmer');
  await expect(page.getByTestId('bulb-level-value')).toHaveText('75%');
  await say(page, 'warm light');
  await expect(page.getByTestId('twin-says')).toContainText('Warm light');

  await say(page, 'ring light on');
  await expect(page.getByTestId('stage')).toHaveClass(/ring/);
  await expect(page.locator('body')).toHaveClass(/ring-on/);

  // The fake camera has no hardware torch → the digital light takes over at 100%.
  await page.getByTestId('torch-toggle').click();
  await expect(page.getByTestId('bulb-level-value')).toHaveText('100%');
  await expect(page.getByTestId('twin-says')).toContainText('No hardware torch');

  await say(page, 'light off');
  await expect(page.getByTestId('bulb-wash')).toBeHidden();
  // Preferences persist across reloads.
  await page.reload();
  await expect(page.getByTestId('bulb-level-value')).toHaveText('100%');
});

test('voice/typed commands drive the Omni O(1) engine', async ({ page }) => {
  await open(page);
  await say(page, 'sum of cubes from 3 to 7');
  await expect(page.getByTestId('twin-says')).toContainText('775');
  await say(page, 'harmonic sum power 3 from 3 to 7');
  await expect(page.getByTestId('twin-says')).toContainText('0.0682071');
  await say(page, 'geometric sum ratio 2 power 3 for 5 terms');
  await expect(page.getByTestId('twin-says')).toContainText('4681');
  await say(page, 'what can I say');
  await expect(page.getByTestId('help-list')).toContainText('light on');
  await say(page, 'flibbertigibbet');
  await expect(page.getByTestId('twin-says')).toContainText("didn't catch");
});

test('AR twin automates a task and waits only for the human step', async ({ page }) => {
  await open(page, { taskSpeed: 20 });
  await expect(page.getByTestId('twin-idle')).toBeVisible();
  await page.getByTestId('assign-hydrate').click();
  await expect(page.getByTestId('active-task')).toContainText('Hydration');
  await expect(page.getByTestId('confirm-human')).toBeVisible();
  await expect(page.getByTestId('twin-says')).toContainText('Your turn');
  // Thumbs up completes the human part hands-free.
  await page.evaluate(() => window.__omni.pose('thumbs_up'));
  await expect(page.getByTestId('stat-tasks')).toHaveText('1');
  await expect(page.getByTestId('done-list')).toContainText('Hydration');

  // Voice-assigned screen break: lights dim, focus overlay, "done" by voice.
  await page.evaluate(() => window.__omni.clear());
  await say(page, 'I need a screen break');
  await expect(page.getByTestId('focus-overlay')).toBeVisible();
  await expect(page.getByTestId('confirm-human')).toBeVisible();
  await say(page, 'done');
  await expect(page.getByTestId('focus-overlay')).toBeHidden();
  await expect(page.getByTestId('stat-tasks')).toHaveText('2');
  await expect(page.getByTestId('workload')).toContainText('You');
});

test('preferences customise the twin', async ({ page }) => {
  await open(page);
  await page.getByTestId('tab-prefs').click();
  await page.getByTestId('pref-twin-name').fill('Nova');
  await expect(page.getByTestId('twin-toggle')).toContainText('Nova');
  await page.getByRole('button', { name: 'Bot' }).click();
  await page.reload();
  await expect(page.getByTestId('twin-toggle')).toContainText('Nova');
});

test('Omni ID: create once, prove ownership, back up and restore', async ({ page }) => {
  await open(page, { displayName: 'Kumaran' });
  await page.getByTestId('tab-id').click();
  await page.getByTestId('create-id').click();
  await expect(page.getByTestId('id-card')).toContainText('Kumaran');
  const id = await page.getByTestId('id-value').textContent();
  await expect(page.getByTestId('id-status')).toContainText('registered');

  await page.getByTestId('prove-id').click();
  await expect(page.getByTestId('id-status')).toContainText('Ownership proven');

  await page.getByTestId('id-pass').fill('my long passphrase');
  const download = page.waitForEvent('download');
  await page.getByTestId('export-id').click();
  expect((await download).suggestedFilename()).toMatch(/^omni-id-.*\.json$/);
  const bundle = await page.getByTestId('id-bundle').inputValue();
  expect(JSON.parse(bundle).schema).toBe('omni-id-bundle/1');

  // "Another device": wipe local identity, then import the backup.
  await page.getByRole('button', { name: /Remove from this device/ }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByTestId('create-id')).toBeVisible();
  await page.getByTestId('id-bundle').fill(bundle);
  await page.getByTestId('import-id').click();
  await expect(page.getByTestId('id-value')).toHaveText(id);
  await page.getByTestId('prove-id').click();
  await expect(page.getByTestId('id-status')).toContainText('Ownership proven');
});

test('Omni Lab computes in browser and server and runs the verification suite', async ({ page }) => {
  await open(page);
  await page.getByTestId('tab-lab').click();
  await page.getByTestId('lab-run').click();
  await expect(page.getByTestId('lab-value')).toHaveText('775');
  await page.getByTestId('lab-ap-L').fill('1000000000000000000000000000000');
  await page.getByTestId('lab-ap-p').fill('30');
  await page.getByTestId('lab-run-server').click();
  await expect(page.getByTestId('lab-result')).toContainText('digits');
  await page.getByTestId('lab-lattice').click();
  await page.getByTestId('lab-run').click();
  await expect(page.getByTestId('lab-result')).toContainText('separable product');
  await page.getByTestId('lab-verify').click();
  await expect(page.getByTestId('lab-failures')).toHaveText('0');
});

test('a tampered AR registration disables the AR element', async ({ page }) => {
  await page.route('**/api/ar/registry', async (route) => {
    const res = await route.fetch();
    const reg = await res.json();
    reg.element.capabilities.push('keylogger');
    await route.fulfill({ response: res, json: reg });
  });
  await page.goto('/?mock=1');
  await expect(page.getByTestId('reg-badge')).toContainText('registration failed');
  await expect(page.getByTestId('reg-badge')).toContainText('integrity');
  await page.getByTestId('assign-hydrate').click();
  await expect(page.getByTestId('twin-says')).toContainText('disabled until its registration verifies');
  await expect(page.getByTestId('mic-toggle')).toBeDisabled();
});

test('real-AR button reports support honestly on non-AR browsers', async ({ page }) => {
  await open(page);
  const btn = page.getByTestId('xr-button');
  await expect(btn).toContainText('Android + Chrome only');
  await expect(btn).toBeDisabled();
});
