
const game = document.getElementById('game');
game.focus();

function W() { return game.clientWidth; }
function H() { return game.clientHeight; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function choose(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function now() { return performance.now(); }

const AudioEngine = (() => {
    // Preload all audio files
    const sounds = {
        beep: new Audio('sounds/beep.mp3'),
        noiseBurst: new Audio('sounds/noiseBurst.mp3'),
        chime: new Audio('sounds/chime.mp3'),
        pop: new Audio('sounds/pop.mp3'),
        hurt: new Audio('sounds/hurt.mp3'),
        gameOver: new Audio('sounds/gameOver.mp3'),
        splinter: new Audio('sounds/splinter.mp3'),
        explode: new Audio('sounds/explode.mp3'),
    };

    function playSound(name) {
        if (!sounds[name]) return;
        const snd = sounds[name].cloneNode();
        snd.play();
    }

    function beep() { playSound('beep'); }
    function noiseBurst() { playSound('noiseBurst'); }
    function chime() { playSound('chime'); }
    function pop() { playSound('pop'); }
    function hurt() { playSound('hurt'); }
    function gameOver() { playSound('gameOver'); }
    function splinter() { playSound('splinter'); }
    function explode() { playSound('explode'); }

    return { beep, noiseBurst, chime, pop, hurt, gameOver, splinter, explode };
})();

const state = {
    running: false,
    score: 0,
    highscore: Number(localStorage.getItem('cvw_high') || 0),
    eggsLaid: 0,
    keys: new Set(),
    entities: { chicken: null, routers: [], foxes: [], snakes: [], eggs: [], projectiles: [], powerups: [] },
    timers: {},
    lastEggTick: 0,
    eggInterval: 5000,
    weaponAmmo: 6,
    maxAmmo: 6,
    dashReady: true,
    shieldUntil: 0,
    level: 1,
    levelStart: now(),
    events: { wifiDownUntil: 0, stormUntil: 0, goldenUntil: 0 },
    achievements: { firstFox: false, tenEggs: false, survive60: false },
    paused: false
};


function stopTimers() {
    for (const key in state.timers) {
        clearInterval(state.timers[key]);
        state.timers[key] = null;
    }
}


function makeEntity(cls, emoji) {
    const el = document.createElement('div'); el.className = 'entity ' + cls;
    el.innerHTML = emoji || ''; game.appendChild(el); return el;
}
function makeParticle(html, x, y) {
    const p = document.createElement('div'); p.className = 'splat'; p.innerHTML = html || ''; p.style.left = x + 'px'; p.style.top = y + 'px';
    game.appendChild(p); setTimeout(() => p.remove(), 500);
}

const damageFlash = document.createElement('div'); damageFlash.className = 'damageFlash'; game.appendChild(damageFlash);

function explodeEntity(entityObj, type = 'fox', count = 18) {
    const el = entityObj.el;
    const rectEl = el.getBoundingClientRect(), gameRect = game.getBoundingClientRect();
    const cx = rectEl.left - gameRect.left + rectEl.width / 2;
    const cy = rectEl.top - gameRect.top + rectEl.height / 2;

    const pieces = [];
    for (let i = 0; i < count; i++) {
        const frag = document.createElement('div');
        frag.className = 'fragment ' + (type === 'chicken' ? (Math.random() < 0.5 ? 'fragment--chicken' : 'fragment--chicken-acc') : (Math.random() < 0.5 ? 'fragment--fox' : 'fragment--fox-acc'));
        const s = Math.round(rand(8, 16));
        frag.style.width = s + 'px';
        frag.style.height = Math.round(s * (0.7 + Math.random() * 0.6)) + 'px';
        frag.style.left = (cx - s / 2) + 'px';
        frag.style.top = (cy - s / 2) + 'px';
        frag.style.opacity = '1';
        frag.style.transform = 'translate(0px,0px) rotate(0deg) scale(1)';
        game.appendChild(frag);
        pieces.push(frag);

        const angle = Math.random() * Math.PI * 2;
        const speed = rand(3, 10) * (type === 'fox' ? 1.0 : 0.9);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - rand(0, 3); // slight upward bias
        const rotate = (Math.random() - 0.5) * 720;
        const ttl = 700 + Math.random() * 600;

        const start = performance.now();
        const anim = (t) => {
            const p = Math.min(1, (t - start) / ttl);
            const ease = 1 - Math.pow(1 - p, 2);
            const curX = vx * ease * (ttl / 100);
            const curY = vy * ease * (ttl / 100) + (0.3 * ease * ttl / 100); // gravity-ish
            frag.style.transform = `translate(${curX}px, ${curY}px) rotate(${rotate * p}deg) scale(${1 - 0.45 * p})`;
            frag.style.opacity = String(Math.max(0, 1 - p));
            if (p < 1) requestAnimationFrame(anim);
            else frag.remove();
        };
        requestAnimationFrame(anim);
    }

    AudioEngine.splinter();
    setTimeout(() => AudioEngine.explode(), 40);

    for (let i = 0; i < 6; i++) {
        makeParticle('', cx + rand(-12, 12), cy + rand(-8, 8));
    }
}

function spawnChicken() {
    const el = makeEntity('chicken', '<div class="emoji">🐔</div>');
    el.style.left = (W() / 2 - 28) + 'px'; el.style.top = (H() / 2 - 28) + 'px';
    state.entities.chicken = { el, x: W() / 2 - 28, y: H() / 2 - 28, hp: 5, wontDamageUntil: 0 };
}

function showIntroOverlay(show = true) {
    if (!show) return;
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="panel"><h1>Chicken Farm</h1>
    <div class="p"> Collect eggs, shut the foxes, level up! </div>
    <div class="small controls">Controls: WASD/Arrows to move • Space to throw egg (ammo) • Shift to dash • Enter to start</div>
    <div style="margin-top:12px"><button id="startBtn" class="startbtn">Start</button></div></div>`;
    game.appendChild(ov);
    document.getElementById('startBtn').addEventListener('click', () => { ov.remove(); startGame(); });
}
showIntroOverlay(true);

function startGame() {
    clearAll();
    spawnChicken();
    updateHUD();
    state.running = true;
    state.level = 1;
    state.levelStart = now();
    state.score = 0;
    state.eggsLaid = 0;
    state.weaponAmmo = state.maxAmmo;
    spawnRoutine();
    loopId = requestAnimationFrame(loop);
    showIntroOverlay(false);
    showToast(`Get close to farmers, lay eggs, and escape from foxes and snakes. 
        Good luck`);
    AudioEngine.chime();
}
let toastTimer = null;
function showToast(msg, ms = 2400) {
    let t = document.querySelector('.game-toast');
    if (!t) {
        t = document.createElement('div');
        t.className = 'game-toast';
        t.style.position = 'absolute';
        t.style.left = '50%';
        t.style.transform = 'translateX(-50%)';
        t.style.top = '12px';
        t.style.zIndex = '80';
        game.appendChild(t);
    }
    t.textContent = msg;
    t.style.padding = '10px 14px';
    t.style.borderRadius = '10px';
    t.style.background = 'rgba(0,0,0,0.42)';
    t.style.border = '1px solid rgba(255,255,255,0.04)';
    t.style.color = '#fff';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.remove(); }, ms);
}
function getPlayerCenter() { const c = state.entities.chicken.el.getBoundingClientRect(), g = game.getBoundingClientRect(); return { x: c.left - g.left + c.width / 2, y: c.top - g.top + c.height / 2 }; }
function createRouter(x, y, options = {}) {
    const el = document.createElement('div'); 
    el.className = 'router';
    el.innerHTML = '<div class="farmer">👨‍🌾</div><div class="wave"></div><div class="wave"></div><div class="wave"></div>';
    game.appendChild(el);
    
    // Create rings
    const strong = document.createElement('div'); strong.className = 'ring strong';
    const mid = document.createElement('div'); mid.className = 'ring mid';
    const weak = document.createElement('div'); weak.className = 'ring weak';
    el.appendChild(weak); el.appendChild(mid); el.appendChild(strong);
    
    const r = {
        el, x: x, y: y,
        radii: options.radii || { strong: 60, mid: 120, weak: 180 },
        golden: !!options.golden,
        created: now()
    };
    sizeRouter(r);
    state.entities.routers.push(r);
    return r;
}

function sizeRouter(r) {
    const { radii, el } = r;
    // Center the router container
    el.style.left = (r.x - 30) + 'px';
    el.style.top = (r.y - 30) + 'px';
    
    // Position the farmer/wizard in the center
    const farmer = el.querySelector('.farmer, .wizard');
    if (farmer) {
        farmer.style.position = 'absolute';
        farmer.style.left = '80%';
        farmer.style.top = '80%';
        farmer.style.transform = 'translate(-50%, -50%)';
        farmer.style.fontSize = '24px';
        farmer.style.zIndex = '10';
    }
    
    // Remove old rings if they exist
    el.querySelectorAll('.ring').forEach(n => n.remove());
    
    // Create new rings
    const strong = document.createElement('div'); strong.className = 'ring strong';
    const mid = document.createElement('div'); mid.className = 'ring mid';
    const weak = document.createElement('div'); weak.className = 'ring weak';
    el.appendChild(weak); el.appendChild(mid); el.appendChild(strong);
    
    // Size the rings
    weak.style.width = (radii.weak * 2) + 'px';
    weak.style.height = (radii.weak * 2) + 'px';
    weak.style.left = (30 - radii.weak) + 'px';
    weak.style.top = (30 - radii.weak) + 'px';
    
    mid.style.width = (radii.mid * 2) + 'px';
    mid.style.height = (radii.mid * 2) + 'px';
    mid.style.left = (30 - radii.mid) + 'px';
    mid.style.top = (30 - radii.mid) + 'px';
    
    strong.style.width = (radii.strong * 2) + 'px';
    strong.style.height = (radii.strong * 2) + 'px';
    strong.style.left = (30 - radii.strong) + 'px';
    strong.style.top = (30 - radii.strong) + 'px';
    
    // Handle golden router - don't replace innerHTML, just update the emoji
    if (r.golden) {
        const farmer = el.querySelector('.farmer');
        if (farmer) {
            farmer.className = 'wizard';
            farmer.textContent = '🧙‍♂️';
        }
        el.style.boxShadow = '0 0 24px rgba(255, 215, 0, 0.88)';
    } 
}

function spawnFox(type = 'normal') { // type: normal | speedy
    const x = Math.random() < .5 ? -60 : W() + 60;
    const y = rand(20, H() - 80);
    const el = makeEntity('fox', type === 'speedy' ? '🐺' : '🦊');
    el.style.left = x + 'px'; el.style.top = y + 'px';
    const obj = {
        el, x, y, type, hp: type === 'speedy' ? 2 : 3,
        speed: type === 'speedy' ? 2.2 : 1.4, stunUntil: 0
    };
    state.entities.foxes.push(obj);
    return obj;
}
function spawnSnake() {
    const x = rand(40, W() - 80), y = rand(40, H() - 80);
    const el = makeEntity('snake', '🐍'); el.style.left = x + 'px'; el.style.top = y + 'px';
    const s = { el, x, y }; state.entities.snakes.push(s); return s;
}

function spawnPowerup(type, x, y) {
    const el = makeEntity('power', type === 'shield' ? '🛡️' : type === 'ammo' ? '🥚' : type === 'speed' ? '⚡' : '✨');
    el.style.left = (x || rand(60, W() - 60)) + 'px'; el.style.top = (y || rand(60, H() - 60)) + 'px';
    const obj = { el, type, x: parseFloat(el.style.left), y: parseFloat(el.style.top), picked: false, created: now() };
    state.entities.powerups.push(obj);
    return obj;
}

function throwEgg(fromX, fromY, dirX, dirY) {
    if (state.weaponAmmo <= 0) { AudioEngine.beep(180, 0.06); return; }
    state.weaponAmmo--; updateHUD();
    const el = document.createElement('div'); el.className = 'egg'; el.style.left = fromX + 'px'; el.style.top = fromY + 'px';
    game.appendChild(el);

    // Force reflow before adding "pop"
    void el.offsetWidth;
    el.classList.add('pop');
    const p = { el, x: fromX, y: fromY, vx: dirX * 8, vy: dirY * 8, life: 2500, created: now() };
    el.classList.add('pop');
    state.entities.projectiles.push(p);
    AudioEngine.pop();
}

function bestWifiTierForChicken() {
    if (now() < state.events.wifiDownUntil) return null;
    const ch = state.entities.chicken; if (!ch) return null;
    const c = ch.el.getBoundingClientRect(),
        g = game.getBoundingClientRect();
    const center = {
        x: c.left - g.left + c.width / 2,
        y: c.top - g.top + c.height / 2
    };
    let best = null;
    for (const r of state.entities.routers) {
        const rc = { x: r.x, y: r.y };
        const d = Math.hypot(center.x - rc.x, center.y - rc.y);
        if (d <= r.radii.strong) {
            best = { tier: 'strong', r };
            break;
        }
        else if (d <= r.radii.mid) best = best &&
            best.tier === 'strong' ? best : { tier: 'mid', r };
        else if (d <= r.radii.weak)
            best = best || { tier: 'weak', r };
    }
    return best;
}
function attemptLayEgg() {
    if (!state.running || state.paused) return;

    const tier = bestWifiTierForChicken();
    if (!tier) return;
    let base = tier.tier === 'strong' ? 1000 : tier.tier === 'mid' ? 2000 : 5000;
    if (tier.r && tier.r.golden) base *= 0.4;
    if (now() < state.events.stormUntil) base *= 1.6;
    const elapsed = now() - state.lastEggTick;
    if (elapsed >= base) {
        state.lastEggTick = now();
        state.score++; state.eggsLaid++;
        updateHUD();
        const ch = state.entities.chicken.el;
        const px = parseFloat(ch.style.left) + 20;
        const py = parseFloat(ch.style.top) + 34;
        const egg = document.createElement('div');
        egg.className = 'egg'; egg.style.left = px + 'px';
        egg.style.top = py + 'px'; game.appendChild(egg);
        requestAnimationFrame(() => egg.classList.add('pop'));
        setTimeout(() => egg.remove(), 1600);
        AudioEngine.pop();
        if (!state.achievements.tenEggs && state.eggsLaid >= 10) {
            state.achievements.tenEggs = true;
            AudioEngine.chime();
            showToast('Achievement: 10 eggs laid! Hurrayyyyyy!!!');
        }
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') e.preventDefault();
    state.keys.add(e.key);
    if (e.key === 'Enter' && !state.running) startGame();
    if (e.key === ' ' && state.running) { // shooting
        const ch = state.entities.chicken;
        if (!ch) return;
        const cx = parseFloat(ch.el.style.left) + 28, cy = parseFloat(ch.el.style.top) + 28;
        let aimX = 0, aimY = 0;
        if (state.keys.has('ArrowLeft') || state.keys.has('a')) aimX = -1;
        if (state.keys.has('ArrowRight') || state.keys.has('d')) aimX = 1;
        if (state.keys.has('ArrowUp') || state.keys.has('w')) aimY = -1;
        if (state.keys.has('ArrowDown') || state.keys.has('s')) aimY = 1;
        if (aimX === 0 && aimY === 0 && state.entities.foxes.length) {
            const fox = state.entities.foxes[0];
            const fx = parseFloat(fox.el.style.left) + 26, fy = parseFloat(fox.el.style.top) + 26;
            const d = Math.hypot(fx - cx, fy - cy);
            aimX = (fx - cx) / d; aimY = (fy - cy) / d;
        }
        if (aimX === 0 && aimY === 0) { aimX = 1; aimY = 0; }
        const mag = Math.hypot(aimX, aimY) || 1; aimX /= mag; aimY /= mag;
        throwEgg(cx - 8, cy - 10, aimX, aimY);
    }
    if (e.key === 'Shift' && state.running && state.dashReady) doDash();
});
window.addEventListener('keyup', (e) => state.keys.delete(e.key));

function doDash() {
    if (!state.dashReady) return;
    state.dashReady = false;
    const ch = state.entities.chicken; if (!ch) return;
    AudioEngine.beep(880, 0.06, 'square', 0.08);
    const dx = (state.keys.has('ArrowRight') || state.keys.has('d')) ? 1 : (state.keys.has('ArrowLeft') || state.keys.has('a')) ? -1 : 0;
    const dy = (state.keys.has('ArrowDown') || state.keys.has('s')) ? 1 : (state.keys.has('ArrowUp') || state.keys.has('w')) ? -1 : 0;
    let dirx = dx, diry = dy;
    if (dirx === 0 && diry === 0) { dirx = 1; diry = 0; }
    const mag = Math.hypot(dirx, diry) || 1; dirx /= mag; diry /= mag;
    const startX = parseFloat(ch.el.style.left), startY = parseFloat(ch.el.style.top);
    const distance = 160;
    const targetX = clamp(startX + dirx * distance, 0, W() - 56), targetY = clamp(startY + diry * distance, 0, H() - 56);
    const duration = 240;
    const t0 = now();
    const step = () => {
        const t = (now() - t0) / duration;
        if (t >= 1) {
            ch.el.style.left = targetX + 'px'; ch.el.style.top = targetY + 'px';
            for (const fx of state.entities.foxes) {
                if (intersect(ch.el, fx.el)) { damageFox(fx, 999); createSplatAt(fx); }
            }
            setTimeout(() => state.dashReady = true, 2000);
        } else {
            const nx = startX + (targetX - startX) * easeOutQuad(t), ny = startY + (targetY - startY) * easeOutQuad(t);
            ch.el.style.left = nx + 'px'; ch.el.style.top = ny + 'px';
            requestAnimationFrame(step);
        }
    };
    requestAnimationFrame(step);
}
function easeOutQuad(t) { return t * (2 - t); }



function damageFox(fx, amount) {
    fx.hp -= amount;
    // small hurt sound
    AudioEngine.noiseBurst?.(0.06, 0.06);
    if (fx.hp <= 0) {
        // explosion fragments for fox
        explodeEntity(fx, 'fox', 20);
        // create larger splat/smoke
        createSplatAt(fx);
        // remove from DOM + state
        fx.el.remove();
        const idx = state.entities.foxes.indexOf(fx); if (idx >= 0) state.entities.foxes.splice(idx, 1);
        state.score += 8; updateHUD();
        if (!state.achievements.firstFox) { state.achievements.firstFox = true; showToast('Achievement: First fox down!'); AudioEngine.chime(); }
    } else {
        // hurt animation: quick tint & shake + splinter particles
        fx.stunUntil = now() + 800;
        fx.el.classList.add('hurt');
        fx.el.classList.add('flashAnim');
        setTimeout(() => { fx.el.classList.remove('flashAnim'); }, 300);
        setTimeout(() => { fx.el.classList.remove('hurt'); }, 220);
        // small fragments
        explodeEntity({ el: fx.el }, 'fox', 6);
        AudioEngine.splinter();
    }
}

function createSplatAt(entity) {
    const r = rect(entity.el), g = game.getBoundingClientRect();
    const x = r.left - g.left + r.width / 2 - 14, y = r.top - g.top + r.height - 8;
    makeParticle('', x, y);
}

function updateProjectiles(dt) {
    if (!state.running || state.paused) return;

    for (let i = state.entities.projectiles.length - 1; i >= 0; i--) {
        const p = state.entities.projectiles[i];
        p.x += p.vx; p.y += p.vy; p.life -= dt;
        p.el.style.left = p.x + 'px'; p.el.style.top = p.y + 'px';
        for (let j = state.entities.foxes.length - 1; j >= 0; j--) {
            const fx = state.entities.foxes[j];
            if (intersect(p.el, fx.el)) {
                damageFox(fx, 1);
                p.el.remove(); state.entities.projectiles.splice(i, 1); AudioEngine.pop(); return;
            }
        }
        if (p.life <= 0 || p.x < -40 || p.y < -40 || p.x > W() + 40 || p.y > H() + 40) { p.el.remove(); state.entities.projectiles.splice(i, 1); }
    }
}

function updateFoxes(dt) {
    if (!state.running || state.paused) return;

    const ch = state.entities.chicken;

    if (!ch) return;
    const cx = parseFloat(ch.el.style.left);
    const cy = parseFloat(ch.el.style.top);
    for (let i = state.entities.foxes.length - 1; i >= 0; i--) {
        const fx = state.entities.foxes[i];
        if (now() < fx.stunUntil) continue;
        const fxX = parseFloat(fx.el.style.left);
        const fxY = parseFloat(fx.el.style.top);

        let dx = cx - fxX;
        let dy = cy - fxY;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;

        let speed = fx.speed * (now() < state.events.stormUntil ? 0.6 : 1);
        fx.el.style.left = clamp(fxX + dx * speed, -60, W() + 60) + 'px';
        fx.el.style.top = clamp(fxY + dy * speed, -60, H() + 60) + 'px';
        if (intersect(fx.el, ch.el) && now() > ch.wontDamageUntil) {
            if (now() < state.shieldUntil) {
                fx.stunUntil = now() + 600;
                AudioEngine.beep();
                fx.el.style.transform = 'scale(.9)';
                setTimeout(() => fx.el.style.transform = '', 120);
            } else {
                // damage chicken -> show red flash + shake + small fragments
                state.entities.chicken.hp -= 1;
                ch.el.style.transform = 'translateY(-6px)';
                setTimeout(() => ch.el.style.transform = '', 120);
                ch.wontDamageUntil = now() + 1200;
                flashDamageOverlay();
                AudioEngine.hurt();
                // small chicken fragments/particles
                if (state.entities.chicken.hp <= 0) {
                    // chicken death explosion & game over
                    ch.el.remove();
                    state.entities.chicken = null;
                    gameOver();
                }
            }
        }
    }
}

function rect(el) { return el.getBoundingClientRect(); }
function intersect(a, b) {
    const A = rect(a);
    const B = rect(b);
    return !(A.right < B.left || A.left > B.right || A.bottom < B.top || A.top > B.bottom);
}

function spawnRoutine() {
    if (!state.timers.routerSpawn) state.timers.routerSpawn = setInterval(() => {
        if (!state.running || state.paused) return;
        if (state.entities.routers.length < 2 && now() > state.events.wifiDownUntil) {
            const r = createRouter(rand(80, W() - 80), rand(80, H() - 80), { radii: { strong: 60 + state.level * 2, mid: 120 + state.level * 4, weak: 180 + state.level * 7 }, golden: false });
            setTimeout(() => { const i = state.entities.routers.indexOf(r); if (i >= 0) { r.el.remove(); state.entities.routers.splice(i, 1); } }, 20000 + state.level * 4000);
        }
    }, 4200);

    if (!state.timers.foxSpawn) state.timers.foxSpawn = setInterval(() => {
        if (!state.running || state.paused) return;
        const count = Math.min(1 + Math.floor(state.level / 2), 5);
        if (state.entities.foxes.length < count) {
            spawnFox(Math.random() < 0.22 ? 'speedy' : 'normal');
        }
    }, Math.max(2000, 6000 - state.level * 250));

    if (!state.timers.snakeSpawn) state.timers.snakeSpawn = setInterval(() => {
        if (!state.running || state.paused) return;
        if (state.entities.snakes.length < Math.min(3, state.level)) spawnSnake();
    }, 12000);

    if (!state.timers.powerSpawn) state.timers.powerSpawn = setInterval(() => {
        if (!state.running || state.paused) return;
        if (Math.random() < 0.55) spawnPowerup(choose(['ammo', 'shield', 'speed']), rand(60, W() - 80), rand(60, H() - 80));
    }, 9000);

    if (!state.timers.eventLoop) state.timers.eventLoop = setInterval(() => {
        const r = Math.random();
        if (r < 0.18) {
            state.events.wifiDownUntil = now() + 5000;
            AudioEngine.beep(180, 0.08, 'sine', 0.06);
            showToast('Farmer is gone!');
            setTimeout(() => { showToast('Farmer is back!'); AudioEngine.chime(); }, 5000);
        } else if (r < 0.28) {
            const rr = createRouter(rand(120, W() - 120), rand(120, H() - 120), { radii: { strong: 90, mid: 170, weak: 260 }, golden: true });
            showToast('✨ Wizard is here! Hurrayyy!');
            state.events.goldenUntil = now() + 12000;
            setTimeout(() => { const i = state.entities.routers.indexOf(rr); if (i >= 0) { rr.el.remove(); state.entities.routers.splice(i, 1); } }, 12000);
        } else if (r < 0.36) {
            state.events.stormUntil = now() + 6000; showToast('⛈ Storm: movement slowed'); AudioEngine.noiseBurst(0.08);
        }
    }, 18000);
}

const hud = document.createElement('div'); hud.className = 'topHUD';
const statScore = document.createElement('div'); statScore.className = 'stat'; statScore.innerHTML = '<div class="label">Score</div><div class="value" id="hud_score">0</div>';
const statEgg = document.createElement('div'); statEgg.className = 'stat'; statEgg.innerHTML = '<div class="label">Eggs</div><div class="value" id="hud_eggs">0</div>';
const statAmmo = document.createElement('div'); statAmmo.className = 'stat'; statAmmo.innerHTML = '<div class="label">Ammo</div><div class="value" id="hud_ammo">0</div>';
const statHP = document.createElement('div'); statHP.className = 'stat'; statHP.innerHTML = '<div class="label">Health</div><div class="value" id="hud_hp">0</div>';
hud.appendChild(statScore); hud.appendChild(statEgg); hud.appendChild(statAmmo); hud.appendChild(statHP);
game.appendChild(hud);
const rightHUD = document.createElement('div'); rightHUD.className = 'rightHUD';
const statLevel = document.createElement('div'); statLevel.className = 'stat'; statLevel.innerHTML = '<div class="label">Level</div><div class="value" id="hud_level">1</div>';
const statHigh = document.createElement('div'); statHigh.className = 'stat'; statHigh.innerHTML = '<div class="label">High</div><div class="value" id="hud_high">0</div>';
rightHUD.appendChild(statLevel); rightHUD.appendChild(statHigh);
game.appendChild(rightHUD);

function updateHUD() {
    document.getElementById('hud_score').textContent = state.score;
    document.getElementById('hud_eggs').textContent = state.eggsLaid;
    document.getElementById('hud_ammo').textContent = state.weaponAmmo + ' / ' + state.maxAmmo;
    document.getElementById('hud_hp').textContent = state.entities.chicken ? state.entities.chicken.hp : 0;
    document.getElementById('hud_level').textContent = state.level;
    document.getElementById('hud_high').textContent = state.highscore;
}



function gameOver() {
    state.running = false; AudioEngine.gameOver();
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.innerHTML = `<div class="panel">
    <h1>Game Over</h1>
    <div style="margin:10px 0;font-size:16px">Score: <strong>${state.score}</strong></div>
    <div style="margin-bottom:8px">Highscore: <strong>${Math.max(state.score, state.highscore)}</strong></div>
    <div style="display:flex;gap:8px;justify-content:center">
      <button id="g_restart" class="start">Restart</button>
      <button id="g_menu" class="start">Main Menu</button>
    </div>
  </div>`;
    game.appendChild(ov);
    if (state.score > state.highscore) { state.highscore = state.score; localStorage.setItem('cvw_high', state.highscore); }
    updateHUD();
    document.getElementById('g_restart').addEventListener('click', () => { ov.remove(); restartGame(); });
    document.getElementById('g_menu').addEventListener('click', () => { location.reload(); });
}


function restartGame() {
    clearAll(); startGame();
}
function clearAll() {
    for (const k of ['routers', 'foxes', 'snakes', 'projectiles', 'powerups']) {
        state.entities[k].forEach(o => o.el.remove());
        state.entities[k] = [];
    }
    if (state.entities.chicken) { state.entities.chicken.el.remove(); state.entities.chicken = null; }
    for (const t in state.timers) { clearInterval(state.timers[t]); state.timers[t] = null; }
    state.events = { wifiDownUntil: 0, stormUntil: 0, goldenUntil: 0 };
    document.querySelectorAll('.egg').forEach(n => { if (n.parentElement === game) n.remove(); });
    updateHUD();
}

document.getElementById('btnPause').addEventListener('click', () => {
    if (!state.running || state.paused) return;
    state.paused = !state.paused;
    document.getElementById('btnPause').textContent = state.paused ? 'Resume' : 'Pause';
    if (!state.paused) loopId = requestAnimationFrame(loop);
});

document.getElementById('btnRestart').addEventListener('click', () => {
    restartGame();
});



function updateLevelProgress() {
    const elapsed = Math.floor((now() - state.levelStart) / 1000);
    if (elapsed > 20 && state.level === 1) { state.level = 2; showToast('Level up!'); AudioEngine.chime(); }
    if (elapsed > 50 && state.level === 2) { state.level = 3; showToast('Level up!'); AudioEngine.chime(); }
    if (!state.achievements.survive60 && elapsed >= 60) { state.achievements.survive60 = true; showToast('Achievement: Survived 60s'); AudioEngine.chime(); }
}

let lastFrame = now(), loopId = null;
function loop() {
    if (!state.running || state.paused) return;
    const t = now(), dt = t - lastFrame; lastFrame = t;
    movePlayer(dt);
    attemptLayEgg();
    updateProjectiles(dt);
    updateFoxes(dt);
    updatePowerups();
    updateLevelProgress();
    updateHUD();
    loopId = requestAnimationFrame(loop);
}

function movePlayer(dt) {
    const ch = state.entities.chicken; if (!ch) return;
    let vx = 0, vy = 0, baseSpeed = 2.4;
    if (now() < state.events.stormUntil) baseSpeed *= 0.7;
    if (state.keys.has('ArrowLeft') || state.keys.has('a')) vx -= 1;
    if (state.keys.has('ArrowRight') || state.keys.has('d')) vx += 1;
    if (state.keys.has('ArrowUp') || state.keys.has('w')) vy -= 1;
    if (state.keys.has('ArrowDown') || state.keys.has('s')) vy += 1;
    const mag = Math.hypot(vx, vy) || 1;
    if (state.events.speedUntil && now() < state.events.speedUntil) baseSpeed *= 1.6;
    const nx = clamp(parseFloat(ch.el.style.left) + (vx / mag) * baseSpeed * (dt / 16), 0, W() - 56);
    const ny = clamp(parseFloat(ch.el.style.top) + (vy / mag) * baseSpeed * (dt / 16), 0, H() - 56);
    ch.el.style.left = nx + 'px'; ch.el.style.top = ny + 'px';
    ch.el.style.transform = `translateZ(0) rotate(${(vx / mag) * 6}deg)`;
}

function updatePowerups() {
    const ch = state.entities.chicken; if (!ch) return;
    for (let i = state.entities.powerups.length - 1; i >= 0; i--) {
        const p = state.entities.powerups[i];
        if (intersect(ch.el, p.el)) {
            if (p.type === 'ammo') { state.weaponAmmo = Math.min(state.maxAmmo, state.weaponAmmo + 4); AudioEngine.chime(); showToast('Picked ammo'); }
            else if (p.type === 'shield') { state.shieldUntil = now() + 6000; AudioEngine.chime(); showToast('Shield!'); }
            else if (p.type === 'speed') { state.events.speedUntil = now() + 5000; AudioEngine.chime(); showToast('Speed boost!'); }
            p.el.remove(); state.entities.powerups.splice(i, 1);
        } else {
            if (now() - p.created > 10000) { p.el.remove(); state.entities.powerups.splice(i, 1); }
        }
    }
    for (const r of state.entities.routers) {
        r.el.style.opacity = now() < state.events.wifiDownUntil ? 0.28 : 1;
    }
    for (let i = state.entities.snakes.length - 1; i >= 0; i--) {
        const s = state.entities.snakes[i];
        if (intersect(s.el, state.entities.chicken.el) && now() > state.entities.chicken.wontDamageUntil) {
            state.entities.chicken.hp -= 1; state.entities.chicken.wontDamageUntil = now() + 1000; AudioEngine.hurt(); screenShake();
            flashDamageOverlay();
            if (state.entities.chicken.hp <= 0) gameOver();
        }
    }
}

function screenShake(intensity = 8, duration = 360) {
    game.classList.add('shake');
    setTimeout(() => game.classList.remove('shake'), duration);
}

function flashDamageOverlay() {
    damageFlash.style.background = 'rgba(125, 115, 115, 0.88)';

    game.classList.add('shake');
    AudioEngine.noiseBurst(0.06, 0.06);

    setTimeout(() => {
        damageFlash.style.background = 'rgba(255,0,0,0.0)';
        game.classList.remove('shake');
    }, 200);
}

function initialPopulate() {
    createRouter(rand(120, W() - 120), rand(120, H() - 120), { radii: { strong: 60, mid: 120, weak: 180 } });
    spawnSnake();
    spawnPowerup('ammo', rand(100, W() - 100), rand(100, H() - 100));
}

window.addEventListener('resize', () => { /* keep bounds */ });
initialPopulate();

function showIntroDialog() { }
updateHUD();
game.addEventListener('click', () => game.focus());
