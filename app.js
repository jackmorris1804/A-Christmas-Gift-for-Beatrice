/**
 * Christmas 2D canvas app
 * - Houses at memory stops
 * - Prompt when avatar is close to door
 * - Enter-house animation with door glow
 * - Reliable start button + audio unlock fallback
 */
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
let W = 0, H = 0;
function resize() {
  W = Math.floor(window.innerWidth);
  H = Math.floor(window.innerHeight);
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize, { passive: true });
resize();

// UI
const introEl   = document.getElementById('intro');
const promptEl  = document.getElementById('prompt');
const memoryEl  = document.getElementById('memory');
const flowersPromptEl = document.getElementById('flowersPrompt');
const northPoleEl = document.getElementById('northPole');
const presentsPromptEl = document.getElementById('presentsPrompt');
const presentsYesBtn = document.getElementById('presentsYes');
const presentsNoBtn  = document.getElementById('presentsNo');
const flowersYesBtn = document.getElementById('flowersYes');
const flowersNoBtn = document.getElementById('flowersNo');
const hudEl     = document.getElementById('hud');

const startBtn = document.getElementById('startBtn');
const viewBtn = document.getElementById('viewBtn');
const continueBtn = document.getElementById('continueBtn');
const closeMemoryBtn = document.getElementById('closeMemoryBtn');
const restartBtn = document.getElementById('restartBtn');
const muteBtn = document.getElementById('muteBtn');

const promptTitle = document.getElementById('promptTitle');
const promptText  = document.getElementById('promptText');
const memoryTitle = document.getElementById('memoryTitle');
const memoryImg   = document.getElementById('memoryImg');
const imageCounter = document.getElementById('imageCounter');
const prevImageBtn = document.getElementById('prevImageBtn');
const nextImageBtn = document.getElementById('nextImageBtn');

// Music
const MUSIC_URL = "assets/audio/bgm_christmas.mp3";
let audio = null, isMuted = false, audioReady = false;
window.__usingWebAudio = false;
function setGlobalMute(m){
  isMuted = !!m;
  // HTMLAudio track
  if (audio) { audio.muted = isMuted; }
  // WebAudio path
  try { if (typeof WebAudioFallback !== 'undefined' && typeof WebAudioFallback.setMuted === 'function') { WebAudioFallback.setMuted(isMuted); } } catch(_){ }
  if (typeof muteBtn !== 'undefined') muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
}

// WebAudio fallback for iOS
let audioCtx = null, masterGain = null, bgmBuffer = null, bgmNode = null;
class WebAudioFallback {
  static async ensureCtx(){ if (!audioCtx) { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); masterGain = audioCtx.createGain(); masterGain.gain.value = isMuted ? 0 : 0.55; masterGain.connect(audioCtx.destination);} return audioCtx; }
  static async load(url){ const r = await fetch(url, {mode:'cors'}); const a = await r.arrayBuffer(); return await (await WebAudioFallback.ensureCtx()).decodeAudioData(a); }
  static async unlock(){ const ctx = await WebAudioFallback.ensureCtx(); if (ctx.state === 'suspended') { try { await ctx.resume(); } catch(e){} } }
  static async startBgm(){ try{ if (audio && !audio.paused) { audio.pause(); audio.currentTime = 0; } }catch(_){ }
window.__usingWebAudio = true;
await WebAudioFallback.unlock(); if (!bgmBuffer) bgmBuffer = await WebAudioFallback.load(MUSIC_URL); if (bgmNode) { try{bgmNode.stop(0);}catch(e){} } bgmNode = audioCtx.createBufferSource(); bgmNode.buffer = bgmBuffer; bgmNode.loop = true; bgmNode.connect(masterGain); try{ bgmNode.start(0);}catch(e){} }
  static setMuted(m){ isMuted = m; if (masterGain) masterGain.gain.value = m ? 0 : 0.55; if (audio){ audio.muted = m; } }
}


// State
let running = false;
let t = 0; // time
let scrollX = 0;
let speed = 1.35;
let pausedForPrompt = false;
let reachedEnd = false;

// Memory stops (== house positions) - positioned so girl starts well before first house
const memories = [
  { 
    x: 700, 
    title: "Your Sydney Birthday",     
    images: [
      { src: "assets/memories/sydney.jpg" },
      { src: "assets/memories/sydney2.jpg" },
      { src: "assets/memories/sydney3.jpg" }
    ]
  },
  { 
    x: 1100, 
    title: "Our Korea Adventure",        
    images: [
      { src: "assets/memories/korea.jpg" },
      { src: "assets/memories/korea2.jpg" },
      { src: "assets/memories/korea3.jpg" }
    ]
  },
  { 
    x: 1500, 
    title: "Cruising around Europe",   
    images: [
      { src: "assets/memories/europe.jpg" },
      { src: "assets/memories/europe2.jpg" },
      { src: "assets/memories/europe3.jpg" }
    ]
  },
  { 
    x: 1900, 
    title: "Christmas with Nanny",     
    images: [
      { src: "assets/memories/nanny.jpg" },
      { src: "assets/memories/nanny2.jpg" },
      { src: "assets/memories/nanny3.jpg" }
    ],
    isNanny: true 
  }
];
const endX = memories[memories.length-1].x + 320;

// Trees
const trees = Array.from({length: 42}).map((_,i)=>{
  const depth = 1 + (i%3);
  const baseX = i*110 + (i%7)*18;
  return { x: baseX, depth, phase: Math.random()*Math.PI*2 };
});

// Santa
let santa = { x: -400, y: 80, speed: 1.6, active: false, timer: 0 };

// Pickup mode variables
let pickupMode = false;
let pickupPhase = 0;
let pickupT = 0;
let santaX = 0;
let santaY = 0;
let santaFacingLeft = false; // Track Santa's direction

// Flowers for Nanny tribute
let carryingFlowers = true; // Girl starts with flowers
let flowersLaidDown = false;
let showFlowersPrompt = false; // Track if we need to show the flowers prompt
let presentsPromptShown = false; // Track if presents prompt has been shown

// Enter animation
let doorPromptShown = new Set(); // run-once guard to prevent double door prompt/spawn

let entering = false;
let enterProgress = 0;
let avatarHidden = false;
let currentMemoryIndex = -1;
let currentImageIndex = 0; // Track which image in the set is being shown
let seenMemories = new Set();

// Helpers
function houseScreenX(worldX){ return Math.floor(worldX - (scrollX * 0.35)); }

// Audio unlock
async function ensureAudio(){
  if (!audio) { audio = new Audio(MUSIC_URL); audio.loop = true; audio.volume = 0.55; audio.crossOrigin='anonymous'; audio.preload='auto'; }
  try {
    await ((window.__usingWebAudio=false), audio.play()); audioReady = true; isMuted = false; muteBtn.textContent = 'Mute';
  } catch (e) {
    // Fallback to WebAudio on iOS
    try { await WebAudioFallback.startBgm(); audioReady = true; muteBtn.textContent = 'Mute'; } catch(_) { muteBtn.textContent = 'Play Music'; }
  }
}
function unlockAudioOnce(){ ensureAudio(); try{WebAudioFallback.unlock();}catch(_){} try{audio&&audio.load&&audio.load();}catch(e){} try{audio&&audio.play&&((window.__usingWebAudio=false), audio.play()).catch(()=>{});}catch(e){}
  window.removeEventListener('touchstart', unlockAudioOnce);
  window.removeEventListener('click', unlockAudioOnce);
}
window.addEventListener('touchstart', unlockAudioOnce, { passive: true });
window.addEventListener('click', unlockAudioOnce, { passive: true });

// Envelope opening animation
const envelopeContainer = document.getElementById('envelopeContainer');
const letterEl = document.getElementById('letter');

// Stage 1: Click envelope to open it
if (envelopeContainer) {
  envelopeContainer.addEventListener('click', () => {
    const envelopeEl = envelopeContainer.querySelector('.envelope');
    if (envelopeEl && !envelopeEl.classList.contains('opening')) {
      // Open the envelope
      envelopeEl.classList.add('opening');
      
      // After envelope opens, hide it and show the letter
      setTimeout(() => {
        envelopeContainer.style.display = 'none';
        letterEl.classList.remove('hidden');
        setTimeout(() => {
          letterEl.classList.add('show');
        }, 50);
      }, 1000);
    }
  });
}

// Stage 2: Click "Let's Go" button to start journey
function startJourney(){
  introEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  running = true;
  ensureAudio();
  if (typeof WebAudioFallback !== 'undefined') { WebAudioFallback.startBgm().catch(()=>{}); }
  setGlobalMute(false);
}

startBtn.addEventListener('click', startJourney);

// HUD mute / play

muteBtn.addEventListener('click', async () => {
  try {
    // Ensure audio systems are initialised
    await ensureAudio();
    // If WebAudio exists, prefer it; otherwise HTMLAudio
    if (typeof WebAudioFallback !== 'undefined') {
      try { await WebAudioFallback.startBgm(); } catch(_){ }
    } else if (audio && audio.paused && !isMuted) {
      try { await ((window.__usingWebAudio=false), audio.play()); } catch(_){ }
    }
    setGlobalMute(!isMuted);
  } catch(e) { console.warn('[mute] handler failed', e); }
});
// Canvas quick tap nudge
canvas.addEventListener('touchstart', () => { if (!pausedForPrompt && running && !entering) scrollX += 5; }, { passive: true });

// Drawing
function drawSky(){
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#08142c'); g.addColorStop(1, '#07101f');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  // stars
  for (let i=0;i<120;i++){
    const x = (i*97 + (t*0.02)) % W;
    const y = ((i*53)%300) + 10;
    const tw = 0.6+0.4*Math.sin(t*0.05 + i);
    ctx.globalAlpha = tw; ctx.fillStyle = '#eaf6ff'; ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}
function drawSnow(){
  const flakes = 140;
  for (let i=0;i<flakes;i++){
    const fx = (i * 113 + (t*0.3)%2000) % W;
    const fy = (i * 59 + (t*0.7)%H) % H;
    ctx.globalAlpha = 0.65; ctx.fillStyle = '#eaf6ff'; ctx.fillRect(fx, fy, 2, 2);
  }
  ctx.globalAlpha = 1;
}
function drawGround(){
  ctx.fillStyle = '#0b1822'; ctx.fillRect(0, H*0.78, W, H*0.22);
  ctx.shadowColor = '#86a7ff'; ctx.shadowBlur = 18; ctx.fillStyle = '#a7c4ff';
  const pathY = H*0.78;
  ctx.beginPath();
  ctx.moveTo(0, pathY-10);
  ctx.bezierCurveTo(W*0.25, pathY-6, W*0.5, pathY-10, W, pathY-8);
  ctx.lineTo(W, pathY+10);
  ctx.bezierCurveTo(W*0.5, pathY+14, W*0.25, pathY+8, 0, pathY+12);
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
}
function drawTree(screenX, baseY, height, sway, twinklePhase=false){
  const trunkH = height*0.25;
  ctx.fillStyle = '#20363e'; ctx.fillRect(screenX-3, baseY-trunkH, 6, trunkH);
  ctx.fillStyle = '#1b3a2f';
  ctx.beginPath(); ctx.moveTo(screenX + sway, baseY - height);
  ctx.lineTo(screenX - 42, baseY - trunkH);
  ctx.lineTo(screenX + 42, baseY - trunkH);
  ctx.closePath(); ctx.fill();
  if (twinklePhase){
    const dots = 5;
    for (let d=0; d<dots; d++){
      const lx = screenX + Math.sin(d*1.2 + twinklePhase)*18;
      const ly = baseY - trunkH - d*8 - 6;
      const tw = 0.6+0.4*Math.sin(t*0.12 + d + twinklePhase*2);
      const col = d%2 ? '#ffd97b' : '#ff7d8a';
      ctx.globalAlpha = tw; ctx.fillStyle = col; ctx.fillRect(lx, ly, 3, 3);
    } ctx.globalAlpha = 1;
  }
}
function drawHouse(screenX, glowIntensity=0, isNanny=false){
  const baseY = H*0.78;
  const w = 140, h = 82;
  ctx.save(); ctx.translate(screenX, baseY);
  
  // Special heavenly effects for Nanny's house
  if (isNanny) {
    // Soft glowing stars around the house
    for (let s = 0; s < 8; s++) {
      const angle = (t * 0.02 + s * Math.PI / 4);
      const radius = 80 + Math.sin(t * 0.03 + s) * 10;
      const starX = Math.cos(angle) * radius;
      const starY = -60 + Math.sin(angle) * radius;
      const starAlpha = 0.4 + 0.3 * Math.sin(t * 0.08 + s);
      
      ctx.save();
      ctx.globalAlpha = starAlpha;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 15;
      // Draw a 4-pointed star
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI / 2) + t * 0.01;
        const r = i % 2 === 0 ? 4 : 2;
        const px = starX + Math.cos(a) * r;
        const py = starY + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    
    // Large ethereal glow around entire house
    const angelGlow = 0.4 + 0.2 * Math.sin(t * 0.04);
    const glowGrad = ctx.createRadialGradient(0, -h/2, 10, 0, -h/2, 160);
    glowGrad.addColorStop(0, 'rgba(255, 255, 255, ' + (angelGlow * 0.3) + ')');
    glowGrad.addColorStop(0.5, 'rgba(200, 220, 255, ' + (angelGlow * 0.15) + ')');
    glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(-w, -h-80, w*2, h*2 + 80);
    
    // Gentle light rays from above
    ctx.save();
    ctx.globalAlpha = 0.15 + 0.08 * Math.sin(t * 0.05);
    for (let ray = 0; ray < 5; ray++) {
      const rayX = -50 + ray * 25;
      ctx.fillStyle = '#ffffee';
      ctx.beginPath();
      ctx.moveTo(rayX, -h - 100);
      ctx.lineTo(rayX - 8, -h);
      ctx.lineTo(rayX + 8, -h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    
    // Soft pulsing border glow
    ctx.shadowColor = 'rgba(255, 255, 255, ' + angelGlow + ')';
    ctx.shadowBlur = 30;
  }
  
  ctx.fillStyle = '#c77f39'; ctx.fillRect(-w/2, -h, w, h);
  ctx.fillStyle = '#9b5a2a'; ctx.beginPath();
  ctx.moveTo(-w/2-10, -h); ctx.lineTo(0, -h-46); ctx.lineTo(w/2+10, -h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f5fbff'; ctx.beginPath();
  ctx.moveTo(-w/2-10, -h+3); ctx.lineTo(0, -h-34); ctx.lineTo(w/2+10, -h+3);
  ctx.quadraticCurveTo(w/2, -h+12, 0, -h+18); ctx.quadraticCurveTo(-w/2, -h+12, -w/2-10, -h+3); ctx.closePath(); ctx.fill();
  
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  
  ctx.fillStyle = '#ffd97b'; ctx.shadowColor = '#ffd97b'; ctx.shadowBlur = 18;
  ctx.fillRect(-w/4-14, -h+20, 28, 24); ctx.fillRect(w/4-14, -h+20, 28, 24);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#823f19'; ctx.fillRect(-14, -h+34, 28, 36);
  if (glowIntensity > 0){
    const gx = 0, gy = -h+44; const r = 42 * glowIntensity;
    const grad = ctx.createRadialGradient(gx, gy, 2, gx, gy, r);
    grad.addColorStop(0, 'rgba(255, 217, 123, 0.55)'); grad.addColorStop(1, 'rgba(255, 217, 123, 0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function drawAvatar(x){
  const yBase = H*0.78 - 8;
  const phase = Math.sin(t*0.18);
  
  // Legs with shoes
  ctx.strokeStyle = '#f5d27a'; 
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x-5, yBase); 
  ctx.lineTo(x-5 + phase*4, yBase+18);
  ctx.moveTo(x+5, yBase); 
  ctx.lineTo(x+5 - phase*4, yBase+18);
  ctx.stroke();
  
  // Shoes
  ctx.fillStyle = '#8b4513';
  ctx.beginPath();
  ctx.ellipse(x-5 + phase*4, yBase+20, 4, 3, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x+5 - phase*4, yBase+20, 4, 3, 0, 0, Math.PI*2);
  ctx.fill();
  
  // Dress/Body - more detailed
  ctx.fillStyle = '#e91e63'; // Brighter pink
  ctx.beginPath();
  // Create a dress shape
  ctx.moveTo(x-8, yBase-26);
  ctx.lineTo(x-10, yBase);
  ctx.lineTo(x+10, yBase);
  ctx.lineTo(x+8, yBase-26);
  ctx.closePath();
  ctx.fill();
  
  // Dress collar/neck
  ctx.fillStyle = '#c2185b';
  ctx.fillRect(x-6, yBase-26, 12, 3);
  
  // Arms
  ctx.strokeStyle = '#ffe7d1';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x-8, yBase-22);
  ctx.lineTo(x-14, yBase-10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x+8, yBase-22);
  ctx.lineTo(x+14, yBase-10);
  ctx.stroke();
  
  // Hands
  ctx.fillStyle = '#ffe7d1';
  ctx.beginPath();
  ctx.arc(x-14, yBase-10, 3, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x+14, yBase-10, 3, 0, Math.PI*2);
  ctx.fill();
  
  // Draw flowers in her hand if carrying them
  if (carryingFlowers && !flowersLaidDown) {
    ctx.save();
    // Bouquet position (in her right hand)
    const bouquetX = x + 14;
    const bouquetY = yBase - 10;
    
    // Stems
    ctx.strokeStyle = '#2d5016';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bouquetX, bouquetY);
    ctx.lineTo(bouquetX, bouquetY + 18);
    ctx.stroke();
    
    // Flowers (multiple small flowers)
    const flowerColors = ['#ff6b9d', '#ffb5d8', '#ff8fab', '#ffc0cb'];
    for (let i = 0; i < 4; i++) {
      const offsetX = (i - 1.5) * 4;
      const offsetY = -i * 2.5;
      ctx.fillStyle = flowerColors[i];
      ctx.beginPath();
      ctx.arc(bouquetX + offsetX, bouquetY + offsetY, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Flower center
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(bouquetX + offsetX, bouquetY + offsetY, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  
  // Neck
  ctx.fillStyle = '#ffe7d1';
  ctx.fillRect(x-3, yBase-28, 6, 4);
  
  // Head
  ctx.fillStyle = '#ffe7d1'; 
  ctx.beginPath(); 
  ctx.arc(x, yBase-38, 10, 0, Math.PI*2); 
  ctx.fill();
  
  // Eyes
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(x-3, yBase-38, 1.5, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x+3, yBase-38, 1.5, 0, Math.PI*2);
  ctx.fill();
  
  // Smile
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, yBase-36, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();
  
  // Hair - fuller and more detailed (BLONDE)
  ctx.fillStyle = '#f4d03f'; // Blonde hair color
  ctx.beginPath();
  // Hair top/crown
  ctx.arc(x, yBase-38, 11.5, Math.PI*0.9, Math.PI*2.1);
  ctx.fill();
  
  // Hair sides
  ctx.beginPath();
  ctx.ellipse(x-8, yBase-36, 5, 8, -0.3, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x+8, yBase-36, 5, 8, 0.3, 0, Math.PI*2);
  ctx.fill();
  
  // Hair bow
  ctx.fillStyle = '#ff69b4'; 
  ctx.beginPath();
  // Left bow
  ctx.ellipse(x-5, yBase-45, 4, 3, -0.3, 0, Math.PI*2);
  ctx.fill();
  // Right bow
  ctx.beginPath();
  ctx.ellipse(x+5, yBase-45, 4, 3, 0.3, 0, Math.PI*2);
  ctx.fill();
  // Bow center
  ctx.beginPath();
  ctx.arc(x, yBase-45, 2, 0, Math.PI*2);
  ctx.fill();
}
function drawMarker(screenX){
  const y = H*0.72;
  ctx.fillStyle = '#e6ff7a'; ctx.beginPath(); ctx.arc(screenX, y, 6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#203044'; ctx.fillRect(screenX-1, y, 2, 18);
}
function drawPresents(screenX){
  const baseY = H*0.78;
  // Draw three stacked gift boxes
  ctx.save(); ctx.translate(screenX, baseY);
  // bottom box
  ctx.fillStyle = '#ff6b6b'; ctx.fillRect(-60, -40, 120, 40);
  ctx.fillStyle = '#ffd166'; ctx.fillRect(-8, -40, 16, 40);
  // middle box
  ctx.fillStyle = '#4ecdc4'; ctx.fillRect(-40, -78, 80, 38);
  ctx.fillStyle = '#ffe66d'; ctx.fillRect(-6, -78, 12, 38);
  // top box with bow
  ctx.fillStyle = '#95d5ff'; ctx.fillRect(-28, -108, 56, 30);
  ctx.fillStyle = '#ffd97b'; ctx.fillRect(-4, -108, 8, 30);
  ctx.strokeStyle = '#ffd97b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -116); ctx.bezierCurveTo(-10, -122, -10, -132, 0, -136); ctx.bezierCurveTo(10, -132, 10, -122, 0, -116); ctx.stroke();
  ctx.restore();
}

function drawSantaSleigh(x, y){
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#6b0f1a';
  ctx.fillRect(-40, -14, 80, 18); ctx.fillRect(20, -24, 22, 12);
  ctx.beginPath(); ctx.moveTo(40, 4); ctx.quadraticCurveTo(52, -6, 62, 4);
  ctx.strokeStyle='#3b1d0f'; ctx.lineWidth=3; ctx.stroke();
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-90, -18, 26, 10); ctx.fillRect(-120, -18, 26, 10);
  ctx.restore();
}

function drawSanta(){
  // Background Santa (only when not in pickup mode)
  if (!pickupMode) {
    santa.timer -= 1;
    if (santa.timer <= 0 && !santa.active){ santa.active = true; santa.x = -300; santa.y = 60 + Math.random()*40; }
    if (santa.active){
      santa.x += santa.speed;
      if (santa.x > W + 200){ santa.active = false; santa.timer = 60 * (8 + Math.random()*4); }
      ctx.save(); ctx.translate(santa.x, santa.y);
      
      // Draw reindeer FIRST (in front of sleigh, pulling)
      for (let i=0;i<3;i++){
        const rx = 80 + i*30; // Position reindeer IN FRONT (positive x)
        const ry = 2 - Math.sin((t*0.2 + i))*2;
        
        // Reindeer body
        ctx.fillStyle = '#8b6914';
        ctx.beginPath();
        ctx.ellipse(rx, ry, 7, 4, 0, 0, Math.PI*2);
        ctx.fill();
        
        // Reindeer head
        ctx.fillStyle = '#a0826d';
        ctx.beginPath();
        ctx.arc(rx+8, ry-1, 4, 0, Math.PI*2);
        ctx.fill();
        
        // Antlers
        ctx.strokeStyle = '#6b4423';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx+8, ry-5);
        ctx.lineTo(rx+6, ry-8);
        ctx.moveTo(rx+8, ry-5);
        ctx.lineTo(rx+10, ry-8);
        ctx.stroke();
        
        // Harness to sleigh
        if (i === 0) {
          ctx.strokeStyle = '#654321';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(rx-7, ry);
          ctx.lineTo(25, 6);
          ctx.stroke();
        }
      }
      
      // Then draw Santa's sleigh BEHIND reindeer
      ctx.fillStyle = '#d11b2c'; ctx.strokeStyle = '#ffd97b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-20, 10); ctx.lineTo(0, 0); ctx.lineTo(20, 6); ctx.lineTo(12, 14); ctx.lineTo(-20, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -6, 6, 3);
      ctx.fillStyle = '#ff6574'; ctx.beginPath(); ctx.arc(4, -10, 6, 0, Math.PI*2); ctx.fill();
      
      ctx.restore();
    }
  }
  
  // Pickup Santa with sleigh and girl
  if (pickupMode) {
    ctx.save();
    ctx.translate(santaX, santaY);
    
    // Flip horizontally if facing left (flying away)
    if (santaFacingLeft) {
      ctx.scale(-1, 1);
    }
    
    // Draw reindeer (3 reindeer pulling the sleigh in a line)
    for (let i=0;i<3;i++){
      const rx = -90 - i*35; // Spread them out more in front
      const ry = 5 - Math.sin((t*0.2 + i))*3; // Galloping motion
      
      // Reindeer body
      ctx.fillStyle = '#8b6914';
      ctx.beginPath();
      ctx.ellipse(rx, ry, 10, 7, 0, 0, Math.PI*2);
      ctx.fill();
      
      // Reindeer head - position changes based on direction
      // When NOT flipped (facing right), head should be on right (+12)
      // When flipped (facing left), head should be on left (-12 which becomes right after flip)
      const headOffset = santaFacingLeft ? 12 : -12;
      ctx.fillStyle = '#a0826d';
      ctx.beginPath();
      ctx.arc(rx+headOffset, ry-2, 6, 0, Math.PI*2);
      ctx.fill();
      
      // Antlers - adjust based on direction
      ctx.strokeStyle = '#6b4423';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (santaFacingLeft) {
        ctx.moveTo(rx+12, ry-8);
        ctx.lineTo(rx+10, ry-12);
        ctx.moveTo(rx+12, ry-8);
        ctx.lineTo(rx+14, ry-11);
      } else {
        ctx.moveTo(rx-12, ry-8);
        ctx.lineTo(rx-10, ry-12);
        ctx.moveTo(rx-12, ry-8);
        ctx.lineTo(rx-14, ry-11);
      }
      ctx.stroke();
      
      // Legs
      ctx.strokeStyle = '#8b6914';
      ctx.lineWidth = 3;
      ctx.beginPath();
      // Front legs
      ctx.moveTo(rx+5, ry+7);
      ctx.lineTo(rx+5, ry+15);
      ctx.moveTo(rx+8, ry+7);
      ctx.lineTo(rx+8, ry+15);
      // Back legs  
      ctx.moveTo(rx-5, ry+7);
      ctx.lineTo(rx-5, ry+15);
      ctx.moveTo(rx-2, ry+7);
      ctx.lineTo(rx-2, ry+15);
      ctx.stroke();
      
      // Red nose (for lead reindeer - Rudolph!) - adjust based on direction
      if (i === 0) {
        const noseOffset = santaFacingLeft ? 16 : -16;
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(rx+noseOffset, ry-2, 3, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      
      // Harness connecting to sleigh - adjust based on direction
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const harnessOffset = santaFacingLeft ? -10 : 10; // Back of reindeer changes with direction
      ctx.moveTo(rx+harnessOffset, ry); // Connection point on reindeer
      if (i === 0) {
        // Lead reindeer connects directly to front of sleigh
        ctx.lineTo(-50, 0);
      } else {
        // Other reindeer connect to the one in front
        const prevRx = -90 - (i-1)*35;
        ctx.lineTo(prevRx+harnessOffset, 5 - Math.sin((t*0.2 + (i-1)))*3);
      }
      ctx.stroke();
    }
    
    // Main harness line to sleigh
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-50, 0);
    ctx.lineTo(-45, 0);
    ctx.stroke();
    
    // Draw sleigh
    ctx.fillStyle = '#8b0000'; // Dark red sleigh
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    
    // Sleigh runners (curved bottom)
    ctx.beginPath();
    ctx.moveTo(-45, 10);
    ctx.quadraticCurveTo(-50, 15, -45, 20);
    ctx.quadraticCurveTo(-20, 18, -10, 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(35, 10);
    ctx.quadraticCurveTo(30, 15, 35, 20);
    ctx.quadraticCurveTo(50, 18, 55, 20);
    ctx.stroke();
    
    // Sleigh body
    ctx.fillStyle = '#b22222';
    ctx.beginPath();
    ctx.moveTo(-40, 10);
    ctx.lineTo(-40, -15);
    ctx.quadraticCurveTo(-40, -20, -35, -20);
    ctx.lineTo(30, -20);
    ctx.quadraticCurveTo(35, -20, 35, -15);
    ctx.lineTo(35, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Sleigh decorative trim
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-38, -18);
    ctx.lineTo(33, -18);
    ctx.stroke();
    
    // Draw Santa in the sleigh
    ctx.fillStyle = '#d11b2c';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Santa's body (sitting)
    ctx.arc(-10, -8, 12, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();
    
    // Santa's head
    ctx.fillStyle = '#ffe7d1';
    ctx.beginPath();
    ctx.arc(-10, -18, 7, 0, Math.PI*2);
    ctx.fill();
    
    // Santa's hat
    ctx.fillStyle = '#d11b2c';
    ctx.beginPath();
    ctx.moveTo(-17, -18);
    ctx.lineTo(-10, -28);
    ctx.lineTo(-3, -18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-10, -28, 3, 0, Math.PI*2);
    ctx.fill();
    
    // Santa's beard
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-10, -15, 5, 0.2, Math.PI - 0.2);
    ctx.fill();
    
    // Draw girl in sleigh (if she's boarded - phase 1 or later)
    if (pickupPhase >= 1) {
      // Girl's head
      ctx.fillStyle = '#ffe7d1';
      ctx.beginPath();
      ctx.arc(8, -15, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Girl's body (sitting)
      ctx.fillStyle = '#e91e63';
      ctx.beginPath();
      ctx.arc(8, -6, 9, 0, Math.PI*2);
      ctx.fill();
      
      // Girl's hair (BLONDE)
      ctx.fillStyle = '#f4d03f';
      ctx.beginPath();
      ctx.arc(8, -15, 7, Math.PI*0.9, Math.PI*2.1);
      ctx.fill();
      
      // Hair bow
      ctx.fillStyle = '#ff69b4';
      ctx.beginPath();
      ctx.ellipse(5, -20, 3, 2, -0.3, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(11, -20, 3, 2, 0.3, 0, Math.PI*2);
      ctx.fill();
    }
    
    ctx.restore();
  }
}


// Main loop
function frame(){
  requestAnimationFrame(frame);
  if (!running) return;

  t += 1;
  if (!pausedForPrompt && !reachedEnd && !entering) scrollX += speed;
  if (entering){
    enterProgress += 0.03;
    if (enterProgress >= 1){
      entering = false;
      avatarHidden = true;
      // Removed chime sound here
      const m = memories[currentMemoryIndex];
      currentImageIndex = 0; // Start with first image
      memoryTitle.textContent = m.title;
      memoryImg.src = m.images[currentImageIndex].src;
      imageCounter.textContent = `${currentImageIndex + 1} / ${m.images.length}`;
      updateImageNavButtons();
      memoryEl.classList.remove('hidden');
    }
  }

  drawSky(); drawSnow(); drawGround();

  // Tree line on same baseline as houses; draw BEFORE houses
  const baseTreeY = H*0.78;
  for (let tr of trees){
    const screenX = Math.floor((tr.x - (scrollX * (0.28 + tr.depth*0.06))) % (W*2));
    const h = 70 + tr.depth*28;
    const sway = Math.sin(t*0.02 + tr.phase) * (1.0 + tr.depth*0.25);
    drawTree(screenX, baseTreeY, h, sway, tr.depth >= 2 ? tr.phase : false);
  }

  // Houses at memory positions (glow when close/active)
  for (let i=0;i<memories.length;i++){
    const sx = houseScreenX(memories[i].x);
    if (sx < -200 || sx > W + 200) { continue; }
    if (sx < -200 || sx > W + 200) { /* off-screen, skip */ continue; }
    let glow = 0;
    const avatarBaseX = Math.floor(W * 0.35);
    const screenDist = Math.abs(sx - avatarBaseX);
    if (i === currentMemoryIndex && (pausedForPrompt || entering)) glow = 1.0;
    else if (screenDist < 40) glow = 0.35 + 0.25 * Math.sin(t*0.15);
    
    // Draw flowers on ground at Nanny's house if laid down
    if (memories[i].isNanny && flowersLaidDown) {
      const flowerX = sx + 40; // Position in front of door
      const flowerY = H * 0.78 - 5;
      ctx.save();
      // Stems
      ctx.strokeStyle = '#2d5016';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(flowerX, flowerY);
      ctx.lineTo(flowerX, flowerY + 15);
      ctx.stroke();
      
      // Flowers laid down
      const flowerColors = ['#ff6b9d', '#ffb5d8', '#ff8fab'];
      for (let j = 0; j < 3; j++) {
        const offsetX = (j - 1) * 7;
        const offsetY = -j * 2;
        ctx.fillStyle = flowerColors[j];
        ctx.beginPath();
        ctx.arc(flowerX + offsetX, flowerY + offsetY, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Flower center
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(flowerX + offsetX, flowerY + offsetY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    
    drawHouse(sx, glow, memories[i].isNanny);
  }

  // Avatar
  const avatarBaseX = Math.floor(W * 0.35);
  let avatarX = avatarBaseX;
  if (entering && currentMemoryIndex >= 0){
    const targetHouseX = houseScreenX(memories[currentMemoryIndex].x);
    avatarX = avatarBaseX + (targetHouseX - avatarBaseX) * Math.min(1, enterProgress);
  }
  if (!avatarHidden) drawAvatar(avatarX);

  // Markers & prompt triggers
  for (let i=0;i<memories.length;i++){
    const sx = houseScreenX(memories[i].x);
    if (sx < -200 || sx > W + 200) { /* off-screen, skip */ continue; }
    if (!seenMemories.has(i)) drawMarker(sx);
    if (!pausedForPrompt && !seenMemories.has(i) && !entering){
      const screenDist = Math.abs(sx - avatarBaseX);
      if (screenDist < 18){
            if (doorPromptShown.has(i)) { continue; } doorPromptShown.add(i);
        pausedForPrompt = true;
        currentMemoryIndex = i;
        promptTitle.textContent = memories[i].title;
        promptText.textContent  = "Go inside to view the memory, or keep walking?";
        promptEl.classList.remove('hidden');
      }
    }
  }

  /* PRESENTS PROMPT GATE - only after all memories seen AND flowers laid down */
  if (!presentsPromptShown && seenMemories.size === memories.length && flowersLaidDown && !pausedForPrompt && !pickupMode && !entering) {
    pausedForPrompt = true;
    presentsPromptShown = true;
    presentsPromptEl.classList.remove('hidden');
  }

  // Handle Santa pickup animation
  if (pickupMode) {
    handleSantaPickup();
  }

  drawSanta();
}
requestAnimationFrame(frame);

// Image navigation helpers
function updateImageNavButtons() {
  if (currentMemoryIndex < 0) return;
  const m = memories[currentMemoryIndex];
  // Hide prev button on first image
  if (currentImageIndex === 0) {
    prevImageBtn.style.display = 'none';
  } else {
    prevImageBtn.style.display = 'block';
  }
  // Hide next button on last image
  if (currentImageIndex === m.images.length - 1) {
    nextImageBtn.style.display = 'none';
  } else {
    nextImageBtn.style.display = 'block';
  }
}

function showImage(index) {
  if (currentMemoryIndex < 0) return;
  const m = memories[currentMemoryIndex];
  if (index < 0 || index >= m.images.length) return;
  
  currentImageIndex = index;
  memoryImg.src = m.images[currentImageIndex].src;
  imageCounter.textContent = `${currentImageIndex + 1} / ${m.images.length}`;
  updateImageNavButtons();
}

// Santa pickup animation
function handleSantaPickup() {
  pickupT += 1;
  
  const avatarBaseX = Math.floor(W * 0.35);
  const avatarBaseY = Math.floor(H * 0.78);
  
  // Phase 0: Santa flies in from right
  if (pickupPhase === 0) {
    santaX -= 3.5; // Santa moves left toward the girl
    santaY = Math.floor(H * 0.72);
    
    // When Santa reaches the girl
    if (santaX <= avatarBaseX + 100) {
      pickupPhase = 1;
      pickupT = 0;
    }
  }
  // Phase 1: Girl boards sleigh (brief pause)
  else if (pickupPhase === 1) {
    if (pickupT > 30) { // Wait 30 frames (~0.5 seconds)
      pickupPhase = 2;
      pickupT = 0;
      avatarHidden = true; // Hide the girl avatar
      santaFacingLeft = true; // Turn Santa around to face left when flying away
    }
  }
  // Phase 2: Santa flies away to the right with the girl
  else if (pickupPhase === 2) {
    santaX += 4.5;
    santaY -= 0.8; // Fly up slightly
    
    // When Santa exits screen, show North Pole message
    if (santaX > W + 200) {
      pickupPhase = 3;
      northPoleEl.classList.remove('hidden');
      pickupMode = false; // End pickup mode
    }
  }
}

// Buttons
viewBtn.addEventListener('click', () => {
  promptEl.classList.add('hidden');
  entering = true; enterProgress = 0;
});
continueBtn.addEventListener('click', () => {
  promptEl.classList.add('hidden'); pausedForPrompt = false;
});

// Image navigation buttons
prevImageBtn.addEventListener('click', () => {
  showImage(currentImageIndex - 1);
});
nextImageBtn.addEventListener('click', () => {
  showImage(currentImageIndex + 1);
});

closeMemoryBtn.addEventListener('click', () => {
  memoryEl.classList.add('hidden'); 
  avatarHidden = false;
  seenMemories.add(currentMemoryIndex);
  
  // If this was Nanny's house, show the flowers prompt
  if (currentMemoryIndex >= 0 && memories[currentMemoryIndex].isNanny && carryingFlowers) {
    pausedForPrompt = true;
    flowersPromptEl.classList.remove('hidden');
  } else {
    pausedForPrompt = false;
  }
});

if (presentsYesBtn) presentsYesBtn.addEventListener('click', () => {
  presentsPromptEl.classList.add('hidden');
  pausedForPrompt = false;
  santaX = W + 220; // Start Santa off-screen to the right
  santaY = Math.floor(H * 0.72);
  santaFacingLeft = false; // Santa starts facing right
  pickupMode = true; 
  pickupPhase = 0; 
  pickupT = 0;
});

if (presentsNoBtn) presentsNoBtn.addEventListener('click', () => {
  presentsPromptEl.classList.add('hidden');
  pausedForPrompt = false;
});

if (flowersYesBtn) flowersYesBtn.addEventListener('click', () => {
  flowersPromptEl.classList.add('hidden');
  carryingFlowers = false;
  flowersLaidDown = true;
  pausedForPrompt = false;
});

if (flowersNoBtn) flowersNoBtn.addEventListener('click', () => {
  flowersPromptEl.classList.add('hidden');
  pausedForPrompt = false;
});

restartBtn.addEventListener('click', () => {
  northPoleEl.classList.add('hidden');
  scrollX = 0; pausedForPrompt = false; reachedEnd = false;
  seenMemories.clear(); doorPromptShown.clear(); currentMemoryIndex = -1;
  entering = false; enterProgress = 0; avatarHidden = false;
  pickupMode = false; pickupPhase = 0; pickupT = 0; santaFacingLeft = false;
  carryingFlowers = true; flowersLaidDown = false; showFlowersPrompt = false;
  presentsPromptShown = false; // Reset presents prompt flag
  running = true;
});

// One-time global kick to satisfy iOS gesture requirement
window.__audioKick = false;
window.addEventListener('pointerdown', async () => {
  if (window.__audioKick) return;
  window.__audioKick = true;
  try {
    await ensureAudio();
    if (typeof WebAudioFallback !== 'undefined') {
      await WebAudioFallback.startBgm();
      WebAudioFallback.setMuted(false);
      muteBtn.textContent = 'Mute';
      console.log('[audio] Global kick started WebAudio');
    }
  } catch(e){ console.warn('[audio] Global kick failed', e); }
}, { once: true });
