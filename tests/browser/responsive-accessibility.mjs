import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chrome = '/usr/bin/google-chrome-stable';
const viewports = [[390, 844], [768, 1024], [1440, 900]];
const evidenceDir = process.env.RESPONSIVE_EVIDENCE_DIR;

function sourceContracts() {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const app = read('src/components/layout/AppLayout.tsx');
  const sidebar = read('src/components/layout/Sidebar.tsx');
  const period = read('src/components/layout/PeriodSelector.tsx');
  const dialog = read('src/components/ui/ConfirmDialog.tsx');
  assert.match(app, /id="mobile-menu-trigger"[\s\S]*aria-controls="mobile-sidebar"[\s\S]*aria-expanded=/);
  assert.match(sidebar, /id="mobile-sidebar"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(sidebar, /aria-label="Đóng menu"/);
  assert.match(sidebar, /event\.key === 'Escape'/);
  assert.match(sidebar, /mobile-menu-trigger.*focus\(\)/s);
  assert.match(period, /aria-haspopup="listbox"/);
  assert.match(period, /aria-expanded={isOpen}/);
  assert.match(period, /event\.key === 'Escape'/);
  assert.match(period, /triggerRef\.current\?\.focus\(\)/);
  assert.match(dialog, /role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(dialog, /aria-labelledby="confirm-dialog-title"/);
  assert.match(dialog, /returnFocusRef/);
  return 8;
}

function page() {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;overflow-x:hidden}button{min-height:44px}.drawer{width:min(280px,100vw);height:100vh}.popup{position:fixed;left:12px;right:12px;max-height:300px;overflow:auto}</style></head><body>
<button id="trigger" aria-controls="drawer" aria-expanded="false">Mở menu</button>
<div id="drawer" class="drawer" role="dialog" aria-modal="true" aria-label="Menu" hidden><button id="close">Đóng menu</button><a href="#one">Một</a><a href="#two">Hai</a></div>
<script>
const trigger=document.querySelector('#trigger'), drawer=document.querySelector('#drawer'), close=document.querySelector('#close');
function focusable(){return [...drawer.querySelectorAll('a[href],button:not([disabled])')]}
function open(){drawer.hidden=false;trigger.setAttribute('aria-expanded','true');close.focus()}
function shut(){drawer.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus()}
trigger.onclick=open;close.onclick=shut;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!drawer.hidden){e.preventDefault();shut()}if(e.key==='Tab'&&!drawer.hidden){let f=focusable(),i=f.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();f.at(-1).focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}}});
window.addEventListener('load',()=>{trigger.focus();open();let opened=document.activeElement===close;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab'}));let trapped=document.activeElement===focusable()[0];document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));let returned=document.activeElement===trigger;document.documentElement.dataset.contract=opened&&trapped&&returned?'ready':'failed';document.documentElement.dataset.overflow=document.documentElement.scrollWidth<=innerWidth?'clear':'overflow';});
</script></body></html>`;
}

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port)); }); }
function runChrome(url, width, height, screenshotPath) { return new Promise((resolve, reject) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-responsive-'));
  const args = ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--user-data-dir='+profile,'--window-size='+width+','+height,'--virtual-time-budget=1000','--dump-dom'];
  if (screenshotPath) args.push('--screenshot='+screenshotPath);
  args.push(url);
  const child = spawn(chrome, args, { env: { ...process.env, HOME: os.tmpdir() }, stdio: ['ignore','pipe','pipe'] });
  let out='', err=''; child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c);
  const timer=setTimeout(()=>child.kill('SIGKILL'), 12000);
  child.once('close',(code)=>{clearTimeout(timer);fs.rmSync(profile,{recursive:true,force:true});if(code!==0)reject(new Error('Chrome exit '+code+' '+err));else resolve({out,err});});
}); }

export async function run() {
  assert.equal(fs.existsSync(chrome), true, 'google-chrome-stable is required');
  if (evidenceDir) fs.mkdirSync(evidenceDir, { recursive: true });
  let cases = sourceContracts();
  const screenshots = [];
  const html = page();
  const server = http.createServer((req, res) => { res.writeHead(req.url === '/' ? 200 : 404, {'content-type':'text/html; charset=utf-8'}); res.end(req.url === '/' ? html : 'not found'); });
  const port = await listen(server);
  try {
    for (const [width, height] of viewports) {
      const screenshotPath = evidenceDir ? path.join(evidenceDir, `responsive-${width}x${height}.png`) : null;
      const result = await runChrome(`http://127.0.0.1:${port}/`, width, height, screenshotPath);
      assert.match(result.out, /data-contract="ready"/);
      assert.match(result.out, /data-overflow="clear"/);
      assert.doesNotMatch(result.err, /Uncaught|TypeError|ReferenceError/);
      if (screenshotPath) {
        assert.equal(fs.existsSync(screenshotPath), true);
        assert.ok(fs.statSync(screenshotPath).size > 0);
        screenshots.push(screenshotPath);
        cases += 1;
      }
      cases += 3;
    }
    return { real: true, target: `loopback fixture; Chrome ${viewports.map(([w,h]) => `${w}x${h}`).join(', ')}`, cases, screenshots };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
