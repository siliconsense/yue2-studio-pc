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
  await page.locator('#c-what').selectOption('full'); // applies to the NEXT scan only
  await page.locator('#go-cover').click();
  await page.waitForFunction(()=>!document.querySelector('#go-cover').disabled);
  const first=await (await page.request.get('http://127.0.0.1:'+port+'/api/status/2')).json();
  assert.equal(first.requested_seconds,245);
  const scan=await (await page.request.get('http://127.0.0.1:'+port+'/api/status/1')).json();
  assert.equal(first.graph['2'].inputs.abc,scan.abc.trim());
  assert.equal(first.graph['2'].inputs.mode,'melody');
  assert.equal(await page.locator('#restore-score').isDisabled(),true);
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
  assert.equal(await page.locator('#restore-score').isDisabled(),false);
  await page.locator('#restore-score').click();
  assert.match(await page.locator('#c-duration-info').innerText(),/4:00.*4:05/);
  assert.equal(await page.evaluate(()=>coverABC()),scan.abc);
  // A new source must not accidentally sing the previous source's score.
  await page.locator('#file').setInputFiles({name:'new.wav',mimeType:'audio/wav',buffer:Buffer.from('new fixture')});
  assert.equal(await page.locator('#pane-sing').isVisible(),false);
  await page.locator('#go-scan').click();await page.locator('#pane-sing').waitFor({state:'visible'});
  await page.reload();await page.locator('#tab-cover').click();
  await page.locator('#file').setInputFiles({name:'first.wav',mimeType:'audio/wav',buffer:Buffer.from('fixture')});
  await page.locator('#go-scan').click();await page.locator('#pane-sing').waitFor({state:'visible'});
  await page.locator('#go-fit').click();assert.ok((await page.locator('#st-fit').innerText()).length>0);
  assert.equal(await page.locator('#restore-score').isDisabled(),false);
  await page.locator('#restore-score').click();
  assert.equal(await page.evaluate(()=>coverABC()),scan.abc);

  // Score constructs which the editor cannot round-trip must remain untouched.
  const complex='X:1\nM:4/4\nL:1/8\nQ:1/4=120\nV:1\nV:2\nK:C\nV:1\nC/2D/2E7|\nK:D\nF4"D"D4|\nV:2\nz8|z8|\n';
  await page.route('**/api/scan',route=>route.fulfill({json:{id:'complex'}}));
  await page.route('**/api/status/complex',route=>route.fulfill({json:{state:'done',abc:complex,score_seconds:4,took:0}}));
  await page.locator('#c-what').selectOption('full');
  await page.locator('#go-scan').click();
  await page.waitForFunction(()=>score.includes('C/2D/2E7'));
  await page.locator('#c-what').selectOption('melody');
  await page.locator('#lang-en').click(); // remounting is not an edit
  assert.match(await page.locator('#c-duration-info').innerText(),/0:04.*0:09/);
  const sent=page.waitForResponse(r=>r.url().endsWith('/api/generate'));
  await page.locator('#go-cover').click();
  const job=await (await sent).json();
  const result=await (await page.request.get('http://127.0.0.1:'+port+'/api/status/'+job.id)).json();
  assert.equal(result.graph['2'].inputs.abc,complex.trim());
  assert.equal(result.graph['2'].inputs.mode,'full');
  assert.equal(result.requested_seconds,9);
  await page.waitForFunction(()=>!document.querySelector('#go-cover').disabled);
  await page.evaluate(()=>watch('failed',document.querySelector('#st-cover'),()=>{}));
  await page.waitForFunction(()=>document.querySelector('#st-cover').textContent === 'fixture error');
  assert.deepEqual(errors,[]);
  console.log('PASS: auto 245s, edited tempo 365s, manual 240s, invalid input, RU/EN warnings, context warning, source reset, fit/restore, exact original ABC including key changes/fractions/chords, transcription mode snapshot. No GPU inference.');
 } finally {if(browser)await browser.close();fixture.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
