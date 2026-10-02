// End-to-end: the production build served as static files (as on Netlify /
// Render — no server API) + real Chrome with a fake camera device. ?mock=1 swaps MediaPipe for the scriptable hand tracker so
// gestures are deterministic.
import { test, expect } from '@playwright/test';

// A scriptable SpeechRecognition, so the real voice pipeline (auto-start,
// recognition events, parsing, dispatch) runs in headless Chrome.
function installFakeSpeech() {
  window.__speech = {
    recs: [],
    say(text) {
      const r = this.recs.filter((x) => x.running).at(-1);
      if (!r) throw new Error('microphone is not listening');
      const result = [{ transcript: text }];
      result.isFinal = true;
      r.onresult?.({ resultIndex: 0, results: [result] });
    },
  };
  class FakeRecognition {
    constructor() {
      this.running = false;
      window.__speech.recs.push(this);
    }
    start() {
      this.running = true;
    }
    stop() {
      this.running = false;
      this.onend?.();
    }
    abort() {
      this.stop();
    }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
}

async function open(page, prefs = {}, { start = true } = {}) {
  await page.addInitScript(installFakeSpeech);
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
  if (start) {
    await page.getByTestId('ar-start').click();
    await expect(page.getByTestId('ar-gate')).toHaveCount(0);
  }
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

/** Show a gesture until the app reports it (= its action fired), then drop the hand. */
async function gesture(page, pose, label) {
  await page.evaluate((g) => window.__omni.pose(g), pose);
  await expect(page.getByTestId('gesture')).toContainText(label);
  await page.evaluate(() => window.__omni.clear());
  await expect(page.getByTestId('gesture')).toContainText('Show a hand');
}

const speak = (page, text) => page.evaluate((t) => window.__speech.say(t), text);

test('voice → AR notes, hands-free: notepad dictation, sticky note, document — no Send button', async ({ page }) => {
  await open(page);
  // The microphone started by itself when AR started.
  await expect(page.getByTestId('mic-toggle')).toContainText('Listening');

  await speak(page, 'take a note called Shopping list');
  await expect(page.getByTestId('ar-note')).toContainText('Shopping list');
  await expect(page.getByTestId('stage')).toHaveAttribute('data-anchor', 'writing');
  await expect(page.getByTestId('voice-caption')).toContainText('Shopping list');

  const text = page.getByTestId('ar-note-text');
  await speak(page, 'milk comma eggs period');
  await speak(page, 'light on'); // while dictating this is text, not a command
  await expect(text).toContainText('Milk, eggs. Light on');
  await expect(page.getByTestId('bulb-wash')).toBeHidden();
  await speak(page, 'scratch that');
  await expect(text).not.toContainText('Light on');
  await speak(page, 'new line');
  await speak(page, 'bread and butter');
  await expect(text).toContainText('Bread and butter');
  await speak(page, 'stop dictation');
  await expect(page.getByTestId('twin-says')).toContainText('Saved “Shopping list”');

  await speak(page, 'light on'); // a command again
  await expect(page.getByTestId('bulb-wash')).toBeVisible();

  await speak(page, 'yellow sticky note call Mum at five');
  await expect(page.getByTestId('ar-sticky')).toContainText('Call Mum at five');

  await speak(page, 'new document called Project plan');
  await speak(page, 'heading budget');
  await speak(page, 'we spend less period');
  await speak(page, "that's all");
  await expect(text).toContainText('Budget');
  await expect(text).toContainText('We spend less.');

  await expect(page.getByTestId('note-list')).toContainText('Shopping list');
  await expect(page.getByTestId('note-list')).toContainText('Project plan');
  await expect(page.getByTestId('note-list')).toContainText('Call Mum at five');

  // Everything is saved on the device.
  await page.reload();
  await page.getByTestId('ar-start').click();
  await expect(page.getByTestId('ar-sticky')).toContainText('Call Mum at five');
  await speak(page, 'open note shopping');
  await expect(page.getByTestId('ar-note-text')).toContainText('Milk, eggs.');
});

test('gesture → AR actions: ✌️ note, ☝️ new line, 👎 undo, ✊ save, 🤘 sticky, 🤙 read back', async ({ page }) => {
  await open(page);
  const text = page.getByTestId('ar-note-text');

  await gesture(page, 'peace', 'Peace');
  await expect(page.getByTestId('ar-note')).toBeVisible();
  await expect(page.getByTestId('activity')).toContainText('Peace → 📝 Take a note');
  await say(page, 'hello world');
  await expect(text).toContainText('Hello world');

  await gesture(page, 'point', 'Pointing');
  await say(page, 'second line');
  await expect(text).toContainText('Second line');

  await gesture(page, 'thumbs_down', 'Thumbs down');
  await expect(text).not.toContainText('Second line');

  await gesture(page, 'fist', 'Fist');
  await expect(page.getByTestId('twin-says')).toContainText('Saved');

  await gesture(page, 'rock', 'Rock on');
  await expect(page.getByTestId('ar-sticky')).toHaveCount(1);
  await say(page, 'buy stamps');
  await expect(page.getByTestId('ar-sticky')).toContainText('Buy stamps');

  await page.waitForTimeout(1600); // per-gesture cooldown
  await gesture(page, 'fist', 'Fist');
  await gesture(page, 'call_me', 'Call me');
  await expect(page.getByTestId('twin-says')).toContainText('📖 Buy stamps');
});

test('voice and gesture inputs are detached: switch each off, remap a gesture', async ({ page }) => {
  await open(page);
  await page.getByTestId('tab-gestures').click();

  await page.getByTestId('gesture-actions').uncheck();
  await gesture(page, 'peace', 'Peace');
  await expect(page.getByTestId('ar-note')).toHaveCount(0);

  await page.getByTestId('gesture-actions').check();
  await page.getByTestId('map-peace').selectOption('bulb-toggle');
  await gesture(page, 'peace', 'Peace');
  await expect(page.getByTestId('bulb-wash')).toBeVisible();
  await expect(page.getByTestId('last-gesture-action')).toContainText('Digital bulb');

  await page.getByTestId('voice-actions').uncheck();
  await speak(page, 'take a note');
  await expect(page.getByTestId('ar-note')).toHaveCount(0);
  await page.getByTestId('voice-actions').check();
  await speak(page, 'take a note');
  await expect(page.getByTestId('ar-note')).toBeVisible();

  // The mapping is a saved preference.
  await page.reload();
  await page.getByTestId('ar-start').click();
  await page.getByTestId('tab-gestures').click();
  await expect(page.getByTestId('map-peace')).toHaveValue('bulb-toggle');
});

test('exercises are gone', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('tab-train')).toHaveCount(0);
  await say(page, 'start finger math');
  await expect(page.getByTestId('twin-says')).toContainText("didn't catch");
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
  await page.getByTestId('tab-tasks').click();
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
  await expect(page.getByTestId('id-status')).toContainText('saved on this device');
  // The local AR receipt is now signed by this Omni ID.
  await expect(page.getByTestId('reg-receipt')).toContainText('✍️');

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

test('Omni Lab computes and verifies entirely in the browser', async ({ page }) => {
  await open(page);
  await page.getByTestId('tab-lab').click();
  await page.getByTestId('lab-run').click();
  await expect(page.getByTestId('lab-value')).toHaveText('775');
  await page.getByTestId('lab-ap-L').fill('1000000000000000000000000000000');
  await page.getByTestId('lab-ap-p').fill('30');
  await page.getByTestId('lab-run').click();
  await expect(page.getByTestId('lab-result')).toContainText('digits');
  await page.getByTestId('lab-lattice').click();
  await page.getByTestId('lab-run').click();
  await expect(page.getByTestId('lab-result')).toContainText('separable product');
  await page.getByTestId('lab-verify').click();
  await expect(page.getByTestId('lab-failures')).toHaveText('0');
});

test('camera opens with the AR verification gate: every check passes, sample element chosen @mobile', async ({ page }) => {
  await open(page, {}, { start: false });
  const gate = page.getByTestId('ar-gate');
  await expect(gate).toBeVisible();
  const checks = page.getByTestId('gate-checks');
  for (const label of ['Camera', 'Schema', 'Trusted signing key', 'Integrity (SHA-256)', 'ECDSA P-256 signature', 'Validity window', 'Local receipt']) {
    await expect(checks).toContainText(label);
  }
  await expect(checks.locator('.check-row.bad')).toHaveCount(0);
  await expect(checks).toContainText('Built into the app');

  await page.getByTestId('ar-sample-bot').click();
  await expect(page.getByTestId('ar-sample-bot')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: '#a78bfa' }).click();
  await page.getByTestId('ar-start').click();
  await expect(gate).toHaveCount(0);
  await expect(page.getByTestId('twin-says')).toContainText("I'm Omni, your AR twin");

  // The choice persists: the gate re-opens on reload with Bot preselected.
  await page.reload();
  await expect(page.getByTestId('ar-sample-bot')).toHaveAttribute('aria-checked', 'true');
});

test('3D Web AR works in a desktop browser: twin stands on an open palm and can be placed by clicking', async ({ page }) => {
  await open(page);
  const stage = page.getByTestId('stage');
  await expect(stage).toHaveAttribute('data-ar-mode', '3d');
  await expect(page.getByTestId('ar3d')).toHaveCount(1);
  await expect.poll(() => page.getByTestId('ar3d').evaluate((c) => c.width)).toBeGreaterThan(0);

  await page.evaluate(() => window.__omni.pose('open_palm'));
  await expect(stage).toHaveAttribute('data-anchor', 'palm');
  await page.evaluate(() => window.__omni.clear());
  await expect(stage).toHaveAttribute('data-anchor', 'home');

  const box = await stage.boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await expect(stage).toHaveAttribute('data-anchor', 'placed');
  await page.mouse.dblclick(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await expect(stage).toHaveAttribute('data-anchor', 'home');

  // 2D fallback is one tap away.
  await page.getByTestId('ar-mode-toggle').click();
  await expect(stage).toHaveAttribute('data-ar-mode', '2d');
  await expect(page.getByTestId('ar3d')).toHaveCount(0);
});

test('whole-app JSON backup exported on one browser restores on another', async ({ page, browser }) => {
  await open(page, { twinName: 'Nova', taskSpeed: 20 });
  await page.getByTestId('tab-tasks').click();
  await page.getByTestId('assign-hydrate').click();
  await expect(page.getByTestId('confirm-human')).toBeVisible();
  await page.getByTestId('confirm-human').click();
  await expect(page.getByTestId('stat-tasks')).toHaveText('1');

  await page.getByTestId('tab-data').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('backup-export').click();
  expect((await download).suggestedFilename()).toMatch(/^omni-ar-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const json = await page.getByTestId('backup-text').inputValue();
  expect(JSON.parse(json).schema).toBe('omni-app-backup/1');

  // A completely separate browser profile = "another device".
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const other = await ctx.newPage();
  await open(other);
  await expect(other.getByTestId('twin-toggle')).toContainText('Omni');
  await other.getByTestId('tab-data').click();
  await other.getByTestId('backup-text').fill(json);
  await other.getByTestId('backup-import').click();
  await expect(other.getByTestId('backup-status')).toContainText('Imported preferences');
  await expect(other.getByTestId('twin-toggle')).toContainText('Nova');
  await other.getByTestId('tab-tasks').click();
  await expect(other.getByTestId('stat-tasks')).toHaveText('1');
  await expect(other.getByTestId('done-list')).toContainText('Hydration');
  await ctx.close();
});

test('AR registration JSON: export works, tampered imports are rejected, AR stays verified', async ({ page }) => {
  await open(page);
  await page.getByTestId('tab-data').click();
  await expect(page.getByTestId('reg-source')).toHaveText('built-in');
  const download = page.waitForEvent('download');
  await page.getByTestId('reg-export').click();
  const original = JSON.parse(await (await (await download).createReadStream()).toArray().then((b) => Buffer.concat(b).toString()));
  expect(original.schema).toBe('omni-ar-register/1');

  const tampered = { ...original, element: { ...original.element, capabilities: [...original.element.capabilities, 'keylogger'] } };
  await page.getByTestId('reg-import-text').fill(JSON.stringify(tampered));
  await page.getByTestId('reg-import').click();
  await expect(page.getByTestId('reg-import-status')).toContainText('Rejected: integrity');
  await expect(page.getByTestId('reg-badge')).toContainText('AR element verified');

  // Re-importing the authentic file is accepted.
  await page.getByTestId('reg-import-text').fill(JSON.stringify(original));
  await page.getByTestId('reg-import').click();
  await expect(page.getByTestId('reg-import-status')).toContainText('Imported and verified');
  await expect(page.getByTestId('reg-source')).toHaveText('imported');
});

test('a tampered registration left in storage is ignored in favour of the built-in one', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('omni.registry', JSON.stringify({ schema: 'omni-ar-register/1', keyId: 'attacker', element: { id: 'x', version: '6.6.6', capabilities: ['everything'] } }));
  });
  await page.goto('/?mock=1');
  await expect(page.getByTestId('reg-badge')).toContainText('Omni Digital Twin v1.0.0');
});

test('real-AR button reports support honestly on non-AR browsers', async ({ page }) => {
  await open(page);
  const btn = page.getByTestId('xr-button');
  await expect(btn).toContainText('ARCore phones only');
  await expect(btn).toBeDisabled();
});
