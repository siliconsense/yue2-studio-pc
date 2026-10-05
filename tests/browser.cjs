// npm install --prefix /tmp/yue2-browser-check playwright
// PLAYWRIGHT_MODULE=/tmp/yue2-browser-check/node_modules/playwright node tests/browser.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const readline=require('node:readline');
(async()=>{
 const fixture=spawn(process.env.PYTHON || 'python3',['tests/browser_server.py'],{stdio:['ignore','pipe','inherit']});
 let browser;
 try {
  const port=await new Promise((resolve,reject)=>{
   const lines=readline.createInterface({input:fixture.stdout});lines.once('line',x=>resolve(Number(x)));
   fixture.once('exit',code=>reject(new Error('fixture exit '+code)));
  });
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1280,height:1000},locale:'en-US'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/fixture.mp3',route=>route.fulfill({status:200,body:Buffer.alloc(0),contentType:'audio/mpeg'}));
  await page.goto('http://127.0.0.1:'+port+'/');
  await page.locator('#tab-cover').click();
  await page.locator('#file').setInputFiles({name:'four-minute-source.wav',mimeType:'audio/wav',buffer:Buffer.from('fixture')});
  await page.locator('#go-scan').click();
  await page.locator('#pane-sing').waitFor({state:'visible'});
  assert.match(await page.locator('#c-duration-info').innerText(),/4:00.*4:05/);
  await page.locator('#go-cover').click();
  await page.waitForFunction(()=>!document.querySelector('#go-cover').disabled);
  const first=await (await page.request.get('http://127.0.0.1:'+port+'/api/status/2')).json();
  assert.equal(first.requested_seconds,245);
  assert.match(await page.locator('#warning-cover').innerText(),/duration limit/);
  await page.locator('#pr-tempo').fill('80');await page.locator('#pr-tempo').press('Tab');
  assert.match(await page.locator('#c-duration-info').innerText(),/6:00.*6:05/);
  await page.locator('#go-cover').click();await page.waitForFunction(()=>!document.querySelector('#go-cover').disabled);
  const slow=await (await page.request.get('http://127.0.0.1:'+port+'/api/status/3')).json();assert.equal(slow.requested_seconds,365);
  await page.locator('#c-duration-mode').selectOption('manual');await page.locator('#c-seconds').fill('240');
  assert.match(await page.locator('#c-duration-info').innerText(),/shorter than/);
  await page.locator('#go-cover').click();await page.waitForFunction(()=>!document.querySelector('#go-cover').disabled);
  const manual=await (await page.request.get('http://127.0.0.1:'+port+'/api/status/4')).json();assert.equal(manual.requested_seconds,240);
  await page.locator('#c-seconds').fill('901');await page.locator('#go-cover').click();
  assert.match(await page.locator('#st-cover').innerText(),/between 1 and 900/);
  await page.locator('#lang-ru').click();assert.match(await page.locator('#warning-cover').innerText(),/предел длительности/);
  await page.locator('#c-duration-mode').selectOption('auto');assert.match(await page.locator('#c-duration-info').innerText(),/6:00.*6:05/);
  await page.evaluate(()=>renderWarning('cover','context_limit'));assert.match(await page.locator('#warning-cover').innerText(),/контекст/);
  // A new source must not accidentally sing the previous source's score.
  await page.locator('#file').setInputFiles({name:'new.wav',mimeType:'audio/wav',buffer:Buffer.from('new fixture')});
  assert.equal(await page.locator('#pane-sing').isVisible(),false);
  await page.locator('#go-scan').click();await page.locator('#pane-sing').waitFor({state:'visible'});
  await page.reload();await page.locator('#tab-cover').click();
  await page.locator('#file').setInputFiles({name:'first.wav',mimeType:'audio/wav',buffer:Buffer.from('fixture')});
  await page.locator('#go-scan').click();await page.locator('#pane-sing').waitFor({state:'visible'});
  await page.locator('#go-fit').click();assert.ok((await page.locator('#st-fit').innerText()).length>0);
  await page.evaluate(()=>watch('failed',document.querySelector('#st-cover'),()=>{}));
  await page.waitForFunction(()=>document.querySelector('#st-cover').textContent === 'fixture error');
  assert.deepEqual(errors,[]);
  console.log('PASS: auto 245s, edited tempo 365s, manual 240s, invalid input, RU/EN warnings, context warning, source reset, fit button. No GPU inference.');
 } finally {if(browser)await browser.close();fixture.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
