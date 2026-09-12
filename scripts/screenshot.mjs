// One-off script to grab real screenshots of the running dev server for the
// README. Not part of the app build — run manually with:
//   node scripts/screenshot.mjs
import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE_URL = 'http://localhost:8080';
const OUT_DIR = path.resolve('docs/screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });

async function shot(name, { width = 1280, height = 800, url, mobile = false, actions = null }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle0' });
  if (actions) await actions(page);
  await new Promise((r) => setTimeout(r, 400)); // let animations settle
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  await page.close();
  console.log('saved', name);
}

async function clickText(page, text) {
  const clicked = await page.evaluate((t) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let best = null;
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (el.children.length === 0 && el.textContent?.trim() === t) {
        best = el;
        break;
      }
    }
    if (!best) return false;
    // Click the nearest clickable ancestor (card/button), not just the text node's element.
    const target = best.closest('[class*="cursor-pointer"], button, a') || best;
    target.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`text not found: ${text}`);
}

// 1. Landing page — desktop
await shot('landing-desktop', { url: '/' });

// 2. Landing page — mobile
await shot('landing-mobile', { url: '/', width: 390, height: 844, mobile: true });

// 3. Public booking — service selection
await shot('booking-services', { url: '/b/demo', width: 900, height: 900 });

// 4. Public booking — staff selection
await shot('booking-staff', {
  url: '/b/demo', width: 900, height: 700,
  actions: async (page) => {
    await page.waitForSelector('div.cursor-pointer');
    await clickText(page, 'Corte clásico');
    await page.waitForSelector('div.cursor-pointer');
  },
});

// 5. Public booking — confirmation with payment info (needs a real booking)
await shot('booking-confirmation', {
  url: '/b/demo', width: 900, height: 900,
  actions: async (page) => {
    await page.waitForSelector('div.cursor-pointer');
    await clickText(page, 'Corte clásico');
    await page.waitForSelector('div.cursor-pointer');
    await clickText(page, 'Nico');
    await page.waitForFunction(() => document.querySelectorAll('div.cursor-pointer').length > 3);
    const days = await page.$$('div.cursor-pointer');
    await days[2].click(); // a few days out, avoids lead-time/holiday edge cases
    await page.waitForFunction(() => document.body.innerText.includes('Elegí un horario'));
    await new Promise((r) => setTimeout(r, 300));
    // Pick whatever the first offered time slot is, rather than a specific
    // hardcoded time that may not be free for this staff/day combination.
    const pickedTime = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /^\d{2}:\d{2}$/.test(b.textContent.trim()));
      if (!btn) return null;
      btn.click();
      return btn.textContent.trim();
    });
    if (!pickedTime) throw new Error('no time slots available on the chosen day');
    await page.waitForSelector('input[placeholder="Tu nombre completo"]');
    await page.type('input[placeholder="Tu nombre completo"]', 'Ana Torres');
    await page.type('input[placeholder="Ej: +54 11 1234 5678"]', '+54 9 11 2345-6789');
    await clickText(page, 'Confirmar turno');
    await page.waitForFunction(() => document.body.innerText.includes('reservado'));
  },
});

// 6. Dashboard home (after login)
async function loginAndGoto(page, url) {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'networkidle0' });
  await page.type('input[type="email"]', 'demo@turnopro.local');
  await page.type('input[type="password"]', 'demo12345');
  await clickText(page, 'Ingresar');
  await page.waitForFunction(() => location.pathname.startsWith('/dashboard'));
  if (url !== '/dashboard') {
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle0' });
  }
}

for (const [name, url] of [
  ['dashboard-home', '/dashboard'],
  ['dashboard-agenda', '/dashboard/agenda'],
  ['dashboard-whatsapp', '/dashboard/whatsapp'],
]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await loginAndGoto(page, url);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  await page.close();
  console.log('saved', name);
}

await browser.close();
console.log('done');
