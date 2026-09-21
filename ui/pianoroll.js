/* ============================================================
   pianoroll.js — a piano-roll editor for ABC scores.

   The score arrives and leaves as ABC text, but you edit it with the mouse
   on a grid. Parsing ABC -> note model, building the model back into ABC,
   and the editor itself all live here.

   The ABC dialect is deliberately narrow: two voices, notes with durations
   in units of L, rests z/Z, ties -, chords in quotes, sections as "% verse"
   lines. That is what music models emit, and the round-trip is lossless.

   No dependencies, no build step, no network. Drop in the .js and the .css.
   ============================================================ */

const PR = {};

/* ---------- configuration ----------
   Override before calling PR.mount(). All fields are optional. */
PR.config = {
  locale: 'en',                 // 'en' | 'ru', or add your own to PR.i18n
  storageKey: 'pianoroll_nudge',// where the playback offset is remembered
  ask: null,   // async ({title, value, placeholder, ok}) -> string | null
  toast: null, // (message) -> void
};

PR.i18n = {
  en: {
    voice:'voice', vocal:'vocal', instrument:'instrument', step:'step', tempo:'tempo',
    octUp:'oct \u2191', octDn:'oct \u2193', octUpT:'selected voice one octave up',
    octDnT:'selected voice one octave down',
    trUp:'\u266f up', trDn:'\u266d down', trUpT:'whole song one semitone up',
    trDnT:'whole song one semitone down',
    undo:'\u21b6 undo', play:'\u25b6 Play', pause:'\u275a\u275a Pause', stop:'\u25a0 Stop',
    audible:'audible', bothVoices:'both voices', selectedOnly:'selected only',
    nudge:'offset', nudgeT:'drag it while the music plays until the highlight matches the sound',
    ms:' ms', auto:'auto',
    playHint:'Click the ruler to set where playback starts \u00b7 space starts and pauses \u00b7 '
            +'if a note lights up before you hear it, drag "offset" to the right '
            +'(wireless headphones need 300\u2013600 ms)',
    editHint:'Drag a note by the middle to move it, by the right edge to make it longer \u00b7 '
            +'draw a new one on empty space \u00b7 double click erases \u00b7 Delete removes the selected one \u00b7 '
            +'Ctrl+Z undoes \u00b7 grey notes belong to the other voice, click one and the editor switches to it',
    info:'{bars} bars \u00b7 {tempo} BPM \u00b7 key {key} \u00b7 {notes} notes \u00b7 about {time}',
    chordTitle:'Chord for bar ', chordPlaceholder:'e.g. Am7 \u00b7 empty removes it', chordOk:'Set',
    noAudio:'This browser cannot play audio', chordEditT:'click to change the chord',
    noLyricLines:'The lyrics contain no usable lines',
    noVocalLine:'The score has no vocal line',
  },
  ru: {
    voice:'\u0433\u043e\u043b\u043e\u0441', vocal:'\u0432\u043e\u043a\u0430\u043b',
    instrument:'\u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442',
    step:'\u0448\u0430\u0433', tempo:'\u0442\u0435\u043c\u043f',
    octUp:'\u043e\u043a\u0442 \u2191', octDn:'\u043e\u043a\u0442 \u2193',
    octUpT:'\u0412\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u0433\u043e\u043b\u043e\u0441 \u043d\u0430 \u043e\u043a\u0442\u0430\u0432\u0443 \u0432\u044b\u0448\u0435',
    octDnT:'\u0412\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u0433\u043e\u043b\u043e\u0441 \u043d\u0430 \u043e\u043a\u0442\u0430\u0432\u0443 \u043d\u0438\u0436\u0435',
    trUp:'\u266f \u0432\u044b\u0448\u0435', trDn:'\u266d \u043d\u0438\u0436\u0435',
    trUpT:'\u0412\u0441\u044f \u043f\u0435\u0441\u043d\u044f \u043d\u0430 \u043f\u043e\u043b\u0443\u0442\u043e\u043d \u0432\u044b\u0448\u0435',
    trDnT:'\u0412\u0441\u044f \u043f\u0435\u0441\u043d\u044f \u043d\u0430 \u043f\u043e\u043b\u0443\u0442\u043e\u043d \u043d\u0438\u0436\u0435',
    undo:'\u21b6 \u043e\u0442\u043c\u0435\u043d\u0438\u0442\u044c',
    play:'\u25b6 \u0421\u043b\u0443\u0448\u0430\u0442\u044c',
    pause:'\u275a\u275a \u041f\u0430\u0443\u0437\u0430', stop:'\u25a0 \u0421\u0442\u043e\u043f',
    audible:'\u0441\u043b\u044b\u0448\u043d\u043e',
    bothVoices:'\u043e\u0431\u0430 \u0433\u043e\u043b\u043e\u0441\u0430',
    selectedOnly:'\u0442\u043e\u043b\u044c\u043a\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439',
    nudge:'\u0441\u0434\u0432\u0438\u0433',
    nudgeT:'\u0414\u0432\u0438\u0433\u0430\u0439\u0442\u0435 \u043f\u0440\u044f\u043c\u043e \u0432\u043e \u0432\u0440\u0435\u043c\u044f \u0438\u0433\u0440\u044b, \u043f\u043e\u043a\u0430 \u043f\u043e\u0434\u0441\u0432\u0435\u0442\u043a\u0430 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0451\u0442 \u0441\u043e \u0437\u0432\u0443\u043a\u043e\u043c',
    ms:' \u043c\u0441', auto:'\u0430\u0432\u0442\u043e',
    playHint:'\u0429\u0435\u043b\u0447\u043e\u043a \u043f\u043e \u043b\u0438\u043d\u0435\u0439\u043a\u0435 \u0441\u0442\u0430\u0432\u0438\u0442 \u043c\u0435\u0442\u043a\u0443, \u043e\u0442\u043a\u0443\u0434\u0430 \u0438\u0433\u0440\u0430\u0442\u044c \u00b7 \u043f\u0440\u043e\u0431\u0435\u043b \u2014 \u043f\u0443\u0441\u043a \u0438 \u043f\u0430\u0443\u0437\u0430 \u00b7 \u0435\u0441\u043b\u0438 \u043d\u043e\u0442\u0430 \u0437\u0430\u0433\u043e\u0440\u0430\u0435\u0442\u0441\u044f \u0440\u0430\u043d\u044c\u0448\u0435 \u0437\u0432\u0443\u043a\u0430, \u0434\u0432\u0438\u0433\u0430\u0439\u0442\u0435 \u00ab\u0441\u0434\u0432\u0438\u0433\u00bb \u0432\u043f\u0440\u0430\u0432\u043e (\u0431\u0435\u0441\u043f\u0440\u043e\u0432\u043e\u0434\u043d\u044b\u043c \u043d\u0430\u0443\u0448\u043d\u0438\u043a\u0430\u043c \u043d\u0443\u0436\u043d\u043e 300\u2013600 \u043c\u0441)',
    editHint:'\u0422\u044f\u043d\u0438\u0442\u0435 \u043d\u043e\u0442\u0443 \u0437\u0430 \u0441\u0435\u0440\u0435\u0434\u0438\u043d\u0443 \u2014 \u0434\u0432\u0438\u0433\u0430\u0435\u0442\u0441\u044f, \u0437\u0430 \u043f\u0440\u0430\u0432\u044b\u0439 \u043a\u0440\u0430\u0439 \u2014 \u0434\u043b\u0438\u043d\u043d\u0435\u0435 \u00b7 \u043d\u0430 \u043f\u0443\u0441\u0442\u043e\u043c \u043c\u0435\u0441\u0442\u0435 \u0440\u0438\u0441\u0443\u0435\u0442\u0441\u044f \u043d\u043e\u0432\u0430\u044f \u00b7 \u0434\u0432\u043e\u0439\u043d\u043e\u0439 \u0449\u0435\u043b\u0447\u043e\u043a \u0441\u0442\u0438\u0440\u0430\u0435\u0442 \u00b7 Delete \u0443\u0431\u0438\u0440\u0430\u0435\u0442 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u0443\u044e \u00b7 Ctrl+Z \u043e\u0442\u043c\u0435\u043d\u044f\u0435\u0442 \u00b7 \u0441\u0435\u0440\u044b\u0435 \u043d\u043e\u0442\u044b \u2014 \u0434\u0440\u0443\u0433\u043e\u0439 \u0433\u043e\u043b\u043e\u0441, \u0449\u0451\u043b\u043a\u043d\u0438\u0442\u0435 \u043f\u043e \u0442\u0430\u043a\u043e\u0439, \u0438 \u0440\u0435\u0434\u0430\u043a\u0442\u043e\u0440 \u043f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0438\u0442\u0441\u044f \u043d\u0430 \u043d\u0435\u0451',
    info:'{bars} \u0442\u0430\u043a\u0442\u043e\u0432 \u00b7 {tempo} BPM \u00b7 \u0442\u043e\u043d {key} \u00b7 {notes} \u043d\u043e\u0442 \u00b7 \u043f\u0440\u0438\u043c\u0435\u0440\u043d\u043e {time}',
    chordTitle:'\u0410\u043a\u043a\u043e\u0440\u0434 \u0434\u043b\u044f \u0442\u0430\u043a\u0442\u0430 ',
    chordPlaceholder:'\u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 Am7 \u00b7 \u043f\u0443\u0441\u0442\u043e \u2014 \u0443\u0431\u0440\u0430\u0442\u044c',
    chordOk:'\u041f\u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c',
    noAudio:'\u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u043d\u0435 \u0443\u043c\u0435\u0435\u0442 \u043f\u0440\u043e\u0438\u0433\u0440\u044b\u0432\u0430\u0442\u044c \u0437\u0432\u0443\u043a', chordEditT:'\u0429\u0451\u043b\u043a\u043d\u0438\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u0441\u043c\u0435\u043d\u0438\u0442\u044c \u0430\u043a\u043a\u043e\u0440\u0434',
    noLyricLines:'\u0412 \u0442\u0435\u043a\u0441\u0442\u0435 \u043d\u0435\u0442 \u0441\u0442\u0440\u043e\u043a \u0441\u043e \u0441\u043b\u043e\u0432\u0430\u043c\u0438',
    noVocalLine:'\u0412 \u043f\u0430\u0440\u0442\u0438\u0442\u0443\u0440\u0435 \u043d\u0435\u0442 \u0432\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0439 \u043b\u0438\u043d\u0438\u0438',
  },
};

/** Look up a phrase, substituting {placeholders}. */
PR.t = function(key, vars){
  const dict = PR.i18n[PR.config.locale] || PR.i18n.en;
  let out = (dict[key] !== undefined ? dict[key] : (PR.i18n.en[key] !== undefined ? PR.i18n.en[key] : key));
  if (vars) for (const k in vars) out = out.split('{' + k + '}').join(vars[k]);
  return out;
};

/* Asking the user for a chord name and showing a short message are the only two
   places the editor talks to the outside world. Supply your own handlers through
   PR.config if you have nicer dialogs than the browser ones. */
PR._ask = async function(opts){
  if (typeof PR.config.ask === 'function') return await PR.config.ask(opts);
  const r = window.prompt(opts.title, opts.value || '');
  return r === null ? null : r;
};
PR._toast = function(msg){
  if (typeof PR.config.toast === 'function') return PR.config.toast(msg);
  console.warn('[pianoroll] ' + msg);
};


/* ---------- key signatures ---------- */
const SHARPS = ['F','C','G','D','A','E','B'];
const FLATS  = ['B','E','A','D','G','C','F'];
const MAJ_SHARP = {'C':0,'G':1,'D':2,'A':3,'E':4,'B':5,'F#':6,'C#':7};
const MAJ_FLAT  = {'F':1,'Bb':2,'Eb':3,'Ab':4,'Db':5,'Gb':6,'Cb':7};
const SEMI = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};

/** Key signature: {letter: -1|0|1} plus a flag for sharp keys. */
function keySig(root, acc, mode){
  let name = (root||'C').toUpperCase() + (acc==='#'?'#':acc==='b'?'b':'');
  const m = (mode||'').toLowerCase();
  if (m.startsWith('m') && !m.startsWith('maj')) {          // minor -> relative major
    const order = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
    const semi = (SEMI[name[0]] + (name[1]==='#'?1:name[1]==='b'?-1:0) + 3 + 12) % 12;
    name = order[semi];
  }
  const out = {}; let sharp = true;
  if (name in MAJ_SHARP) { for (let i=0;i<MAJ_SHARP[name];i++) out[SHARPS[i]] = 1; }
  else if (name in MAJ_FLAT) { sharp = false; for (let i=0;i<MAJ_FLAT[name];i++) out[FLATS[i]] = -1; }
  return {map: out, sharp};
}

/* ---------- notes: ABC <-> MIDI ---------- */
function abcToMidi(letter, octMarks, accidental, sig){
  const up = letter === letter.toUpperCase();
  let oct = up ? 4 : 5;                                     // C..B = octave 4, c..b = 5
  for (const ch of octMarks) oct += (ch === "'" ? 1 : -1);
  const L = letter.toUpperCase();
  let alt = accidental !== null ? accidental : (sig.map[L] || 0);
  return 12 * (oct + 1) + SEMI[L] + alt;                    // MIDI: C4 = 60
}
function midiToAbc(midi, sig){
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  const SH = [['C',0],['C',1],['D',0],['D',1],['E',0],['F',0],['F',1],['G',0],['G',1],['A',0],['A',1],['B',0]];
  const FL = [['C',0],['D',-1],['D',0],['E',-1],['E',0],['F',0],['G',-1],['G',0],['A',-1],['A',0],['B',-1],['B',0]];
  let [L, alt] = (sig.sharp ? SH : FL)[pc];
  /* Always write the accidental explicitly. Then the note does not depend on the
     key signature or on what came earlier in the bar, and reads the same to us
     and to the model that generated it. */
  const mark = alt === 1 ? '^' : alt === -1 ? '_' : '=';
  let s = mark + (oct >= 5 ? L.toLowerCase() : L);
  const d = oct >= 5 ? oct - 5 : 4 - oct;
  for (let i = 0; i < d; i++) s += (oct >= 5 ? "'" : ',');
  return s;
}
PR.midiName = m => {
  const N = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return N[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
};
PR.isBlack = m => [1,3,6,8,10].includes(((m % 12) + 12) % 12);

/** Key name as it goes into the K: header. */
PR.keyName = k => k.root + (k.acc || '') + (k.mode || '');

/** Transpose a key by semitones, spelled the way humans write it (no Fb, no E#). */
PR.transposeKey = function(key, steps){
  const minor = /^m/i.test(key.mode || '') && !/^maj/i.test(key.mode || '');
  const MAJ = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const MIN = ['C','C#','D','Eb','E','F','F#','G','G#','A','Bb','B'];
  const pc = (SEMI[key.root] + (key.acc === '#' ? 1 : key.acc === 'b' ? -1 : 0) + steps) % 12;
  const name = (minor ? MIN : MAJ)[((pc % 12) + 12) % 12];
  return {root: name[0], acc: name.slice(1), mode: key.mode};
};

/* ---------- parsing ---------- */
PR.parse = function(abc){
  const lines = String(abc).replace(/\r/g,'').split('\n');
  const head = [], body = [];
  let inBody = false, headers = {};
  for (const ln of lines){
    if (!inBody){
      head.push(ln);
      const m = ln.match(/^([A-Za-z]):\s*(.*)$/);
      if (m){ if (m[1] === 'V'){ (headers.V = headers.V || []).push(m[2]); } else headers[m[1]] = m[2]; }
      if (/^K:/.test(ln)) inBody = true;
      continue;
    }
    body.push(ln);
  }
  const meter = (headers.M || '4/4').match(/(\d+)\s*\/\s*(\d+)/) || [0,'4','4'];
  const num = +meter[1], den = +meter[2];
  const unit = (headers.L || '1/8').match(/(\d+)\s*\/\s*(\d+)/) || [0,'1','8'];
  const unitLen = +unit[2];                                  // 32 for L:1/32
  const ticksPerBar = Math.round(num * unitLen / den);
  const tempo = +((headers.Q || '1/4=90').match(/=\s*(\d+)/) || [0,90])[1];
  const km = (headers.K || 'C').match(/^([A-Ga-g])([#b]?)\s*(\w*)/) || [0,'C','',''];
  const key = {root: km[1].toUpperCase(), acc: km[2] || '', mode: km[3] || ''};
  const sig = keySig(key.root, key.acc, key.mode);

  const voiceIds = [];
  for (const v of (headers.V || [])) { const id = (v.match(/^\s*(\S+)/) || [0,'V'])[1]; voiceIds.push(id); }
  if (!voiceIds.length) voiceIds.push('V1');

  const tracks = {}; const cursor = {};
  voiceIds.forEach(v => { tracks[v] = []; cursor[v] = 0; });
  const chords = [];                                        // {tick, name}
  const sections = [];                                      // {tick, name}
  let cur = voiceIds[0], pendingSection = null;
  const tiedBy = {};                     // an open tie belongs to a voice, not to a line

  const noteRe = /^(__|_|\^\^|\^|=)?([A-Ga-g])([,']*)(\d*)(\/\d*|\/+)?(-?)/;

  for (const raw of body){
    const ln = raw.trim();
    if (!ln) continue;
    if (ln.startsWith('%')){ pendingSection = ln.replace(/^%+\s*/,'').trim(); continue; }
    const vm = ln.match(/^V:\s*(\S+)/);
    if (vm){
      cur = voiceIds.includes(vm[1]) ? vm[1] : cur;
      if (pendingSection !== null){
        const t = cursor[cur];
        if (!sections.some(s => s.tick === t)) sections.push({tick: t, name: pendingSection});
        pendingSection = null;
      }
      continue;
    }
    let i = 0, accMem = {};
    let tied = tiedBy[cur] || null;      // pick up a tie started on this voice's previous line
    while (i < ln.length){
      const ch = ln[i];
      if (ch === ' ' || ch === '\t'){ i++; continue; }
      if (ch === '"'){                                        // chord
        const e = ln.indexOf('"', i + 1); if (e < 0) break;
        const name = ln.slice(i + 1, e);
        if (cur === voiceIds[0]) chords.push({tick: cursor[cur], name});
        i = e + 1; continue;
      }
      if (ch === '|' || ch === ':' || ch === ']' || ch === '['){ // bar line and repeats
        const bar = Math.ceil(cursor[cur] / ticksPerBar) * ticksPerBar;
        if (cursor[cur] < bar) cursor[cur] = bar;
        /* A tie must survive a bar line — that is exactly what it is for.
           Accidentals are the opposite: they only apply within their own bar. */
        i++; accMem = {}; continue;
      }
      if (ch === 'Z'){                                        // rest measured in whole bars
        const m = ln.slice(i).match(/^Z(\d*)/);
        cursor[cur] += ticksPerBar * (m[1] ? +m[1] : 1); i += m[0].length; tied = null; continue;
      }
      if (ch === 'z' || ch === 'x'){
        const m = ln.slice(i).match(/^[zx](\d*)(\/\d*|\/+)?/);
        cursor[cur] += durTicks(m[1], m[2], 1); i += m[0].length; tied = null; continue;
      }
      const nm = ln.slice(i).match(noteRe);
      if (nm){
        let acc = nm[1] ? (nm[1] === '^' ? 1 : nm[1] === '^^' ? 2 : nm[1] === '_' ? -1 : nm[1] === '__' ? -2 : 0) : null;
        /* An accidental holds for the same note in the same octave until the bar ends.
           Without this, notes after "=F" were read back through the key signature
           and came out a semitone off. */
        const memKey = nm[2] + nm[3];
        if (acc !== null) accMem[memKey] = acc;
        else if (memKey in accMem) acc = accMem[memKey];
        const midi = abcToMidi(nm[2], nm[3], acc, sig);
        const d = durTicks(nm[4], nm[5], 1);
        if (tied && tied.m === midi){ tied.d += d; }          // tie: extend the same note
        else { const n = {t: cursor[cur], d, m: midi}; tracks[cur].push(n); tied = n; }
        cursor[cur] += d;
        if (!nm[6]) tied = null;
        i += nm[0].length; continue;
      }
      i++;                                                    // skip everything else (ornaments, spaces)
    }
    tiedBy[cur] = tied;
  }
  function durTicks(numStr, slash, base){
    let d = base * (numStr ? +numStr : 1);
    if (slash){
      if (slash === '/') d = d / 2;
      else if (/^\/\d+$/.test(slash)) d = d / +slash.slice(1);
      else d = d / Math.pow(2, slash.length);
    }
    return Math.max(1, Math.round(d));
  }
  let bars = 0;
  for (const v of voiceIds) bars = Math.max(bars, Math.ceil(cursor[v] / ticksPerBar));
  for (const v of voiceIds) for (const n of tracks[v]) bars = Math.max(bars, Math.ceil((n.t + n.d) / ticksPerBar));
  for (const v of voiceIds) tracks[v].sort((a,b) => a.t - b.t || a.m - b.m);
  chords.sort((a,b) => a.tick - b.tick);
  sections.sort((a,b) => a.tick - b.tick);
  return {head, headers, voiceIds, tracks, chords, sections, sig, key,
          meter:{num, den}, unitLen, ticksPerBar, tempo, bars: Math.max(bars,1),
          keyName: PR.keyName(key)};
};

/* ---------- building ABC back ---------- */
PR.build = function(S){
  const tpb = S.ticksPerBar, sig = S.sig;
  const head = S.head.map(ln => {
    if (/^Q:/.test(ln)) return 'Q:1/4=' + S.tempo;
    if (/^K:/.test(ln) && S.key) return 'K:' + PR.keyName(S.key);
    return ln;
  });
  const chordAt = {};
  for (const c of S.chords) { const b = Math.floor(c.tick / tpb); if (!(b in chordAt)) chordAt[b] = c.name; }
  const sectionAt = {};
  for (const s of S.sections) sectionAt[Math.floor(s.tick / tpb)] = s.name;

  /* one voice within one bar: long notes are split at the bar line with a tie */
  function barText(voice, bar){
    const from = bar * tpb, to = from + tpb;
    const evs = [];
    for (const n of S.tracks[voice]){
      const s = Math.max(n.t, from), e = Math.min(n.t + n.d, to);
      if (e > s) evs.push({s, e, m: n.m, tieOut: (n.t + n.d) > to, tieIn: n.t < from});
    }
    evs.sort((a,b) => a.s - b.s || a.m - b.m);
    let out = '', pos = from;
    for (const ev of evs){
      if (ev.s > pos) out += 'z' + (ev.s - pos);
      else if (ev.s < pos) continue;                          // overlap: skip
      out += midiToAbc(ev.m, sig) + (ev.e - ev.s) + (ev.tieOut ? '-' : '');
      pos = ev.e;
    }
    if (pos < to) out += 'z' + (to - pos);
    if (out === '') out = 'z' + tpb;
    return out;
  }

  /* Lines break every 4 bars, but a section always starts a fresh line —
     otherwise a "% verse" marker would land mid-system and get lost. */
  const body = [];
  const perSystem = 4;
  let b0 = 0;
  while (b0 < S.bars){
    let end = Math.min(b0 + perSystem, S.bars);
    for (let b = b0 + 1; b < end; b++) if (sectionAt[b] !== undefined){ end = b; break; }
    if (sectionAt[b0] !== undefined) body.push('% ' + sectionAt[b0]);
    for (const v of S.voiceIds){
      const parts = [];
      for (let b = b0; b < end; b++){
        const ch = (v === S.voiceIds[0] && chordAt[b] !== undefined) ? '"' + chordAt[b] + '"' : '';
        parts.push(ch + barText(v, b));
      }
      body.push('V: ' + v);
      body.push(parts.join('|') + '|');
    }
    b0 = end;
  }
  return head.join('\n').replace(/\n+$/,'') + '\n' + body.join('\n') + '\n';
};

/* ============================================================
   THE EDITOR: notes as blocks on a grid, the usual piano-roll layout.
   PR.mount(host, state, onChange) -> {redraw, destroy, state}
   ============================================================ */
PR.mount = function(host, S, onChange){
  const UI = {voice: S.voiceIds[0], snap: Math.max(1, Math.round(S.unitLen / 8)), tickW: 5, rowH: 14,
              maxTickW: 24, sel: null, undo: [], hideOther: false};
  const KEYS_W = 62, RULER_H = 26;

  function range(){
    let lo = 127, hi = 0;
    for (const v of S.voiceIds) for (const n of S.tracks[v]) { if (n.m < lo) lo = n.m; if (n.m > hi) hi = n.m; }
    if (lo > hi) { lo = 48; hi = 72; }
    lo = Math.max(21, lo - 4); hi = Math.min(108, hi + 4);
    if (hi - lo < 24) { hi = Math.min(108, lo + 24); }
    return {lo, hi};
  }
  let R = range();
  const rows = () => R.hi - R.lo + 1;
  const yOf = m => (R.hi - m) * UI.rowH;
  const mOf = y => R.hi - Math.floor(y / UI.rowH);
  const xOf = t => t * UI.tickW;
  const tOf = x => Math.round(x / UI.tickW);
  const snapT = t => Math.max(0, Math.round(t / UI.snap) * UI.snap);

  host.innerHTML = `
    <div class="pr">
      <div class="pr-toolbar">
        <span class="pr-info" id="pr-info"></span>
        <span class="pr-sp"></span>
        <label class="pr-lab">${PR.t('voice')}
          <select class="b" id="pr-voice">${S.voiceIds.map(v=>`<option value="${v}">${v==='Vocal'?PR.t('vocal'):v==='Ins'?PR.t('instrument'):v}</option>`).join('')}</select></label>
        <label class="pr-lab">${PR.t('step')}
          <select class="b" id="pr-snap">
            <option value="${S.unitLen/4}">1/4</option><option value="${S.unitLen/8}">1/8</option>
            <option value="${S.unitLen/16}">1/16</option><option value="${S.unitLen/32}">1/32</option>
          </select></label>
        <label class="pr-lab">${PR.t('tempo')} <input class="b pr-num" id="pr-tempo" inputmode="numeric" value="${S.tempo}"></label>
        <button class="b" id="pr-oct-up" title="${PR.t('octUpT')}">${PR.t('octUp')}</button>
        <button class="b" id="pr-oct-dn" title="${PR.t('octDnT')}">${PR.t('octDn')}</button>
        <button class="b" id="pr-tr-up" title="${PR.t('trUpT')}">${PR.t('trUp')}</button>
        <button class="b" id="pr-tr-dn" title="${PR.t('trDnT')}">${PR.t('trDn')}</button>
        <button class="b" id="pr-zoom-in">＋</button>
        <button class="b" id="pr-zoom-out">－</button>
        <button class="b" id="pr-undo" disabled>${PR.t('undo')}</button>
      </div>
      <div class="pr-toolbar">
        <button class="b accent" id="pr-play">${PR.t('play')}</button>
        <button class="b" id="pr-stop">${PR.t('stop')}</button>
        <label class="pr-lab">${PR.t('audible')}
          <select class="b" id="pr-solo">
            <option value="all">${PR.t('bothVoices')}</option>
            <option value="voice">${PR.t('selectedOnly')}</option>
          </select></label>
        <span class="pr-time" id="pr-time">0:00</span>
        <label class="pr-lab" title="${PR.t('nudgeT')}">
          ${PR.t('nudge')} <input type="range" id="pr-nudge" min="-300" max="1200" step="10" class="pr-range">
          <span class="pr-nudge-val" id="pr-nudge-val">0${PR.t('ms')}</span></label>
        <span class="pr-hint">${PR.t('playHint')}</span>
      </div>
      <div class="pr-hint">${PR.t('editHint')}</div>
      <div class="pr-main">
        <div class="pr-corner"></div>
        <div class="pr-ruler-wrap"><div class="pr-ruler" id="pr-ruler"></div></div>
        <div class="pr-keys-wrap"><div class="pr-keys" id="pr-keys"></div></div>
        <div class="pr-grid-wrap" id="pr-gw"><div class="pr-grid" id="pr-grid"><div class="pr-notes" id="pr-notes"></div><div class="pr-head" id="pr-head"></div></div></div>
      </div>
    </div>`;

  const $$$ = id => host.querySelector('#' + id);
  const gw = $$$('pr-gw'), grid = $$$('pr-grid'), notesEl = $$$('pr-notes'),
        keysEl = $$$('pr-keys'), rulerEl = $$$('pr-ruler');

  $$$('pr-snap').value = String(UI.snap);

  function push(){ UI.undo.push(JSON.stringify({tracks: S.tracks, chords: S.chords, tempo: S.tempo}));
    if (UI.undo.length > 60) UI.undo.shift(); $$$('pr-undo').disabled = false; }
  function undo(){ const s = UI.undo.pop(); if (!s) return;
    const d = JSON.parse(s); S.tracks = d.tracks; S.chords = d.chords; S.tempo = d.tempo;
    $$$('pr-tempo').value = S.tempo; $$$('pr-undo').disabled = !UI.undo.length;
    UI.sel = null; R = range(); drawAll(); fire(); }
  function fire(){ if (onChange) onChange(S); info(); }

  function info(){
    const secs = Math.round(S.bars * S.meter.num * 60 / S.tempo / (S.meter.den / 4));
    const n = S.voiceIds.reduce((a,v) => a + S.tracks[v].length, 0);
    $$$('pr-info').textContent = PR.t('info', {bars:S.bars, tempo:S.tempo, key:S.keyName, notes:n,
        time:`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`});
  }

  function drawKeys(){
    let h = '';
    for (let m = R.hi; m >= R.lo; m--){
      const nm = PR.midiName(m), black = PR.isBlack(m);
      h += `<div class="pr-key${black?' bk':''}" style="height:${UI.rowH}px">${(m%12===0||UI.rowH>=14)?nm:(black?'':nm)}</div>`;
    }
    keysEl.innerHTML = h; keysEl.style.height = rows() * UI.rowH + 'px';
  }
  function drawRuler(){
    const secAt = {}; S.sections.forEach(s => secAt[Math.floor(s.tick / S.ticksPerBar)] = s.name);
    const chAt = {}; S.chords.forEach(c => { const b = Math.floor(c.tick / S.ticksPerBar); if (!(b in chAt)) chAt[b] = c.name; });
    let h = '';
    for (let b = 0; b < S.bars; b++){
      const w = S.ticksPerBar * UI.tickW;
      h += `<div class="pr-bar" style="left:${b*w}px;width:${w}px">
        <span class="pr-bn">${b+1}</span>
        ${secAt[b]!==undefined?`<span class="pr-sec">${secAt[b]}</span>`:''}
        <span class="pr-ch" data-bar="${b}" title="${PR.t('chordEditT')}">${chAt[b]!==undefined?chAt[b]:'·'}</span></div>`;
    }
    rulerEl.innerHTML = h;
    rulerEl.style.width = S.bars * S.ticksPerBar * UI.tickW + 'px';
  }
  function drawGrid(){
    const w = S.bars * S.ticksPerBar * UI.tickW, h = rows() * UI.rowH;
    grid.style.width = w + 'px'; grid.style.height = h + 'px';
    const beat = Math.round(S.unitLen / S.meter.den);
    grid.style.backgroundImage =
      `repeating-linear-gradient(to bottom, var(--pr-row) 0 1px, transparent 1px ${UI.rowH}px),` +
      `repeating-linear-gradient(to right, var(--pr-beat) 0 1px, transparent 1px ${beat*UI.tickW}px),` +
      `repeating-linear-gradient(to right, var(--pr-bar) 0 1px, transparent 1px ${S.ticksPerBar*UI.tickW}px)`;
    // black keys get a striped background
    let bands = '';
    for (let m = R.hi; m >= R.lo; m--) if (PR.isBlack(m)) bands += `<div class="pr-band" style="top:${yOf(m)}px;height:${UI.rowH}px"></div>`;
    let old = grid.querySelector('.pr-bands'); if (old) old.remove();
    const bd = document.createElement('div'); bd.className = 'pr-bands'; bd.innerHTML = bands;
    grid.insertBefore(bd, notesEl);
  }
  function drawNotes(){
    let h = '';
    for (const v of S.voiceIds){
      const mine = v === UI.voice;
      if (!mine && UI.hideOther) continue;
      for (let i = 0; i < S.tracks[v].length; i++){
        const n = S.tracks[v][i];
        if (n.m < R.lo || n.m > R.hi) continue;
        const sel = mine && UI.sel && UI.sel.v === v && UI.sel.i === i;
        h += `<div class="pr-note${mine?'':' other'}${sel?' sel':''}" data-v="${v}" data-i="${i}"
                style="left:${xOf(n.t)}px;top:${yOf(n.m)+1}px;width:${Math.max(3,xOf(n.d)-1)}px;height:${UI.rowH-2}px"></div>`;
      }
    }
    notesEl.innerHTML = h;
    if (typeof PLAY !== 'undefined' && PLAY.on) buildIndex();
  }
  function drawAll(){ drawKeys(); drawRuler(); drawGrid(); drawNotes(); info(); }

  /* --- interaction --- */
  let drag = null, lastHit = null;
  grid.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const r = grid.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let el = e.target.closest('.pr-note');
    /* Clicking a grey note (one belonging to the other voice) switches to that voice
       and picks the note up. Without this you get "I can see the notes but cannot
       move them", which was the single most common confusion. */
    if (el && el.dataset.v !== UI.voice){
      UI.voice = el.dataset.v;
      $$$('pr-voice').value = UI.voice;
      UI.sel = {v: UI.voice, i: +el.dataset.i};
      drawNotes();
      el = notesEl.querySelector('.pr-note[data-v="' + UI.voice + '"][data-i="' + el.dataset.i + '"]') || el;
    }
    if (el && el.dataset.v === UI.voice){
      const i = +el.dataset.i, n = S.tracks[UI.voice][i];
      /* We detect the double click ourselves: after a drag the grid is redrawn and
         the DOM node is replaced, so the native dblclick event never reaches us. */
      const now = Date.now();
      if (lastHit && lastHit.i === i && now - lastHit.at < 400){
        lastHit = null; push();
        S.tracks[UI.voice].splice(i, 1); UI.sel = null; recount(); drawNotes(); fire();
        e.preventDefault(); return;
      }
      lastHit = {i, at: now};
      const right = xOf(n.t + n.d), wpx = xOf(n.d);
      /* The resize strip is a fraction of the note, not a fixed 7 pixels: a short
         3px note fell entirely inside it, which made dragging simply impossible. */
      const grab = Math.max(2, Math.min(7, wpx * 0.28));
      push();
      drag = {mode: (right - x <= grab ? 'resize' : 'move'), i, x0: x, y0: y, t0: n.t, d0: n.d, m0: n.m};
      UI.sel = {v: UI.voice, i}; drawNotes();
    } else if (!el){
      lastHit = null; push();
      const t = snapT(tOf(x)), m = mOf(y);
      const n = {t, d: UI.snap, m};
      S.tracks[UI.voice].push(n);
      S.tracks[UI.voice].sort((a,b) => a.t - b.t || a.m - b.m);
      normalize(UI.voice, n);
      const i = S.tracks[UI.voice].indexOf(n);
      UI.sel = {v: UI.voice, i};
      drag = {mode: 'resize', i, x0: xOf(t + UI.snap), y0: y, t0: n.t, d0: n.d, m0: m};
      recount(); drawNotes(); fire();
    }
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    const r = grid.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const n = S.tracks[UI.voice][drag.i]; if (!n) { drag = null; return; }
    if (drag.mode === 'move'){
      n.t = snapT(drag.t0 + tOf(x - drag.x0));
      n.m = Math.min(127, Math.max(0, drag.m0 + (mOf(y) - mOf(drag.y0))));
    } else {
      const want = snapT(tOf(x) - n.t);
      n.d = Math.max(UI.snap, want || UI.snap);
    }
    drawNotes();
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const keep = S.tracks[UI.voice][drag.i] || null;
    drag = null;
    normalize(UI.voice, keep);
    UI.sel = keep ? {v: UI.voice, i: S.tracks[UI.voice].indexOf(keep)} : null;
    if (UI.sel && UI.sel.i < 0) UI.sel = null;
    recount(); R = range(); drawAll(); fire();
  });
  rulerEl.addEventListener('click', async e => {
    const ch = e.target.closest('.pr-ch'); if (!ch) return;
    const bar = +ch.dataset.bar;
    const curName = ch.textContent === '·' ? '' : ch.textContent;
    /* goes through PR.config.ask: browser dialogs can be switched off by the user */
    const v = await PR._ask({title: PR.t('chordTitle') + (bar + 1), value: curName,
                           placeholder: PR.t('chordPlaceholder'), ok: PR.t('chordOk')});
    if (v === null) return;
    push();
    S.chords = S.chords.filter(c => Math.floor(c.tick / S.ticksPerBar) !== bar);
    if (v.trim()) S.chords.push({tick: bar * S.ticksPerBar, name: v.trim()});
    S.chords.sort((a,b) => a.tick - b.tick);
    drawRuler(); fire();
  });
  /* A song must never shrink by itself: trailing silent bars are part of the form
     (an outro, a fade). So the original length is a floor; growing is allowed. */
  const baseBars = S.bars;
  /* A voice is monophonic here: there is no way to write two notes at the same spot,
     and one of them used to be silently dropped when building ABC. So after every edit
     we separate overlaps by trimming the neighbours, leaving the note you just moved
     untouched. What you see is what gets sung. */
  function normalize(v, keepNote){
    const arr = S.tracks[v];
    arr.sort((a, b) => a.t - b.t || a.m - b.m);
    for (let i = 0; i < arr.length - 1; ){
      const a = arr[i], b = arr[i + 1];
      if (b.t < a.t + a.d){
        if (b === keepNote){                       // trim the previous one
          a.d = b.t - a.t;
          if (a.d <= 0) { arr.splice(i, 1); continue; }
        } else {                                   // trim the next one
          const shift = (a.t + a.d) - b.t;
          b.t += shift; b.d -= shift;
          if (b.d <= 0) { arr.splice(i + 1, 1); continue; }
          arr.sort((x, y) => x.t - y.t || x.m - y.m);
          i = 0; continue;
        }
      }
      i++;
    }
  }
  function recount(){
    let bars = 1;
    for (const v of S.voiceIds) for (const n of S.tracks[v]) bars = Math.max(bars, Math.ceil((n.t + n.d) / S.ticksPerBar));
    S.bars = Math.max(baseBars, bars);
  }
  host.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && UI.sel){
      push(); S.tracks[UI.sel.v].splice(UI.sel.i, 1); UI.sel = null; recount(); drawNotes(); fire(); e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){ undo(); e.preventDefault(); }
  });
  host.tabIndex = 0;

  gw.addEventListener('scroll', () => {
    host.querySelector('.pr-ruler-wrap').scrollLeft = gw.scrollLeft;
    host.querySelector('.pr-keys-wrap').scrollTop = gw.scrollTop;
  });
  $$$('pr-voice').onchange = e => { UI.voice = e.target.value; UI.sel = null; drawNotes(); };
  $$$('pr-snap').onchange = e => { UI.snap = Math.max(1, +e.target.value); };
  $$$('pr-tempo').onchange = e => { const t = parseInt(e.target.value, 10);
    if (t >= 20 && t <= 300){ push(); S.tempo = t; fire(); } else e.target.value = S.tempo; };
  $$$('pr-oct-up').onclick = () => { push(); S.tracks[UI.voice].forEach(n => n.m = Math.min(127, n.m + 12)); normalize(UI.voice, null); R = range(); drawAll(); fire(); };
  $$$('pr-oct-dn').onclick = () => { push(); S.tracks[UI.voice].forEach(n => n.m = Math.max(0, n.m - 12)); normalize(UI.voice, null); R = range(); drawAll(); fire(); };
  /* Transpose the notes AND the key in the header: otherwise the score tells the
     model one thing while the notes say another, and the song comes out in the
     wrong key. */
  function transposeAll(steps){
    push();
    for (const v of S.voiceIds) S.tracks[v].forEach(n => n.m = Math.min(127, Math.max(0, n.m + steps)));
    if (S.key){
      S.key = PR.transposeKey(S.key, steps);
      S.sig = keySig(S.key.root, S.key.acc, S.key.mode);
      S.keyName = PR.keyName(S.key);
    }
    R = range(); drawAll(); fire();
  }
  $$$('pr-tr-up').onclick = () => transposeAll(1);
  $$$('pr-tr-dn').onclick = () => transposeAll(-1);
  $$$('pr-zoom-in').onclick = () => { UI.tickW = Math.min(UI.maxTickW, UI.tickW * 1.5); drawAll(); };
  $$$('pr-zoom-out').onclick = () => { UI.tickW = Math.max(1, UI.tickW / 1.5); drawAll(); };
  $$$('pr-undo').onclick = undo;

  /* ---------- playback (Web Audio, nothing downloaded) ----------
     The score is already a list of {t,d,m} events, so synthesising it with plain
     oscillators is simpler and more reliable than fetching a soundfont. */
  const PLAY = {ctx: null, nodes: [], t0: 0, from: 0, raf: 0, on: false, idx: null, lit: new Set(), bar: -1,
                nudge: (() => { try { const v = localStorage.getItem(PR.config.storageKey); return v === null ? null : (parseFloat(v) || 0); } catch(e){ return null; } })()};

  /* Highlighting what is sounding: keep a map of node -> tick range and each frame
     toggle the class only on notes whose state actually changed. */
  function buildIndex(){
    PLAY.idx = [];
    for (const el of notesEl.children){
      const n = (S.tracks[el.dataset.v] || [])[+el.dataset.i];
      if (n) PLAY.idx.push({el, s: n.t, e: n.t + n.d});
    }
    PLAY.lit = new Set();
  }
  function highlight(t){
    if (!PLAY.idx) return;
    const next = new Set();
    for (const o of PLAY.idx) if (o.s <= t && t < o.e) next.add(o.el);
    for (const el of PLAY.lit) if (!next.has(el)) el.classList.remove('now');
    for (const el of next) if (!PLAY.lit.has(el)) el.classList.add('now');
    PLAY.lit = next;
    const bar = Math.floor(t / S.ticksPerBar);
    if (bar !== PLAY.bar){
      const old = rulerEl.querySelector('.pr-bar.now'); if (old) old.classList.remove('now');
      const nb = rulerEl.children[bar]; if (nb) nb.classList.add('now');
      PLAY.bar = bar;
    }
  }
  function unhighlight(){
    for (const el of PLAY.lit) el.classList.remove('now');
    PLAY.lit = new Set();
    const old = rulerEl.querySelector('.pr-bar.now'); if (old) old.classList.remove('now');
    PLAY.bar = -1;
  }
  const tickSec = () => (4 / S.unitLen) * 60 / S.tempo;

  function voiceTone(ctx, dest, kind, midi, at, dur){
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = kind === 'lead' ? 'triangle' : 'sine';
    o.frequency.value = f;
    const peak = kind === 'lead' ? 0.20 : 0.11;
    const end = at + Math.max(0.05, dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    g.gain.exponentialRampToValueAtTime(peak * 0.65, at + Math.min(0.12, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g); g.connect(dest);
    o.start(at); o.stop(end + 0.03);
    PLAY.nodes.push(o, g);
  }

  function stop(){
    PLAY.on = false;
    if (PLAY.raf) cancelAnimationFrame(PLAY.raf), PLAY.raf = 0;
    for (const n of PLAY.nodes) { try { n.stop ? n.stop() : n.disconnect(); } catch(e){} try { n.disconnect(); } catch(e){} }
    PLAY.nodes = []; PLAY.queue = null; PLAY.qi = 0; PLAY.master = null;
    unhighlight();
    $$$('pr-play').textContent = PR.t('play');
    head(PLAY.from);
  }

  async function play(){
    if (PLAY.on) { stop(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { PR._toast(PR.t('noAudio')); return; }
    PLAY.ctx = PLAY.ctx || new AC();
    /* WAIT for the audio engine: while the context is suspended its clock is frozen,
       and a start time computed before it wakes up drifts against the highlight. */
    if (PLAY.ctx.state === 'suspended') { try { await PLAY.ctx.resume(); } catch(e){} }
    const ctx = PLAY.ctx, master = ctx.createGain();
    if (PLAY.nudge === null){                       // the user has not chosen an offset yet
      PLAY.nudge = Math.min(1.2, Math.max(-0.3, ctx.outputLatency || ctx.baseLatency || 0.1));
      const sl = $$$('pr-nudge'), lb = $$$('pr-nudge-val');
      if (sl) sl.value = String(Math.round(PLAY.nudge * 1000));
      if (lb) lb.textContent = Math.round(PLAY.nudge * 1000) + PR.t('ms');
    }
    master.gain.value = 0.9; master.connect(ctx.destination);
    PLAY.nodes.push(master);
    PLAY.master = master;

    /* Build the event list and schedule it in CHUNKS as playback goes.
       Scheduling a thousand notes at once takes hundreds of milliseconds by itself,
       and the beginning drifts away from the picture. */
    const solo = $$$('pr-solo').value;
    const ts = tickSec();
    const ev = [];
    let last = PLAY.from;
    for (const v of S.voiceIds){
      if (solo === 'voice' && v !== UI.voice) continue;
      const kind = v === UI.voice ? 'lead' : 'pad';
      for (const n of S.tracks[v]){
        if (n.t + n.d <= PLAY.from) continue;
        ev.push({t: Math.max(n.t, PLAY.from), d: n.d, m: n.m, kind});
        last = Math.max(last, n.t + n.d);
      }
    }
    ev.sort((a, b) => a.t - b.t);
    PLAY.queue = ev; PLAY.qi = 0;

    const start = ctx.currentTime + 0.25;      // headroom so the first notes are not late
    PLAY.t0 = start; PLAY.on = true;
    buildIndex();
    $$$('pr-play').textContent = PR.t('pause');
    const total = (last - PLAY.from) * ts;

    function pump(now){                        // schedule everything sounding within the next 2s
      const horizon = now + 2;
      while (PLAY.qi < PLAY.queue.length){
        const e = PLAY.queue[PLAY.qi];
        const at = start + (e.t - PLAY.from) * ts;
        if (at > horizon) break;
        voiceTone(ctx, master, e.kind, e.m, Math.max(at, ctx.currentTime), e.d * ts);
        PLAY.qi++;
      }
    }
    pump(ctx.currentTime);

    /* Measure against the moment actually being heard, not the moment scheduled:
       audio leaves the card later by its output latency, and the highlight ran ahead. */
    (function tick(){
      if (!PLAY.on) return;
      let now = ctx.currentTime;
      if (typeof ctx.getOutputTimestamp === 'function'){
        const st = ctx.getOutputTimestamp();
        if (st && st.contextTime) now = st.contextTime;
        else now -= (ctx.outputLatency || ctx.baseLatency || 0);
      } else {
        now -= (ctx.outputLatency || ctx.baseLatency || 0);
      }
      now -= (PLAY.nudge || 0);
      PLAY.diag = {cur: ctx.currentTime, heard: now + (PLAY.nudge || 0),
                   outLat: ctx.outputLatency || 0, baseLat: ctx.baseLatency || 0, nudge: PLAY.nudge};
      pump(ctx.currentTime);
      const el = now - PLAY.t0;
      if (el > total + 0.3) { stop(); return; }
      const t = PLAY.from + Math.max(0, el) / ts;
      head(t); clock(t); highlight(t);
      PLAY.raf = requestAnimationFrame(tick);
    })();
  }

  function head(t){
    const h = $$$('pr-head'); if (!h) return;
    h.style.left = xOf(t) + 'px';
    h.style.display = 'block';   // must be 'block': an empty string would restore display:none from the stylesheet
    if (PLAY.on){
      const x = xOf(t), w = gw.clientWidth;
      if (x < gw.scrollLeft + 60 || x > gw.scrollLeft + w - 60) gw.scrollLeft = Math.max(0, x - w / 3);
    }
  }
  function clock(t){
    const sec = Math.max(0, Math.round(t * tickSec()));
    $$$('pr-time').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  $$$('pr-nudge').value = String(Math.round((PLAY.nudge || 0) * 1000));
  $$$('pr-nudge-val').textContent = PLAY.nudge === null ? PR.t('auto') : (Math.round(PLAY.nudge * 1000) + PR.t('ms'));
  $$$('pr-nudge').oninput = e => {
    PLAY.nudge = (parseFloat(e.target.value) || 0) / 1000;
    $$$('pr-nudge-val').textContent = Math.round(PLAY.nudge * 1000) + PR.t('ms');
    try { localStorage.setItem(PR.config.storageKey, String(PLAY.nudge)); } catch(err){}
  };
  $$$('pr-play').onclick = play;
  $$$('pr-stop').onclick = () => { stop(); PLAY.from = 0; head(0); clock(0); };
  rulerEl.addEventListener('mousedown', e => {
    if (e.target.closest('.pr-ch')) return;
    const r = rulerEl.getBoundingClientRect();
    const wasOn = PLAY.on; stop();
    PLAY.from = snapT(tOf(e.clientX - r.left)); head(PLAY.from); clock(PLAY.from);
    if (wasOn) play();
  });
  host.addEventListener('keydown', e => {
    if (e.key === ' ' && !/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))){ play(); e.preventDefault(); }
  });

  /* A score shorter than the viewport used to render as a narrow strip with dead
     space to its right. Stretch the grid to fill the width instead. We only ever
     stretch, never shrink: a long score must keep its detail and stay scrollable. */
  function fitWidth(){
    const avail = gw.clientWidth - 2, ticks = S.bars * S.ticksPerBar;
    if (avail <= 0 || !ticks) return false;
    const need = avail / ticks;
    if (need <= UI.tickW) return false;
    UI.tickW = Math.min(UI.maxTickW, need);
    return true;
  }
  fitWidth();

  /* Re-fit when the container changes size (window resize, a panel opening).
     One observer per host: re-mounting replaces the markup, and a stale observer
     would keep redrawing elements that are no longer on the page. */
  if (host._prResize) host._prResize.disconnect();
  if (typeof ResizeObserver === 'function'){
    host._prResize = new ResizeObserver(() => { if (fitWidth()) drawAll(); rememberHeight(); });
    host._prResize.observe(gw);
  }

  /* The height someone drags the editor to is worth keeping — having to set it again
     on every open is the kind of small friction that makes a tool feel unfinished.
     Only an explicitly dragged height leaves an inline style, so nothing is stored
     when the host page sizes the editor itself. */
  const mainEl = host.querySelector('.pr-main');
  const H_KEY = PR.config.storageKey + '_height';
  (function restoreHeight(){
    try { const h = localStorage.getItem(H_KEY); if (h && mainEl) mainEl.style.height = h; } catch (e) {}
  })();
  function rememberHeight(){
    if (!mainEl || !mainEl.style.height) return;
    try { localStorage.setItem(H_KEY, mainEl.style.height); } catch (e) {}
  }

  drawAll(); head(0); clock(0);
  /* Scroll to where the selected voice enters: there is usually no vocal in the
     intro, and an empty grid looks like the editor failed to load anything. */
  (function(){
    const first = S.tracks[UI.voice][0];
    if (first) gw.scrollLeft = Math.max(0, xOf(first.t) - 120);
    const mid = first ? first.m : 60;
    gw.scrollTop = Math.max(0, yOf(mid) - gw.clientHeight / 2);
  })();
  $$$('pr-voice').addEventListener('change', () => {
    const f = S.tracks[UI.voice][0];
    if (f) gw.scrollLeft = Math.max(0, xOf(f.t) - 120);
  });
  return {redraw: drawAll, state: S, ui: UI, stop};
};

/* ============================================================
   FITTING THE MELODY TO THE LYRICS.
   A cover falls apart when a melodic phrase has more or fewer notes than the line
   of lyrics has syllables: the model fills the gap with words that do not exist.
   So we adjust the melody rather than the words — merging surplus notes and
   splitting long ones, keeping the contour and the rhythm intact.
   ============================================================ */
const VOWELS_CYR = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ';
const VOWELS_LAT = 'aeiouyAEIOUY';

/** Syllable count for a line of lyrics.
 *
 *  Cyrillic and Latin need different rules, and using one rule for both was wrong:
 *  in Russian every vowel letter is its own syllable, adjacent ones included
 *  (моя = 2, поэт = 2, аэропорт = 4). Merging runs of vowels — correct for English,
 *  where "rain" is one syllable — undercounted those words badly.
 *
 *  So: Cyrillic vowels are counted one by one, Latin vowel runs collapse into one,
 *  a silent trailing "e" is dropped, and a word never counts as less than one
 *  syllable. Russian comes out exact; English is a good approximation, which is
 *  all a simple letter-based counter can honestly promise. */
PR.syllables = function(line){
  let n = 0;
  for (const word of String(line).split(/[^\p{L}'’-]+/u)){
    if (!word) continue;
    let w = 0, prevLat = false;
    for (const ch of word){
      if (VOWELS_CYR.includes(ch)){ w++; prevLat = false; continue; }
      const lat = VOWELS_LAT.includes(ch);
      if (lat && !prevLat) w++;
      prevLat = lat;
    }
    // "rate" and "come" end in a vowel that is written but not sung
    if (w > 1 && /[eE]$/.test(word) && !/[aeiouyAEIOUY]{2}[eE]$/.test(word)) w--;
    n += Math.max(w, /[\p{L}]/u.test(word) ? 1 : 0);
  }
  return n;
};

/** Lyric lines, with section tags and blanks removed. */
PR.lyricLines = function(lyrics){
  return String(lyrics).split('\n')
    .map(l => l.trim())
    .filter(l => l && !/^\[.*\]$/.test(l))
    .map(l => ({text: l, syl: PR.syllables(l)}))
    .filter(l => l.syl > 0);
};

/** Split the vocal line into phrases at the rests. */
function phrasesOf(notes, gap){
  const out = [];
  let cur = [];
  for (let i = 0; i < notes.length; i++){
    if (cur.length){
      const prev = cur[cur.length - 1];
      if (notes[i].t - (prev.t + prev.d) >= gap){ out.push(cur); cur = []; }
    }
    cur.push(notes[i]);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Merge surplus notes in a phrase: short pairs and repeated pitches go first. */
function shrink(ph, target){
  while (ph.length > target && ph.length > 1){
    let best = 0, bestScore = Infinity;
    for (let i = 0; i < ph.length - 1; i++){
      const a = ph[i], b = ph[i + 1];
      const score = a.d + b.d + (a.m === b.m ? -1000 : 0);   // prefer merging equal pitches
      if (score < bestScore){ bestScore = score; best = i; }
    }
    const a = ph[best], b = ph[best + 1];
    a.d = (b.t + b.d) - a.t;            // the first note absorbs the second one's length
    ph.splice(best + 1, 1);
  }
}

/** Add notes to a phrase: halve the longest ones, keeping the pitch. */
function grow(ph, target){
  let guard = 0;
  while (ph.length < target && guard++ < 500){
    let best = -1, bestD = 1;
    for (let i = 0; i < ph.length; i++) if (ph[i].d > bestD){ bestD = ph[i].d; best = i; }
    if (best < 0) break;                // nothing left to split: every note is one tick
    const n = ph[best];
    const half = Math.floor(n.d / 2);
    if (half < 1) break;
    const rest = n.d - half;
    n.d = half;
    ph.splice(best + 1, 0, {t: n.t + half, d: rest, m: n.m});
  }
}

/**
 * Fit the vocal line to the lyrics.
 * Returns a report: notes before/after, syllable count, phrases touched.
 */
PR.fitToLyrics = function(S, lyrics, voice){
  voice = voice || S.voiceIds[0];
  const lines = PR.lyricLines(lyrics);
  if (!lines.length) return {ok: false, error: PR.t('noLyricLines')};
  const notes = S.tracks[voice].slice().sort((a, b) => a.t - b.t);
  if (!notes.length) return {ok: false, error: PR.t('noVocalLine')};

  const before = notes.length;
  const need = lines.reduce((a, l) => a + l.syl, 0);
  const gap = Math.max(1, Math.round(S.ticksPerBar / 4));    // a rest of a quarter bar starts a new phrase
  const ph = phrasesOf(notes, gap);

  /* Distribute syllables across phrases IN PROPORTION to their length, rather than
     assuming "one line = one phrase": the counts almost never match. What matters is
     that the totals agree, otherwise the model invents words to fill the gap. */
  const total = ph.reduce((a, p) => a + p.length, 0);
  const target = ph.map(p => Math.max(1, Math.round(need * p.length / total)));
  // adjust the sum to the exact syllable count
  let diff = need - target.reduce((a, b) => a + b, 0);
  for (let guard = 0; diff !== 0 && guard < 5000; guard++){
    let idx = 0;
    if (diff > 0){                                          // add where the notes are longest
      let best = -1; for (let i = 0; i < ph.length; i++){ const cap = ph[i].reduce((a, n) => a + n.d, 0) / target[i]; if (cap > best){ best = cap; idx = i; } }
      target[idx]++; diff--;
    } else {
      let worst = Infinity; for (let i = 0; i < ph.length; i++){ if (target[i] > 1 && target[i] < worst){ worst = target[i]; idx = i; } }
      if (worst === Infinity) break;
      target[idx]--; diff++;
    }
  }

  let touched = 0;
  for (let i = 0; i < ph.length; i++){
    if (ph[i].length > target[i]){ shrink(ph[i], target[i]); touched++; }
    else if (ph[i].length < target[i]){ grow(ph[i], target[i]); touched++; }
  }
  const out = [];
  for (const p of ph) for (const n of p) out.push(n);
  out.sort((a, b) => a.t - b.t || a.m - b.m);
  S.tracks[voice] = out;
  return {ok: true, before, after: out.length, syllables: need,
          lines: lines.length, phrases: ph.length, touched,
          exact: out.length === need};
};

/* ---------- exports ----------
   Works as a plain <script> (window.PR), and as a CommonJS module so the
   parser and the lyric fitting can be unit-tested outside a browser. */
if (typeof module !== 'undefined' && module.exports) module.exports = PR;
if (typeof globalThis !== 'undefined') globalThis.PR = PR;
