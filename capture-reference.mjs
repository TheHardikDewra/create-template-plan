#!/usr/bin/env node
// capture.mjs <url> <outdir> [widths=1440,810,390]
// Full-page PNG per width + a design-extract JSON (section order, palette, type scale, fonts).
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHS = process.env.CHS || `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-152.0.7977.64/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const [url, outdir] = process.argv.slice(2);
const widths = (process.argv[4] || '1440,810,390').split(',').map(Number);
if (!url || !outdir) { console.error('usage: capture.mjs <url> <outdir> [widths]'); process.exit(1); }
mkdirSync(outdir, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'chs-'));
const port = 9000 + Math.floor(Math.random() * 900);
const chrome = spawn(CHS, [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--disable-gpu', '--force-device-scale-factor=1', '--window-size=1440,900',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error('chrome did not start');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); this.sessions = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data);
      if (m.id && this.p.has(m.id)) { const { res, rej } = this.p.get(m.id); this.p.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } }; }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.p.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  }
}

const wu = await wsUrl();
const ws = new WebSocket(wu);
await new Promise(r => { ws.onopen = r; });
const cdp = new CDP(ws);
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => cdp.send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');

const EXTRACT = `(() => {
  const px = v => parseFloat(v) || 0;
  const seen = {};
  const bump = (o,k) => { if(!k) return; o[k] = (o[k]||0)+1; };
  const colors = {}, bgs = {}, fonts = {}, sizes = {}, weights = {}, radii = {};
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    const s = getComputedStyle(el);
    if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim()))
      { bump(colors, s.color); bump(fonts, s.fontFamily.split(',')[0].replace(/["']/g,'')); 
        bump(sizes, Math.round(px(s.fontSize))+'px'); bump(weights, s.fontWeight); }
    if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') bump(bgs, s.backgroundColor);
    if (px(s.borderTopLeftRadius)) bump(radii, s.borderTopLeftRadius);
  });
  const top = o => Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,14).map(([k,v])=>k+' ×'+v);
  // section order: direct children of body/main that are tall bands
  const host = document.querySelector('main') || document.body;
  const sections = [...host.children].map(el => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    const h = [...el.querySelectorAll('h1,h2,h3')].slice(0,2).map(n=>n.textContent.trim().replace(/\\s+/g,' ').slice(0,90));
    return { tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,60),
      h: Math.round(r.height), bg: s.backgroundColor, headings: h,
      imgs: el.querySelectorAll('img,picture,svg').length,
      btns: el.querySelectorAll('a,button').length };
  }).filter(s => s.h > 60);
  return JSON.stringify({
    title: document.title,
    docHeight: document.documentElement.scrollHeight,
    fonts: top(fonts), textColors: top(colors), backgrounds: top(bgs),
    fontSizes: top(sizes), fontWeights: top(weights), radii: top(radii),
    sectionCount: sections.length, sections,
    links: [...new Set([...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')))].slice(0,40)
  });
})()`;

const report = {};
for (const w of widths) {
  await S('Emulation.setDeviceMetricsOverride', { width: w, height: 1200, deviceScaleFactor: 1, mobile: w < 700 });
  await S('Page.navigate', { url });
  await sleep(w === widths[0] ? 6500 : 4500);
  // lazy-load pass
  await S('Runtime.evaluate', { expression: `(async()=>{const h=document.body.scrollHeight;for(let y=0;y<h;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,90));}window.scrollTo(0,0);})()`, awaitPromise: true });
  await sleep(2200);
  const { result } = await S('Runtime.evaluate', { expression: EXTRACT, returnByValue: true });
  report[w] = JSON.parse(result.value);
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, optimizeForSpeed: false });
  writeFileSync(join(outdir, `w${w}.png`), Buffer.from(data, 'base64'));
  console.error(`captured ${w}px  h=${report[w].docHeight}  sections=${report[w].sectionCount}`);
}
writeFileSync(join(outdir, 'extract.json'), JSON.stringify(report, null, 2));
ws.close(); chrome.kill('SIGKILL');
console.log(JSON.stringify({ ok: true, outdir, widths }, null, 2));
process.exit(0);
