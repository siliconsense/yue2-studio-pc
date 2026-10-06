/* Optional local writing assistant: preview never changes song fields by itself. */
(() => {
  const q = id => document.getElementById(id);
  const words = {
    ru: {
      tab:'Идея → песня', heading:'Напишем песню с Qwen',
      intro:'Опишите историю, настроение или образ. Qwen предложит текст и стиль — вы сможете поправить их перед созданием музыки. Всё пишется на вашем ПК.',
      idea:'О чём песня?', genre:'Жанр и звучание (необязательно)', language:'Язык песни', length:'Объём текста',
      short:'Короткий · около 8 строк', medium:'Средний · около 16 строк', long:'Длинный · около 24 строк',
      model:'Модель', device:'Вычисления', auto:'Авто · видеокарта + RAM', cpu:'Только CPU · медленнее',
      download:'При первом запуске выбранная модель скачивается с Hugging Face: 4B — 2,55 ГиБ, 9B — 5,29 ГиБ; дополнительно около 626 МиБ для llama.cpp с GitHub. Начните с 4B. Обе модели проверены пользователем на 6 ГБ VRAM и 32 ГБ RAM; скорость зависит от ПК. Интернет нужен для установки. Текст никуда не отправляется.',
      write:'Написать текст и стиль', cancel:'Отменить', cancelling:'Отменяю…', cancelled:'Отменено. Скачанные части сохранены; можно продолжить повторным запуском.',
      preview:'Черновик песни', preview_hint:'Прочитайте и отредактируйте черновик. Кнопка ниже заменит текст и стиль во вкладке «Песня по тексту». Длительность музыки задаётся там отдельно; кавер останется без изменений.',
      style:'Стиль', lyrics:'Текст', apply:'Перенести в песню', save:'Сохранить .txt', undo:'Вернуть текст и стиль до Qwen',
      working:'Подготавливаю помощника…', done:'Черновик готов. Qwen выгружен из памяти.',
      empty:'Опишите идею: от 3 до 2000 символов.', invalid:'В черновике должны быть и текст, и стиль.',
      installed:'Файл модели уже скачан; перед запуском проверим его целостность.',
      needed:'Модель будет скачана после нажатия «Написать текст и стиль».',
      reconnect:'Связь со студией прервалась. Повторяю проверку статуса…', failed:'Не удалось запустить помощника.',
      example:'Например: песня о ночной поездке домой после долгой разлуки',
      genre_example:'Например: инди-рок, тёплый мужской голос, гитара, 90 BPM'
    },
    en: {
      tab:'Idea → song', heading:'Write a song with Qwen',
      intro:'Describe a story, mood or image. Qwen drafts lyrics and a style you can edit before making music. Writing runs on your PC.',
      idea:'What is the song about?', genre:'Genre and sound (optional)', language:'Song language', length:'Draft length',
      short:'Short · about 8 lines', medium:'Medium · about 16 lines', long:'Long · about 24 lines',
      model:'Model', device:'Compute', auto:'Auto · GPU + RAM', cpu:'CPU only · slower',
      download:'On first use, the selected model downloads from Hugging Face: 4B is 2.55 GiB, 9B is 5.29 GiB; llama.cpp adds about 626 MiB from GitHub. Start with 4B. A user validated both models on 6 GB VRAM and 32 GB RAM; speed depends on your PC. Installation needs internet. Your text stays on your PC.',
      write:'Write lyrics and style', cancel:'Cancel', cancelling:'Cancelling…', cancelled:'Cancelled. Partial downloads are kept; start again to resume.',
      preview:'Song draft', preview_hint:'Read and edit the draft. The button below replaces lyrics and style in Song from lyrics. Set music duration there separately; the cover is unchanged.',
      style:'Style', lyrics:'Lyrics', apply:'Use in song', save:'Save .txt', undo:'Restore lyrics and style from before Qwen',
      working:'Preparing the assistant…', done:'Draft ready. Qwen has been unloaded from memory.',
      empty:'Describe your idea in 3–2000 characters.', invalid:'The draft needs both lyrics and style.',
      installed:'Model file downloaded; its integrity will be checked before loading.',
      needed:'The model will download after you press Write lyrics and style.',
      reconnect:'Connection to the studio lost. Retrying the status check…', failed:'Could not start the assistant.',
      example:'For example: driving home at night after a long time away',
      genre_example:'For example: indie rock, warm male voice, guitar, 90 BPM'
    }
  };
  const text = key => words[document.documentElement.lang === 'ru' ? 'ru' : 'en'][key];
  let models = [], active = null, undo = null, messageKey = null;
  function status(message, bad=false){ q('w-status').textContent=message; q('w-status').classList.toggle('bad',bad); }
  function modelStatus(){
    const m=models.find(x=>x.id===q('w-model').value);
    q('w-model-status').textContent=text(m?.downloaded ? 'installed':'needed');
  }
  function localize(){
    document.querySelectorAll('[data-w]').forEach(el=>el.textContent=text(el.dataset.w));
    q('w-idea').placeholder=text('example'); q('w-genre').placeholder=text('genre_example');
    modelStatus(); if(messageKey)status(text(messageKey));
  }
  new MutationObserver(localize).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  localize(); q('w-language').value=document.documentElement.lang==='ru'?'ru':'en';
  q('w-model').onchange=modelStatus;
  async function post(path, body){
    const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json(); if(!r.ok)throw new Error(d.error || text('failed')); return d;
  }
  function busy(id){ active=id; try{if(id)sessionStorage.setItem('ss-writer-active',id);else sessionStorage.removeItem('ss-writer-active');}catch(e){} q('w-go').disabled=!!id; q('w-cancel').classList.toggle('hidden',!id); q('w-cancel').disabled=false; }
  function storeDraft(){
    try {sessionStorage.setItem('ss-writer-draft',JSON.stringify({style:q('w-style').value,lyrics:q('w-lyrics').value}));} catch(e){}
  }
  async function poll(id){
    if(active!==id)return;
    try {
      const r=await fetch('/api/status/'+encodeURIComponent(id));
      if(r.status===404){busy(null);messageKey='failed';status(text(messageKey),true);return;}
      if(!r.ok)throw new Error('status');
      const d=await r.json();
      if(active!==id)return;
      if(d.state==='done'){
        busy(null); q('w-style').value=d.style; q('w-lyrics').value=d.lyrics;
        q('w-preview').classList.remove('hidden'); storeDraft(); messageKey='done';status(text(messageKey));loadModels(false);return;
      }
      if(d.state==='failed' || d.state==='cancelled'){
        busy(null);messageKey=d.state==='cancelled'?'cancelled':null;
        status(messageKey?text(messageKey):d.error,d.state==='failed');return;
      }
      messageKey=null;status(d.message || text('working'));
    } catch(e){messageKey='reconnect';status(text(messageKey));}
    if(active===id)setTimeout(()=>poll(id),1000);
  }
  async function loadModels(recover){
    try {
      const r=await fetch('/api/writer/models'); if(!r.ok)return;
      const d=await r.json();models=d.models;modelStatus();
      if(recover && !active && d.active){busy(d.active);poll(d.active);}
    }catch(e){}
  }
  q('w-go').onclick=async()=>{
    const idea=q('w-idea').value.trim(); if(idea.length<3){status(text('empty'),true);return;}
    q('w-go').disabled=true;messageKey='working';status(text(messageKey));
    try {
      const d=await post('/api/writer',{idea,genre:q('w-genre').value.trim(),language:q('w-language').value,
        length:q('w-length').value,model:q('w-model').value,device:q('w-device').value,lang:document.documentElement.lang});
      busy(d.id);poll(d.id);
    }catch(e){busy(null);messageKey=null;status(e.message,true);}
  };
  q('w-cancel').onclick=async()=>{
    if(!active)return;
    q('w-cancel').disabled=true;messageKey='cancelling';status(text(messageKey));
    try{await post('/api/writer/cancel',{id:active});}
    catch(e){q('w-cancel').disabled=false;status(e.message,true);}
  };
  q('w-apply').onclick=()=>{
    if(!q('w-style').value.trim() || !q('w-lyrics').value.trim()){status(text('invalid'),true);return;}
    undo={style:q('style').value,lyrics:q('lyrics').value,styleSample:q('style').dataset.sample,lyricsSample:q('lyrics').dataset.sample};
    q('style').value=q('w-style').value; q('lyrics').value=q('w-lyrics').value;
    q('style').dataset.sample='0'; q('lyrics').dataset.sample='0'; q('w-undo').classList.remove('hidden');
    storeDraft(); tab('song');
  };
  q('w-undo').onclick=()=>{
    if(!undo)return;
    q('style').value=undo.style; q('lyrics').value=undo.lyrics;
    q('style').dataset.sample=undo.styleSample || '0'; q('lyrics').dataset.sample=undo.lyricsSample || '0';
    undo=null;q('w-undo').classList.add('hidden');
  };
  q('w-save').onclick=()=>{
    const content='STYLE\n'+q('w-style').value+'\n\nLYRICS\n'+q('w-lyrics').value+'\n';
    const url=URL.createObjectURL(new Blob(['\ufeff',content],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='Qwen-song-draft.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  for(const id of ['w-style','w-lyrics'])q(id).addEventListener('input',storeDraft);
  try{
    const saved=JSON.parse(sessionStorage.getItem('ss-writer-draft') || 'null');
    if(saved && typeof saved.style==='string' && typeof saved.lyrics==='string'){
      q('w-style').value=saved.style;q('w-lyrics').value=saved.lyrics;q('w-preview').classList.remove('hidden');
    }
  }catch(e){}
  try{const id=sessionStorage.getItem('ss-writer-active');if(id){busy(id);poll(id);}}catch(e){}
  loadModels(true);
})();
