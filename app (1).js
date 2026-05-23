/**
 * Guardian AI — app.js
 * Handles: Camera, Face Expression, Audio Analysis,
 *          Gesture Detection, Motion/Shake, GPS, Safety Score, SOS
 */

// ─── STATE ───────────────────────────────────────────────
const state = {
  cameraOn:    false,
  micOn:       false,
  sosActive:   false,
  stealthOn:   false,
  shakeCount:  0,
  lastShake:   0,
  gpsCoords:   null,
  safetyScore: 78,
  checkInTimer: null,
  stream:      null,
  audioCtx:    null,
  analyser:    null,
  animFrame:   null,
  faceInterval:null,
  stealthTaps: 0,
};

const KEYWORDS = ['help','assist','emergency','danger','save me','bachao','police'];
const DISTRESS_SOUNDS = ['scream','shatter','glass','fight','cry'];

// ─── FEED ────────────────────────────────────────────────
function addFeed(msg, sub='', color='var(--safe)') {
  const list = document.getElementById('feedList');
  const now  = new Date().toLocaleTimeString();
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <div class="feed-dot" style="background:${color}"></div>
    <div class="feed-content">
      <div class="feed-msg">${msg}</div>
      ${sub ? `<div class="feed-sub">${sub}</div>` : ''}
    </div>
    <div class="feed-time">${now}</div>`;
  list.insertBefore(item, list.firstChild);
  if (list.children.length > 50) list.removeChild(list.lastChild);
}

function clearFeed() {
  document.getElementById('feedList').innerHTML = '';
  addFeed('Feed cleared','','var(--muted)');
}

// ─── CAMERA ──────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
    state.stream = stream;
    state.cameraOn = true;
    const vid = document.getElementById('videoFeed');
    vid.srcObject = stream;
    vid.style.display = 'block';
    document.getElementById('camOffline').style.display = 'none';
    document.getElementById('camStatusBadge').textContent = 'LIVE';
    document.getElementById('camStatusBadge').className   = 'cam-badge safe';
    document.getElementById('btnStartCam').classList.add('active');
    addFeed('📷 Camera started', 'Face & gesture detection active');
    startFaceDetection();
    startGestureSimulation();
  } catch(e) {
    addFeed('⚠ Camera access denied', e.message, 'var(--warn)');
    simulateFaceDetection();
  }
}

function stopCamera() {
  if (state.stream) { state.stream.getTracks().forEach(t=>t.stop()); state.stream=null; }
  state.cameraOn = false;
  document.getElementById('videoFeed').style.display = 'none';
  document.getElementById('camOffline').style.display = 'flex';
  document.getElementById('camStatusBadge').textContent = 'STANDBY';
  document.getElementById('camStatusBadge').className   = 'cam-badge';
  document.getElementById('btnStartCam').classList.remove('active');
  clearInterval(state.faceInterval);
  addFeed('Camera stopped','','var(--muted)');
}

function captureSnapshot() {
  const vid    = document.getElementById('videoFeed');
  const canvas = document.getElementById('camCanvas');
  if (!state.cameraOn) { addFeed('⚠ Camera not active','','var(--warn)'); return; }
  canvas.width  = vid.videoWidth  || 640;
  canvas.height = vid.videoHeight || 480;
  canvas.getContext('2d').drawImage(vid, 0, 0);
  addFeed('📸 Snapshot captured', 'Saved for evidence');
}

// ─── FACE DETECTION (simulated with canvas overlay) ──────
const EXPRESSIONS = [
  { emoji:'😐', label:'Neutral',   risk:0,  badge:'Calm',    color:'var(--safe)' },
  { emoji:'😨', label:'Fearful',   risk:80, badge:'ALERT',   color:'var(--danger)' },
  { emoji:'😡', label:'Angry',     risk:50, badge:'Warning', color:'var(--warn)' },
  { emoji:'😊', label:'Happy',     risk:0,  badge:'Safe',    color:'var(--safe)' },
  { emoji:'😢', label:'Distressed',risk:70, badge:'ALERT',   color:'var(--danger)' },
  { emoji:'😰', label:'Anxious',   risk:60, badge:'Watch',   color:'var(--warn)' },
];

function startFaceDetection() {
  clearInterval(state.faceInterval);
  state.faceInterval = setInterval(() => {
    // Weighted random — mostly calm
    const weights = [50, 5, 8, 25, 4, 8];
    const total   = weights.reduce((a,b)=>a+b,0);
    let r = Math.random() * total, idx = 0;
    for (let i=0; i<weights.length; i++) { r -= weights[i]; if(r<=0){idx=i;break;} }
    applyFaceResult(EXPRESSIONS[idx]);
  }, 3000);
}

function simulateFaceDetection() {
  startFaceDetection(); // same simulation, runs without camera
}

function applyFaceResult(expr) {
  document.getElementById('faceStatus').textContent = `${expr.emoji} ${expr.label}`;
  const badge = document.getElementById('faceBadge');
  badge.textContent = expr.badge;
  badge.className   = expr.risk > 50 ? 'stat-badge badge-down' : 'stat-badge badge-up';
  if (expr.risk > 60) {
    addFeed(`😨 Face: ${expr.label} detected`, 'Elevated emotion risk', expr.color);
    updateAlertStatus('ALERT', expr.color);
    if (expr.risk > 75) triggerCheckIn('Distress expression detected');
  }
}

// ─── AUDIO ───────────────────────────────────────────────
async function toggleMic() {
  if (state.micOn) {
    stopMic(); return;
  }
  try {
    const stream  = await navigator.mediaDevices.getUserMedia({ audio:true });
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 256;
    const source  = state.audioCtx.createMediaStreamSource(stream);
    source.connect(state.analyser);
    state.micOn   = true;
    document.getElementById('btnMic').textContent = '🔴 Stop Mic';
    document.getElementById('btnMic').classList.add('active');
    addFeed('🎙 Microphone started', 'Listening for distress audio');
    drawWaveform();
    startAudioAnalysis();
    startVoiceKeywordDetection();
  } catch(e) {
    addFeed('⚠ Mic access denied', e.message, 'var(--warn)');
    simulateAudio();
  }
}

function stopMic() {
  state.micOn = false;
  cancelAnimationFrame(state.animFrame);
  if (state.audioCtx) { state.audioCtx.close(); state.audioCtx = null; }
  document.getElementById('btnMic').textContent = '🎙 Start Mic';
  document.getElementById('btnMic').classList.remove('active');
  addFeed('Microphone stopped','','var(--muted)');
}

function drawWaveform() {
  if (!state.micOn) return;
  const canvas  = document.getElementById('waveCanvas');
  const ctx     = canvas.getContext('2d');
  const buf     = new Uint8Array(state.analyser.frequencyBinCount);
  state.analyser.getByteTimeDomainData(buf);

  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,60,110,0.8)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  const slice = canvas.width / buf.length;
  let x = 0;
  buf.forEach((v,i) => {
    const y = (v/128)*canvas.height/2;
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    x += slice;
  });
  ctx.stroke();
  state.animFrame = requestAnimationFrame(drawWaveform);
}

function startAudioAnalysis() {
  setInterval(() => {
    if (!state.analyser) return;
    const data = new Uint8Array(state.analyser.frequencyBinCount);
    state.analyser.getByteFrequencyData(data);
    const avg = data.reduce((a,b)=>a+b,0)/data.length;
    const db  = Math.round(avg - 128 + 50);

    document.getElementById('audioLevel').textContent = db;
    classifyAudio(db);
  }, 500);
}

function classifyAudio(db) {
  let cls='Quiet', risk='Low', riskColor='var(--safe)';
  if (db > 80) { cls='Scream/Loud'; risk='HIGH'; riskColor='var(--danger)'; triggerCheckIn('Loud sound detected'); }
  else if (db > 60) { cls='Elevated';    risk='Med';  riskColor='var(--warn)'; }
  else if (db > 40) { cls='Conversation';risk='Low';  riskColor='var(--safe)'; }

  document.getElementById('audioClass').textContent   = cls;
  document.getElementById('audioRisk').textContent    = risk;
  document.getElementById('audioRisk').style.color    = riskColor;
  document.getElementById('audioThreat').textContent  = db>70?'ALERT':'CLEAR';
  document.getElementById('audioThreat').style.color  = db>70?'var(--danger)':'var(--safe)';
  if (db > 80) addFeed(`🔊 ${cls} detected`, `dB: ${db}`, 'var(--danger)');
}

function simulateAudio() {
  // Simulate waveform on canvas without real mic
  const canvas = document.getElementById('waveCanvas');
  const ctx    = canvas.getContext('2d');
  function draw() {
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='rgba(255,60,110,0.4)'; ctx.lineWidth=2; ctx.beginPath();
    for(let x=0;x<canvas.width;x++){
      const y = canvas.height/2 + Math.sin(Date.now()/200+x/20)*8;
      x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.stroke();
    requestAnimationFrame(draw);
  }
  draw();
}

function startVoiceKeywordDetection() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
  const SR   = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recog = new SR();
  recog.continuous     = true;
  recog.interimResults = true;
  recog.onresult = e => {
    const text = Array.from(e.results).map(r=>r[0].transcript).join(' ').toLowerCase();
    KEYWORDS.forEach(kw => {
      if (text.includes(kw)) {
        addFeed(`🗣 Keyword detected: "${kw}"`, 'Voice distress alert!', 'var(--danger)');
        triggerCheckIn(`Voice keyword: ${kw}`);
      }
    });
  };
  recog.start();
}

// ─── GESTURE SIMULATION ──────────────────────────────────
const GESTURES = ['help','wave','fist','ok'];
function startGestureSimulation() {
  setInterval(() => {
    // Reset all
    GESTURES.forEach(g => {
      document.getElementById(`gs-${g}`).textContent = 'Watching';
      document.getElementById(`gs-${g}`).className   = 'gesture-status g-inactive';
    });
    // Mostly thumbs up (safe)
    const weights = [2, 5, 2, 91];
    const total   = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*total, idx=3;
    for(let i=0;i<weights.length;i++){r-=weights[i];if(r<=0){idx=i;break;}}
    const g = GESTURES[idx];
    const el = document.getElementById(`gs-${g}`);
    el.textContent = 'Detected!';
    el.className   = 'gesture-status g-active';
    if (g === 'help') {
      addFeed('🤚 Help signal detected!', 'Universal distress gesture triggered SOS', 'var(--danger)');
      triggerSOS();
    } else if (g === 'fist') {
      addFeed('✊ Fist gesture detected', 'Possible distress signal', 'var(--warn)');
    }
  }, 5000);
}

// ─── MOTION & SHAKE ──────────────────────────────────────
function requestMotion() {
  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then(r => {
      if (r==='granted') listenMotion();
    });
  } else {
    listenMotion();
  }
}

function listenMotion() {
  let lastAcc = { x:0, y:0, z:0 };
  let steps   = 0, lastStep = 0;

  window.addEventListener('devicemotion', e => {
    const acc = e.acceleration || { x:0, y:0, z:0 };
    const dx  = Math.abs((acc.x||0) - lastAcc.x);
    const dy  = Math.abs((acc.y||0) - lastAcc.y);
    const dz  = Math.abs((acc.z||0) - lastAcc.z);
    const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);

    // SHAKE detection
    if (mag > 15) {
      const now = Date.now();
      if (now - state.lastShake > 500) {
        state.shakeCount++;
        state.lastShake = now;
        document.getElementById('shakeCount').textContent = state.shakeCount;
        addFeed(`📳 Shake ${state.shakeCount} detected`, mag>20?'Strong shake':'Mild shake',
                state.shakeCount>=3?'var(--danger)':'var(--warn)');
        if (state.shakeCount >= 3) {
          state.shakeCount = 0;
          document.getElementById('shakeCount').textContent = '0';
          addFeed('🆘 3-shake SOS triggered!','Emergency alert sent','var(--danger)');
          triggerSOS();
        }
      }
    }

    // Step estimation
    if (mag > 5) {
      const now = Date.now();
      if (now - lastStep > 300) { steps++; lastStep = now; }
    }

    // Motion state
    let motionState = 'Still';
    if (mag > 20) motionState = 'Running';
    else if (mag > 8) motionState = 'Walking';
    document.getElementById('motionState').textContent = motionState;
    document.getElementById('motionState').style.color =
      motionState==='Running' ? 'var(--warn)' :
      motionState==='Walking' ? 'var(--safe)' : 'var(--muted)';

    lastAcc = { x:acc.x||0, y:acc.y||0, z:acc.z||0 };
  });

  // Steps per minute counter
  setInterval(() => {
    document.getElementById('stepCount').textContent = steps;
    steps = 0;
  }, 60000);

  addFeed('📱 Motion sensor active', 'Shake detection enabled');

  // Simulate heart rate (real HR needs wearable)
  simulateHeartRate();
}

function simulateHeartRate() {
  setInterval(() => {
    // Normal 60-100 bpm, stress spikes it
    const base = 72, variance = 8;
    const hr   = base + Math.round((Math.random()-0.5)*variance*2);
    document.getElementById('heartRate').textContent = hr;
    document.getElementById('heartRate').style.color =
      hr > 100 ? 'var(--danger)' : hr > 90 ? 'var(--warn)' : 'var(--safe)';
    if (hr > 100) addFeed(`❤️ High heart rate: ${hr} bpm`,'Stress indicator','var(--warn)');
  }, 4000);
}

// ─── GPS ─────────────────────────────────────────────────
function getLocation() {
  if (!navigator.geolocation) { addFeed('⚠ GPS not supported','','var(--warn)'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    state.gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const coordStr  = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
    document.getElementById('routeCoords').textContent = coordStr;
    document.getElementById('routeTime').textContent   = new Date().toLocaleTimeString();
    document.getElementById('gpsStatus').textContent   = '🟢 Live';
    document.getElementById('sosCoords').textContent   = `📍 GPS: ${coordStr}`;
    addFeed('📍 GPS acquired', coordStr);
    drawRouteMap(pos.coords.latitude, pos.coords.longitude);
    calcRouteSafetyScore();
  }, err => {
    addFeed('⚠ GPS error', err.message, 'var(--warn)');
    document.getElementById('gpsStatus').textContent = '🔴 Error';
  }, { enableHighAccuracy:true });
}

// Live GPS tracking
navigator.geolocation && navigator.geolocation.watchPosition(pos => {
  state.gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  document.getElementById('routeCoords').textContent =
    `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
  document.getElementById('routeTime').textContent = new Date().toLocaleTimeString();
  document.getElementById('gpsStatus').textContent = '🟢 Live';
}, ()=>{}, { enableHighAccuracy:true, maximumAge:10000 });

// ─── ROUTE MAP (canvas) ───────────────────────────────────
function drawRouteMap(lat, lng) {
  const canvas = document.getElementById('mapCanvas');
  const el     = document.getElementById('routeMap');
  canvas.width  = el.offsetWidth;
  canvas.height = el.offsetHeight;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#08080e';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // Grid
  ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=1;
  for(let x=0;x<canvas.width;x+=40){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke(); }
  for(let y=0;y<canvas.height;y+=40){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke(); }

  // Zones
  const zones = [
    { x:50,  y:60,  r:80, color:'rgba(255,60,110,0.15)',  label:'Red Zone' },
    { x:250, y:120, r:70, color:'rgba(255,209,102,0.15)', label:'Yellow Zone' },
    { x:180, y:80,  r:60, color:'rgba(0,229,160,0.15)',   label:'Safe Zone' },
  ];
  zones.forEach(z => {
    ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,Math.PI*2);
    ctx.fillStyle=z.color; ctx.fill();
    ctx.strokeStyle=z.color.replace('0.15','0.5'); ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.font='10px DM Sans';
    ctx.fillText(z.label, z.x-20, z.y+z.r+14);
  });

  // Route path
  ctx.strokeStyle='rgba(0,229,160,0.6)'; ctx.lineWidth=3; ctx.setLineDash([6,3]);
  ctx.beginPath(); ctx.moveTo(30,canvas.height-30); ctx.bezierCurveTo(80,100,250,80,canvas.width-30,canvas.height/2);
  ctx.stroke(); ctx.setLineDash([]);

  // Current position
  const cx = canvas.width/2, cy = canvas.height/2;
  ctx.beginPath(); ctx.arc(cx,cy,10,0,Math.PI*2);
  ctx.fillStyle='rgba(255,60,110,0.3)'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2);
  ctx.fillStyle='#ff3c6e'; ctx.fill();

  // Pulse ring
  let r=10, alpha=0.8;
  const pulse = setInterval(()=>{
    ctx.clearRect(cx-40,cy-40,80,80);
    // redraw bg
    ctx.fillStyle='#08080e'; ctx.fillRect(cx-40,cy-40,80,80);
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.strokeStyle=`rgba(255,60,110,${alpha})`; ctx.lineWidth=2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2); ctx.fillStyle='#ff3c6e'; ctx.fill();
    r+=0.8; alpha-=0.04;
    if(r>30){ r=10; alpha=0.8; }
  },50);
  setTimeout(()=>clearInterval(pulse), 5000);
}

// ─── SAFETY SCORE (XGBoost-like simulation) ───────────────
function calcRouteSafetyScore() {
  const hour    = new Date().getHours();
  const timeScore   = hour>=8&&hour<=20 ? 85 : 40;
  const lightScore  = hour>=7&&hour<=19 ? 90 : 35;
  const crimeScore  = 50 + Math.round(Math.random()*30);
  const shopScore   = hour>=9&&hour<=21 ? 80 : 30;

  const overall = Math.round((timeScore+lightScore+crimeScore+shopScore)/4);
  state.safetyScore = overall;

  // Update UI
  document.getElementById('scoreNum').textContent       = overall;
  document.getElementById('safetyScoreHero').textContent = overall;
  const ring   = document.getElementById('scoreRing');
  const offset = 339 - (339 * overall / 100);
  ring.style.strokeDashoffset = offset;
  ring.style.stroke =
    overall>=70 ? 'var(--safe)' : overall>=40 ? 'var(--warn)' : 'var(--danger)';
  document.getElementById('scoreNum').style.color =
    overall>=70 ? 'var(--safe)' : overall>=40 ? 'var(--warn)' : 'var(--danger)';

  // Zone
  const zone   = overall>=70 ? '🟢 Safe' : overall>=40 ? '🟡 Caution' : '🔴 Danger';
  document.getElementById('routeZone').textContent  = zone;
  document.getElementById('routeScore').textContent = overall;

  // Factors
  const factors = [[timeScore,'f1','ff1'],[lightScore,'f2','ff2'],[crimeScore,'f3','ff3'],[shopScore,'f4','ff4']];
  factors.forEach(([val,fId,fFill])=>{
    document.getElementById(fId).textContent = val+'%';
    document.getElementById(fFill).style.width = val+'%';
    document.getElementById(fFill).style.background =
      val>=70?'var(--safe)':val>=40?'var(--warn)':'var(--danger)';
  });

  if (overall < 40) {
    addFeed('⚠ Danger zone detected!', `Safety score: ${overall}/100`, 'var(--danger)');
    triggerCheckIn('Low safety score zone');
  } else {
    addFeed(`📍 Route scored ${overall}/100`, zone);
  }
}

// ─── CHECK-IN SYSTEM ─────────────────────────────────────
function triggerCheckIn(reason) {
  if (state.sosActive) return;
  clearTimeout(state.checkInTimer);
  const banner = showBanner(`⚠ Are you okay? (${reason})`, 'Tap YES — 10s timer starts now', 'var(--warn)');
  state.checkInTimer = setTimeout(() => {
    if (!state.sosActive) {
      addFeed('🆘 No check-in response!', 'Auto-alerting contacts', 'var(--danger)');
      triggerSOS();
    }
  }, 10000);
}

function showBanner(title, sub, color) {
  const id  = 'checkBanner';
  let el    = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      padding:16px 28px;border-radius:14px;z-index:998;
      font-family:'Syne',sans-serif;text-align:center;
      box-shadow:0 8px 40px rgba(0,0,0,0.5);
      min-width:320px;cursor:pointer;transition:all 0.3s;
    `;
    el.onclick = () => {
      clearTimeout(state.checkInTimer);
      el.remove();
      addFeed('✅ Check-in confirmed', 'User confirmed safe');
    };
    document.body.appendChild(el);
  }
  el.style.background = color;
  el.style.color      = '#fff';
  el.innerHTML = `<div style="font-size:15px;font-weight:700">${title}</div>
                  <div style="font-size:12px;margin-top:4px;opacity:0.8">${sub} — tap to confirm ✓</div>`;
  return el;
}

// ─── SOS ─────────────────────────────────────────────────
function triggerSOS() {
  if (state.sosActive) return;
  state.sosActive = true;
  const overlay  = document.getElementById('sosOverlay');
  overlay.classList.add('show');

  addFeed('🆘 SOS TRIGGERED', 'Alerting family & police', 'var(--danger)');

  // Get GPS and "send"
  if (state.gpsCoords) {
    const c = state.gpsCoords;
    document.getElementById('sosCoords').textContent =
      `📍 ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} — Sending to contacts…`;
    simulateSendAlert(c);
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const c = { lat:pos.coords.latitude, lng:pos.coords.longitude };
      state.gpsCoords = c;
      document.getElementById('sosCoords').textContent =
        `📍 ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} — Sending…`;
      simulateSendAlert(c);
    }, ()=>{
      document.getElementById('sosCoords').textContent = '⚠ GPS unavailable — sending anyway';
    });
  }

  updateAlertStatus('SOS', 'var(--danger)');
  buzzDevice();
}

function simulateSendAlert(coords) {
  // In production: POST to backend /api/sos with Twilio + Firebase
  console.log('SOS payload:', { coords, time: new Date().toISOString(), type:'SOS' });
  setTimeout(()=>{
    const c = document.getElementById('sosCoords');
    c.textContent = `✅ Alert sent | GPS: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
    addFeed('📲 Alert sent to family','Via Twilio SMS','var(--safe)');
    addFeed('🚔 Nearest police notified','Location shared','var(--safe)');
  }, 2000);
}

function cancelSOS() {
  state.sosActive = false;
  document.getElementById('sosOverlay').classList.remove('show');
  updateAlertStatus('SAFE', 'var(--safe)');
  addFeed('✅ SOS cancelled', 'User confirmed safe');
}

function buzzDevice() {
  if (navigator.vibrate) navigator.vibrate([200,100,200,100,500]);
}

// ─── STEALTH MODE ────────────────────────────────────────
function toggleStealth() {
  state.stealthOn = !state.stealthOn;
  const overlay   = document.getElementById('stealthOverlay');
  overlay.classList.toggle('show', state.stealthOn);
  if (state.stealthOn) addFeed('🔒 Stealth mode ON', 'Screen hidden — recording continues');
}

function exitStealth() {
  state.stealthTaps++;
  if (state.stealthTaps >= 3) {
    state.stealthTaps = 0;
    state.stealthOn   = false;
    document.getElementById('stealthOverlay').classList.remove('show');
    addFeed('🔓 Stealth mode OFF', 'Screen restored');
  }
}

// ─── UI HELPERS ──────────────────────────────────────────
function updateAlertStatus(text, color) {
  document.getElementById('alertStatus').textContent = text;
  document.getElementById('alertStatus').style.color = color;
  document.getElementById('alertBadge').textContent  = text;
  document.getElementById('alertBadge').className    =
    text==='SAFE' ? 'stat-badge badge-up' : 'stat-badge badge-down';
}

// ─── AUTO-INIT ───────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  simulateFaceDetection();
  simulateAudio();
  calcRouteSafetyScore();
  addFeed('🛡 Guardian AI loaded', 'All modules initialised');
  drawRouteMap(0,0); // blank map

  // Simulate periodic safety score updates
  setInterval(calcRouteSafetyScore, 30000);

  // Simulate GPS movement
  setInterval(()=>{
    if (state.gpsCoords) {
      state.gpsCoords.lat += (Math.random()-0.5)*0.0001;
      state.gpsCoords.lng += (Math.random()-0.5)*0.0001;
      document.getElementById('routeCoords').textContent =
        `${state.gpsCoords.lat.toFixed(4)}, ${state.gpsCoords.lng.toFixed(4)}`;
    }
  }, 5000);
});
