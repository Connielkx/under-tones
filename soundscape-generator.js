/* UNDER-tones — Generate your own soundscape.
 * Browser-only: the photo is resized, analysed and turned into audio on the visitor's device.
 * Nothing is uploaded. Analysis = SegFormer-B0 (Cityscapes) via Transformers.js, loaded on demand.
 * Audio = Web Audio synthesis (seeded noise + oscillators), rendered offline to a 30 s WAV.
 * Mapping and rules: generator/class_mapping.json, generator/audio_rules.json.
 */
(function () {
  'use strict';

  var TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
  var MAX_BYTES = 10 * 1024 * 1024;          // 10 MB file limit
  var MAX_PIXELS = 50e6;                     // 50 megapixels decoded
  var MAX_SIDE = 1024;                       // client-side resize, longest side
  var MODEL_TIMEOUT_MS = 120000, INFER_TIMEOUT_MS = 90000;
  var TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  var $ = function (id) { return document.getElementById(id); };
  var root = $('generator');
  if (!root) return;

  var els = {
    file: $('g-file'), drop: $('g-drop'), view: $('g-view'), img: $('g-img'), ov: $('g-ov'),
    replace: $('g-replace'), uploadErr: $('g-upload-err'),
    s2: $('g-step2'), s3: $('g-step3'), analyze: $('g-analyze'), manualBtn: $('g-manual-btn'),
    analyzeStatus: $('g-analyze-status'), results: $('g-results'), opacity: $('g-opacity'),
    opacityWrap: $('g-opacity-wrap'), bar: $('g-bar'), legend: $('g-legend'), denom: $('g-denom'),
    classes: $('g-classes'), cues: $('g-cues'), manual: $('g-manual'), mode: $('g-mode'),
    rail: $('g-rail'), traffic: $('g-traffic'), peds: $('g-peds'),
    gen: $('g-generate'), status: $('g-status'), out: $('g-out'), audio: $('g-audio'),
    dl: $('g-download'), summary: $('g-summary'), reset: $('g-reset'), steps: root.querySelectorAll('.g-steps li')
  };

  var MAP = null, RULES = null;
  var state = { canvas: null, scene: null, busy: false, token: 0, audioUrl: null };
  var seg = null, segLoading = null;

  function setStep(n) {
    els.steps.forEach(function (li, i) {
      li.classList.toggle('on', i + 1 <= n);
      if (i + 1 === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    els.s2.disabled = n < 2; els.s3.disabled = n < 3;
    els.gen.disabled = n < 3 || state.busy;
  }
  function say(el, msg, isErr) { el.textContent = msg || ''; el.classList.toggle('err', !!isErr); }
  function withTimeout(p, ms, what) {
    return Promise.race([p, new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error('timeout:' + what)); }, ms);
    })]);
  }

  /* ---------- config ---------- */
  var cfgReady = Promise.all([
    fetch('generator/class_mapping.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }),
    fetch('generator/audio_rules.json').then(function (r) { if (!r.ok) throw 0; return r.json(); })
  ]).then(function (a) { MAP = a[0]; RULES = a[1]; buildManual(); })
    .catch(function () {
      say(els.uploadErr, 'The generator could not load its settings. Please reload the page; the case recordings above are unaffected.', true);
      els.file.disabled = true;
    });

  /* ---------- 01 upload ---------- */
  els.file.addEventListener('change', function () { if (els.file.files[0]) takeFile(els.file.files[0]); });
  ['dragenter', 'dragover'].forEach(function (t) {
    els.drop.addEventListener(t, function (e) { e.preventDefault(); els.drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    els.drop.addEventListener(t, function (e) { e.preventDefault(); els.drop.classList.remove('over'); });
  });
  els.drop.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) takeFile(f);
  });
  els.replace.addEventListener('click', function () { els.file.value = ''; els.file.click(); });

  function takeFile(f) {
    say(els.uploadErr, '');
    if (TYPES.indexOf(f.type) < 0) {
      say(els.uploadErr, 'Unsupported file type. Please choose a JPG, PNG or WebP photograph.', true); return;
    }
    if (f.size > MAX_BYTES) {
      say(els.uploadErr, 'This file is ' + (f.size / 1048576).toFixed(1) + ' MB. Please choose an image under 10 MB.', true); return;
    }
    var url = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      var w = im.naturalWidth, h = im.naturalHeight;
      if (!w || !h) { say(els.uploadErr, 'This image could not be read. Please try another file.', true); return; }
      if (w * h > MAX_PIXELS) { say(els.uploadErr, 'This image is too large (' + Math.round(w * h / 1e6) + ' megapixels). Please choose one under 50 megapixels.', true); return; }
      var k = Math.min(1, MAX_SIDE / Math.max(w, h)), cw = Math.round(w * k), ch = Math.round(h * k);
      var c = document.createElement('canvas'); c.width = cw; c.height = ch;
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(im, 0, 0, cw, ch);
      newImage(c);
    };
    im.onerror = function () { URL.revokeObjectURL(url); say(els.uploadErr, 'This image could not be read. Please try another JPG, PNG or WebP file.', true); };
    im.src = url;
  }

  function newImage(c) {
    state.token++; state.canvas = c; state.scene = null;
    els.img.src = c.toDataURL('image/jpeg', 0.9);
    els.ov.width = c.width; els.ov.height = c.height;
    els.ov.getContext('2d').clearRect(0, 0, c.width, c.height);
    els.view.hidden = false; els.drop.hidden = true;
    els.results.hidden = true; els.manual.hidden = true; els.opacityWrap.hidden = true;
    els.mode.textContent = '';
    clearOutput(); say(els.analyzeStatus, '');
    els.analyze.disabled = false; els.manualBtn.disabled = false;
    setStep(2);
    els.analyze.focus();
  }

  /* ---------- 02 analyze ---------- */
  function loadModel() {
    if (seg) return Promise.resolve(seg);
    if (segLoading) return segLoading;
    segLoading = withTimeout(import(TRANSFORMERS_URL).then(function (T) {
      T.env.allowLocalModels = false;
      return T.pipeline('image-segmentation', MAP.model.id, { dtype: 'q8', device: 'wasm' });
    }), MODEL_TIMEOUT_MS, 'model').then(function (p) { seg = p; return p; })
      .catch(function (e) { segLoading = null; throw e; });
    return segLoading;
  }

  els.analyze.addEventListener('click', function () {
    if (state.busy || !state.canvas) return;
    var my = state.token; busy(true);
    say(els.analyzeStatus, seg ? 'Analyzing image…' : 'Loading the analysis model (first use only)…');
    loadModel().then(function (p) {
      if (my !== state.token) throw new Error('stale');
      say(els.analyzeStatus, 'Analyzing image…');
      return withTimeout(p(state.canvas.toDataURL('image/jpeg', 0.92)), INFER_TIMEOUT_MS, 'inference');
    }).then(function (out) {
      if (my !== state.token) return;
      showModelResult(out); say(els.analyzeStatus, 'Analysis complete.');
      setStep(3);
    }).catch(function (e) {
      if (e && e.message === 'stale') return;
      var t = String(e && e.message || '').indexOf('timeout') === 0;
      say(els.analyzeStatus, (t ? 'The analysis took too long and was stopped.' :
        'Image analysis is unavailable right now (the model could not be loaded or run on this device or connection).') +
        ' You can describe the scene yourself instead.', true);
    }).then(function () { busy(false); });
  });

  els.manualBtn.addEventListener('click', function () {
    if (state.busy || !state.canvas) return;
    state.scene = { mode: 'manual', levels: readManual() };
    els.results.hidden = true; els.opacityWrap.hidden = true; els.manual.hidden = false;
    els.ov.getContext('2d').clearRect(0, 0, els.ov.width, els.ov.height);
    els.mode.textContent = 'Scene described by you — no image analysis was performed.';
    say(els.analyzeStatus, ''); setStep(3);
    var first = els.manual.querySelector('select'); if (first) first.focus();
  });

  function buildManual() {
    var rows = [['vegetation', 'Vegetation (trees, shrubs, grass)', true], ['road', 'Road or footpath', true],
      ['vehicles', 'Vehicles', true], ['heavy_vehicles', 'Buses or trucks', false], ['two_wheelers', 'Motorcycles or bicycles', false],
      ['people', 'People', true], ['built', 'Buildings or walls', true], ['open_sky', 'Open sky', false],
      ['rail_vehicle', 'Rail structure or train (cue only)', false]];
    var html = '';
    rows.forEach(function (r) {
      html += '<label class="g-sel"><span>' + r[1] + '</span><select data-cue="' + r[0] + '">' +
        '<option value="none">Not visible</option><option value="visible">Visible</option>' +
        (r[2] ? '<option value="dominant">Dominant</option>' : '') + '</select></label>';
    });
    els.manual.querySelector('.g-manual-grid').innerHTML = html;
    els.manual.addEventListener('change', function () {
      if (state.scene && state.scene.mode === 'manual') { state.scene.levels = readManual(); clearOutput(); }
    });
  }
  function readManual() {
    var lv = {};
    els.manual.querySelectorAll('select').forEach(function (s) { lv[s.getAttribute('data-cue')] = s.value; });
    return lv;
  }

  function showModelResult(out) {
    var c = state.canvas, w = c.width, h = c.height, N = w * h;
    var labelCount = {}, catOf = {}, cats = MAP.categories, keys = Object.keys(cats);
    keys.forEach(function (k) { cats[k].labels.forEach(function (l) { catOf[l] = k; }); });
    var idx = new Uint8Array(N).fill(255), catKeys = keys;
    out.forEach(function (o) {
      var m = o.mask, ci = catKeys.indexOf(catOf[o.label]), d = m.data, ch = m.channels || 1, n = 0;
      if (m.width !== w || m.height !== h) {  // safety: nearest-neighbour map if sizes differ
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          var sx = Math.min(m.width - 1, (x * m.width / w) | 0), sy = Math.min(m.height - 1, (y * m.height / h) | 0);
          if (d[(sy * m.width + sx) * ch] > 127) { idx[y * w + x] = ci; n++; }
        }
      } else {
        for (var i = 0; i < N; i++) if (d[i * ch] > 127) { idx[i] = ci; n++; }
      }
      labelCount[o.label] = (labelCount[o.label] || 0) + n;
    });
    var catShare = {}, labelShare = {};
    keys.forEach(function (k) { catShare[k] = 0; });
    Object.keys(labelCount).forEach(function (l) {
      labelShare[l] = labelCount[l] / N; if (catOf[l]) catShare[catOf[l]] += labelShare[l];
    });
    var unassigned = 0; for (var j = 0; j < N; j++) if (idx[j] === 255) unassigned++;

    // overlay
    var g = els.ov.getContext('2d'), id = g.createImageData(w, h), px = id.data;
    var rgb = catKeys.map(function (k) { var x = parseInt(cats[k].colour.slice(1), 16); return [x >> 16, (x >> 8) & 255, x & 255]; });
    for (var p = 0; p < N; p++) {
      var q = idx[p]; if (q === 255) continue;
      px[p * 4] = rgb[q][0]; px[p * 4 + 1] = rgb[q][1]; px[p * 4 + 2] = rgb[q][2]; px[p * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    els.opacityWrap.hidden = false; els.ov.style.opacity = els.opacity.value / 100;

    // levels from cue thresholds
    var levels = {};
    Object.keys(MAP.cues).forEach(function (k) {
      var cu = MAP.cues[k], s = 0;
      cu.labels.forEach(function (l) { s += labelShare[l] || 0; });
      levels[k] = cu.dominant && s >= cu.dominant ? 'dominant' : (s >= cu.visible ? 'visible' : 'none');
    });
    state.scene = { mode: 'model', levels: levels, catShare: catShare, labelShare: labelShare, w: w, h: h };

    // bar + legend
    var bar = '', leg = '';
    keys.forEach(function (k) {
      var s = catShare[k], pct = s * 100;
      if (s > 0) bar += '<span style="width:' + pct.toFixed(2) + '%;background:' + cats[k].colour + '"></span>';
      leg += '<li><i style="background:' + cats[k].colour + '"></i><span class="n">' + cats[k].name +
        '</span><span class="v">' + fmtPct(s) + '</span></li>';
    });
    els.bar.innerHTML = bar; els.legend.innerHTML = leg;
    els.denom.textContent = 'Share of all ' + (N).toLocaleString('en') + ' pixels in the analysed image (' + w + ' × ' + h +
      ' px), from the SegFormer-B0 Cityscapes model running on this device.' + (unassigned ? ' ' + fmtPct(unassigned / N) + ' unlabelled.' : '') +
      ' Categories group the model’s 19 classes as listed below.';
    var cl = Object.keys(labelShare).sort(function (a, b) { return labelShare[b] - labelShare[a]; })
      .map(function (l) { return '<li>' + l + ' <span>' + fmtPct(labelShare[l]) + ' → ' + (cats[catOf[l]] ? cats[catOf[l]].name : 'unmapped') + '</span></li>'; });
    els.classes.innerHTML = cl.join('');
    els.cues.innerHTML = cueTags(levels);
    els.mode.textContent = 'Visual cues detected by the model on this device.';
    els.manual.hidden = true; els.results.hidden = false;
  }
  function fmtPct(s) { var p = s * 100; return p === 0 ? '0%' : (p < 1 ? '<1%' : Math.round(p) + '%'); }
  function cueTags(lv) {
    var t = [];
    Object.keys(MAP.cues).forEach(function (k) {
      if (lv[k] && lv[k] !== 'none') t.push('<li>' + MAP.cues[k].text + (lv[k] === 'dominant' ? ' (dominant)' : '') + '</li>');
    });
    return t.length ? t.join('') : '<li class="none">No strong cues found</li>';
  }

  els.opacity.addEventListener('input', function () { els.ov.style.opacity = els.opacity.value / 100; });
  [els.rail, els.traffic, els.peds].forEach(function (s) { s.addEventListener('change', clearOutput); });

  /* ---------- 03 listen ---------- */
  els.gen.addEventListener('click', function () {
    if (state.busy || !state.scene) return;
    if (state.scene.mode === 'manual') state.scene.levels = readManual();
    var my = state.token, plan = makePlan(state.scene, {
      rail: els.rail.value, traffic: els.traffic.value, peds: els.peds.value
    });
    busy(true); clearOutput(); say(els.status, 'Mixing audio…');
    renderPlan(plan).then(function (wav) {
      if (my !== state.token) return;
      state.audioUrl = URL.createObjectURL(wav);
      els.audio.src = state.audioUrl; els.dl.href = state.audioUrl;
      els.summary.innerHTML = summaryHtml(plan); els.out.hidden = false; els.summary.hidden = false;
      say(els.status, 'Your 30-second synthetic soundscape is ready. Press play to listen.');
    }).catch(function () {
      if (my !== state.token) return;
      say(els.status, 'The audio could not be generated in this browser. Please try again, or try another browser.', true);
    }).then(function () { busy(false); });
  });

  els.reset.addEventListener('click', resetAll);
  function resetAll() {
    state.token++; state.canvas = null; state.scene = null; busy(false);
    clearOutput(); els.img.removeAttribute('src');
    els.view.hidden = true; els.drop.hidden = false; els.file.value = '';
    els.results.hidden = true; els.manual.hidden = true; els.opacityWrap.hidden = true; els.mode.textContent = '';
    [els.rail, els.traffic, els.peds].forEach(function (s) { s.value = 'unknown'; });
    els.manual.querySelectorAll('select').forEach(function (s) { s.value = 'none'; });
    say(els.analyzeStatus, ''); say(els.uploadErr, ''); say(els.status, '');
    setStep(1); els.file.focus();
  }
  function clearOutput() {
    if (state.audioUrl) { els.audio.pause(); els.audio.removeAttribute('src'); els.audio.load(); URL.revokeObjectURL(state.audioUrl); state.audioUrl = null; }
    els.out.hidden = true; els.summary.hidden = true; els.summary.innerHTML = '';
    if (els.status.textContent && !state.busy) say(els.status, '');
  }
  function busy(b) {
    state.busy = b;
    els.analyze.disabled = b || !state.canvas; els.manualBtn.disabled = b || !state.canvas;
    els.gen.disabled = b || !state.scene; els.replace.disabled = b;
    root.setAttribute('aria-busy', b ? 'true' : 'false');
  }

  /* ---------- rules → plan ---------- */
  function makePlan(scene, as) {
    var L = scene.levels, R = RULES.stems, P = [], img = scene.mode === 'model' ? 'Image cue' : 'Described by you';
    function on(k) { return L[k] && L[k] !== 'none'; }
    P.push({ k: 'city_hum', src: 'Default', why: 'baseline for any urban photograph', gain: R.city_hum.gain });

    var trafficCue = on('road') || on('vehicles'), tA = as.traffic;
    if (trafficCue || tA !== 'unknown') {
      var why = tA !== 'unknown' ? 'traffic activity: ' + tA : 'road/vehicles visible; activity unknown, so a moderate default';
      var src = tA !== 'unknown' ? 'Your assumption' : img;
      P.push({ k: 'traffic_bed', src: src, why: why, gain: R.traffic_bed.gain[tA] });
      var n = R.vehicle_passby.count[tA], kinds = [];
      for (var i = 0; i < n; i++) kinds.push('car');
      if (on('heavy_vehicles') && n > 0) kinds[0] = 'heavy';
      if (on('two_wheelers') && n > 1) kinds[1] = 'moto';
      if (on('two_wheelers') && n === 1 && !on('heavy_vehicles')) kinds[0] = 'moto';
      P.push({ k: 'vehicle_passby', src: src, why: n + ' pass-by' + (n === 1 ? '' : 's') +
        (kinds.indexOf('heavy') >= 0 ? ', one bus/truck (bus or truck visible)' : '') +
        (kinds.indexOf('moto') >= 0 ? ', one motorcycle (two-wheeler visible)' : ''), kinds: kinds });
    }
    if (on('vegetation')) {
      P.push({ k: 'leaves_wind', src: img, why: 'vegetation ' + L.vegetation, gain: R.leaves_wind.gain[L.vegetation] });
      P.push({ k: 'birds', src: img, why: 'potential source linked to vegetation; birds are not detected', calls: R.birds.calls[L.vegetation] });
    }
    var pA = as.peds, walkers = 0, psrc = 'Your assumption', pwhy = 'pedestrian activity: ' + pA;
    if (pA !== 'unknown') walkers = R.footsteps.walkers[pA];
    else { walkers = R.footsteps.walkers['unknown_' + (L.people || 'none')]; psrc = img; pwhy = 'people ' + (L.people || 'none') + '; activity unknown'; }
    if (walkers > 0) P.push({ k: 'footsteps', src: psrc, why: pwhy + ' → ' + walkers + ' walker' + (walkers === 1 ? '' : 's'), walkers: walkers });
    if (as.rail === 'yes') P.push({ k: 'rail_passby', src: 'Your assumption', why: 'rail nearby: yes → one pass-by at ' + R.rail_passby.start_s + ' s' });
    var wet = R.reflections.wet[L.built || 'none'], openF = on('open_sky') ? R.reflections.open_sky_factor : 1;
    P.push({ k: 'reflections', src: scene.mode === 'model' ? 'Image cue' : 'Described by you', why: 'built ' + (L.built || 'none') + (openF < 1 ? ', open sky reduces it' : ''), wet: wet * openF });

    var notes = [];
    if (on('rail_vehicle') && as.rail !== 'yes') notes.push('A possible rail cue was found, but no train was added. Set “Rail nearby?” to Yes to include one.');
    if (as.rail === 'no') notes.push('Rail set to No: no train sounds.');
    var seedStr = JSON.stringify([L, as, scene.catShare ? Object.keys(scene.catShare).map(function (k) { return Math.round(scene.catShare[k] * 1000); }) : 0]);
    return { stems: P, notes: notes, seed: hash(seedStr), as: as, mode: scene.mode };
  }

  function summaryHtml(plan) {
    var names = { city_hum: 'Distant urban hum', traffic_bed: 'Traffic bed', vehicle_passby: 'Vehicle pass-bys', leaves_wind: 'Leaves and wind',
      birds: 'Occasional birds', footsteps: 'Footsteps', rail_passby: 'Overhead train pass-by', reflections: 'Hard-surface reflections' };
    var audible = plan.stems.filter(function (s) { return s.k !== 'reflections'; }).map(function (s) { return names[s.k]; });
    var h = '<p class="g-sum-line">' + audible.join(' + ') + '</p><ul class="g-sum">';
    plan.stems.forEach(function (s) {
      var cls = s.src === 'Your assumption' ? 'as' : (s.src === 'Default' ? 'df' : 'im');
      h += '<li><span class="src ' + cls + '">' + s.src + '</span> <b>' + names[s.k] + '</b> — ' + s.why + '</li>';
    });
    h += '</ul>';
    var a = plan.as;
    h += '<p class="g-sum-as">Your assumptions: rail nearby <b>' + a.rail + '</b>, traffic <b>' + a.traffic + '</b>, pedestrians <b>' + a.peds + '</b>.</p>';
    plan.notes.forEach(function (n) { h += '<p class="g-sum-note">' + n + '</p>'; });
    return h;
  }

  /* ---------- audio engine ---------- */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function renderPlan(plan) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error('no offline audio'));
    var SR = RULES.sample_rate, D = RULES.duration_s, ctx = new OAC(2, SR * D, SR), R = rng(plan.seed);

    // seeded noise buffers
    function noise(kind, secs) {
      var len = Math.round(SR * secs), b = ctx.createBuffer(2, len, SR);
      for (var c = 0; c < 2; c++) {
        var d = b.getChannelData(c), last = 0, b0 = 0, b1 = 0, b2 = 0;
        for (var i = 0; i < len; i++) {
          var w = R() * 2 - 1;
          if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
          else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
          else d[i] = w * 0.5;
        }
      }
      return b;
    }
    var WHITE = noise('white', D), PINK = noise('pink', D), BROWN = noise('brown', D);
    function src(buf, t0, offset, dur) { var s = ctx.createBufferSource(); s.buffer = buf; offset = offset || 0; t0 = t0 || 0;
      dur = Math.min(dur || D, buf.duration - offset, D - t0); s.start(t0, offset, Math.max(0.01, dur)); return s; }
    function filt(type, f, q) { var x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q) x.Q.value = q; return x; }
    function gainN(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
    function chain() { for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }
    // random-walk gain automation
    function walk(param, base, depth, step) {
      param.setValueAtTime(base, 0);
      for (var t = step; t <= D; t += step) param.linearRampToValueAtTime(Math.max(0, base * (1 + depth * (R() * 2 - 1))), t);
    }
    function bell(param, t0, dur, peak, sharp) {
      var n = 24; param.setValueAtTime(0, 0);
      for (var i = 0; i <= n; i++) { var u = i / n, x = (u - 0.5) * 2, v = peak * Math.exp(-(sharp || 3) * x * x); param.linearRampToValueAtTime(v * (i === 0 || i === n ? 0 : 1), t0 + u * dur); }
    }
    function panSweep(p, t0, dur, a, b) { if (!p.pan) return; p.pan.setValueAtTime(a, t0); p.pan.linearRampToValueAtTime(b, t0 + dur); }
    function panner(v) { var p = ctx.createStereoPanner ? ctx.createStereoPanner() : gainN(1); if (p.pan) p.pan.value = v || 0; return p; }

    var master = gainN(1), comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);
    var dry = gainN(1); dry.connect(master);
    var refl = plan.stems.filter(function (s) { return s.k === 'reflections'; })[0], wet = refl ? refl.wet : 0.05;
    var conv = ctx.createConvolver(), ir = ctx.createBuffer(2, SR * 1.6, SR);
    for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < d.length; i++) { var t = i / SR; d[i] = (R() * 2 - 1) * Math.exp(-t * 4.2) * (t < 0.004 ? t / 0.004 : 1); } }
    conv.buffer = ir; var wetG = gainN(wet); chain(conv, wetG, master);
    function out(node) { node.connect(dry); node.connect(conv); }

    plan.stems.forEach(function (s) {
      if (s.k === 'city_hum') { var g = gainN(s.gain); chain(src(BROWN), filt('lowpass', 180), g); out(g); }
      if (s.k === 'traffic_bed') {
        var g2 = gainN(s.gain); chain(src(PINK), filt('lowpass', 850), filt('highpass', 45), g2); walk(g2.gain, s.gain, 0.35, 1.5); out(g2);
      }
      if (s.k === 'vehicle_passby') {
        var n = s.kinds.length, slot = (D - 6) / Math.max(1, n);
        s.kinds.forEach(function (kind, i) {
          var dur = kind === 'heavy' ? 9 : (kind === 'moto' ? 5 : 6.5), t0 = 1 + i * slot + R() * Math.max(0, slot - dur * 0.6);
          if (t0 + dur > D - 0.5) t0 = Math.max(0.5, D - 0.5 - dur);
          var dir = R() < 0.5 ? -1 : 1, p = panner(); panSweep(p, t0, dur, -0.85 * dir, 0.85 * dir);
          var env = gainN(0), peak = kind === 'heavy' ? 0.95 : (kind === 'moto' ? 0.7 : 1.1);
          var bp = filt('bandpass', 700, 0.6); bp.frequency.setValueAtTime(900, t0); bp.frequency.linearRampToValueAtTime(480, t0 + dur);
          chain(src(WHITE, t0, R() * 10, dur), bp, env);
          var tyre = gainN(0.25); chain(src(WHITE, t0, R() * 10, dur), filt('highpass', 1800), filt('lowpass', 5000), tyre, env);
          if (kind === 'heavy') { var hv = gainN(1.4); chain(src(BROWN, t0, R() * 10, dur), filt('lowpass', 140), hv, env); }
          if (kind === 'moto') {
            var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(108, t0); o.frequency.linearRampToValueAtTime(112, t0 + dur * 0.45);
            o.frequency.linearRampToValueAtTime(86, t0 + dur * 0.55); o.frequency.linearRampToValueAtTime(82, t0 + dur);
            var og = gainN(0.18); chain(o, filt('lowpass', 1400), og, env); o.start(t0); o.stop(t0 + dur + 0.1);
          }
          bell(env.gain, t0, dur, peak, 3.2); chain(env, p); out(p);
        });
      }
      if (s.k === 'leaves_wind') {
        var lg = gainN(s.gain), hp = filt('highpass', 1900), lp = filt('lowpass', 7000);
        chain(src(WHITE), hp, lp, lg); walk(lg.gain, s.gain, 0.6, 2.4); out(lg);
      }
      if (s.k === 'birds') {
        for (var b = 0; b < s.calls; b++) {
          var ct = 2 + R() * (D - 6), bp2 = panner(R() * 1.4 - 0.7), chirps = 3 + Math.floor(R() * 4), f0 = 2600 + R() * 2400;
          for (var k = 0; k < chirps; k++) {
            var st = ct + k * (0.11 + R() * 0.09), o2 = ctx.createOscillator(), e2 = gainN(0), len = 0.06 + R() * 0.06;
            o2.type = 'sine'; o2.frequency.setValueAtTime(f0 * (1 + R() * 0.15), st); o2.frequency.exponentialRampToValueAtTime(f0 * (1.25 + R() * 0.3), st + len);
            e2.gain.setValueAtTime(0, st); e2.gain.linearRampToValueAtTime(0.19, st + 0.01); e2.gain.exponentialRampToValueAtTime(0.0005, st + len);
            chain(o2, e2, bp2); o2.start(st); o2.stop(st + len + 0.02);
          }
          out(bp2);
        }
      }
      if (s.k === 'footsteps') {
        var wslot = (D - 4) / s.walkers;
        for (var w = 0; w < s.walkers; w++) {
          var wt = 1 + w * wslot + R() * Math.max(0, wslot - 6), steps = 9 + Math.floor(R() * 6), iv = 0.5 + R() * 0.12;
          var fp = panner(), dirw = R() < 0.5 ? -1 : 1, wdur = steps * iv; panSweep(fp, wt, wdur, -0.7 * dirw, 0.7 * dirw);
          var we = gainN(0); bell(we.gain, wt, wdur, 1.6, 2.2); chain(we, fp); out(fp);
          for (var z = 0; z < steps; z++) {
            var tt = wt + z * iv + (R() - 0.5) * 0.03, sg = gainN(0), sb = filt('bandpass', 1400 + R() * 900, 1.1);
            chain(src(WHITE, tt, R() * 20, 0.1), sb, sg, we);
            sg.gain.setValueAtTime(0, tt); sg.gain.linearRampToValueAtTime(0.5, tt + 0.004); sg.gain.exponentialRampToValueAtTime(0.001, tt + 0.07);
            var th = ctx.createOscillator(), tg = gainN(0); th.frequency.value = 85 + R() * 20;
            tg.gain.setValueAtTime(0, tt); tg.gain.linearRampToValueAtTime(0.35, tt + 0.005); tg.gain.exponentialRampToValueAtTime(0.001, tt + 0.06);
            chain(th, tg, we); th.start(tt); th.stop(tt + 0.08);
          }
        }
      }
      if (s.k === 'rail_passby') {
        var r0 = RULES.stems.rail_passby.start_s, rl = RULES.stems.rail_passby.length_s, rp = panner(); panSweep(rp, r0, rl, -0.6, 0.6);
        var re = gainN(0); re.gain.setValueAtTime(0, r0); re.gain.linearRampToValueAtTime(1, r0 + rl * 0.38);
        re.gain.setValueAtTime(1, r0 + rl * 0.6); re.gain.linearRampToValueAtTime(0, r0 + rl); chain(re, rp); out(rp);
        var rum = gainN(1.6); chain(src(BROWN, r0, 3, rl), filt('lowpass', 260), rum, re);
        var hiss = gainN(0.12); chain(src(WHITE, r0, 7, rl), filt('bandpass', 2500, 0.8), hiss, re);
        for (var q = r0 + 1; q < r0 + rl - 0.5; q += 0.92) {
          [0, 0.16].forEach(function (off) {
            var ck = q + off, cg = gainN(0); chain(src(WHITE, ck, R() * 20, 0.12), filt('lowpass', 1800), cg, re);
            cg.gain.setValueAtTime(0, ck); cg.gain.linearRampToValueAtTime(0.55, ck + 0.003); cg.gain.exponentialRampToValueAtTime(0.001, ck + 0.09);
          });
        }
        var sq = ctx.createOscillator(), sqg = gainN(0); sq.frequency.value = 3150; sq.start(r0); sq.stop(r0 + rl);
        sqg.gain.setValueAtTime(0, r0 + rl * 0.35); sqg.gain.linearRampToValueAtTime(0.018, r0 + rl * 0.5); sqg.gain.linearRampToValueAtTime(0, r0 + rl * 0.7);
        chain(sq, sqg, re);
      }
    });

    return ctx.startRendering().then(function (buf) {
      var chs = [buf.getChannelData(0), buf.getChannelData(1)], len = buf.length, peak = 0, ss = 0;
      var fi = RULES.fade_in_s * SR, fo = RULES.fade_out_s * SR;
      for (var c2 = 0; c2 < 2; c2++) for (var i2 = 0; i2 < len; i2++) {
        var f = Math.min(1, i2 / fi, (len - 1 - i2) / fo); chs[c2][i2] *= f; var a = Math.abs(chs[c2][i2]); if (a > peak) peak = a; ss += a * a;
      }
      var rms = Math.sqrt(ss / (2 * len)), kp = peak > 0 ? Math.pow(10, RULES.peak_target_dbfs / 20) / peak : 1,
        kr = rms > 0 ? Math.pow(10, RULES.rms_target_dbfs / 20) / rms : 1, k2 = plan.raw ? 1 : Math.min(kp, kr);
      return wavBlob(chs, SR, k2);
    });
  }

  function wavBlob(chs, sr, k) {
    var len = chs[0].length, ab = new ArrayBuffer(44 + len * 4), v = new DataView(ab), o = 0;
    function s(str) { for (var i = 0; i < str.length; i++) v.setUint8(o++, str.charCodeAt(i)); }
    s('RIFF'); v.setUint32(o, 36 + len * 4, true); o += 4; s('WAVE'); s('fmt ');
    v.setUint32(o, 16, true); o += 4; v.setUint16(o, 1, true); o += 2; v.setUint16(o, 2, true); o += 2;
    v.setUint32(o, sr, true); o += 4; v.setUint32(o, sr * 4, true); o += 4; v.setUint16(o, 4, true); o += 2; v.setUint16(o, 16, true); o += 2;
    s('data'); v.setUint32(o, len * 4, true); o += 4;
    for (var i = 0; i < len; i++) for (var c = 0; c < 2; c++) {
      var x = Math.max(-1, Math.min(1, chs[c][i] * k)); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7FFF, true); o += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  // test hook (no effect on visitors)
  window.__underGen = { makePlan: makePlan, renderPlan: renderPlan, ready: cfgReady, rules: function () { return RULES; } };
  setStep(1);
})();
