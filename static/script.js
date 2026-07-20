// ===== DOM READY GUARD =====
function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
}

ready(function() {

// ===== PARTICLE SYSTEM =====
const pCanvas = document.createElement('canvas');
pCanvas.id = 'particle-canvas';
document.body.prepend(pCanvas);
const pCtx = pCanvas.getContext('2d');
let pW, pH, particles = [];

function resizeParticles() {
    pW = pCanvas.width = window.innerWidth;
    pH = pCanvas.height = window.innerHeight;
}
resizeParticles();
window.onresize = resizeParticles;

class Particle {
    constructor() { this.reset(); }
    reset() {
        this.x = Math.random() * pW;
        this.y = Math.random() * pH;
        this.size = Math.random() * 2.5 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.6;
        this.speedY = (Math.random() - 0.5) * 0.6;
        this.opacity = Math.random() * 0.6 + 0.1;
        this.hue = Math.random() > 0.6 ? 150 : (Math.random() > 0.5 ? 190 : 120);
        this.pulse = Math.random() * Math.PI * 2;
        this.pulseSpeed = 0.01 + Math.random() * 0.02;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.pulse += this.pulseSpeed;
        if (this.x < 0 || this.x > pW || this.y < 0 || this.y > pH) this.reset();
        if (this.x < 0) this.x = pW;
        if (this.x > pW) this.x = 0;
        if (this.y < 0) this.y = pH;
        if (this.y > pH) this.y = 0;
    }
    draw() {
        const alpha = this.opacity * (0.7 + 0.3 * Math.sin(this.pulse));
        pCtx.beginPath();
        pCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        pCtx.fillStyle = `hsla(${this.hue}, 80%, 55%, ${alpha})`;
        pCtx.fill();
        pCtx.shadowBlur = this.size * 4;
        pCtx.shadowColor = `hsla(${this.hue}, 80%, 55%, ${alpha * 0.3})`;
    }
}

const particleCount = Math.min(Math.floor(pW * pH / 12000), 120);
for (let i = 0; i < particleCount; i++) particles.push(new Particle());

function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 120) {
                const alpha = (1 - dist / 120) * 0.15;
                pCtx.beginPath();
                pCtx.moveTo(particles[i].x, particles[i].y);
                pCtx.lineTo(particles[j].x, particles[j].y);
                pCtx.strokeStyle = `rgba(0, 255, 157, ${alpha})`;
                pCtx.lineWidth = 0.5;
                pCtx.stroke();
            }
        }
    }
}

function animateParticles() {
    pCtx.clearRect(0, 0, pW, pH);
    pCtx.shadowBlur = 0;
    for (const p of particles) { p.update(); p.draw(); }
    drawConnections();
    requestAnimationFrame(animateParticles);
}
animateParticles();

// ===== WEBPACKET =====
let cachedReports = [];

const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
});

socket.on('connect', () => {
    console.log('[WS] Connected');
});

socket.on('stats_update', d => {
    if (!d) return;
    if (d.scam_numbers_reported !== undefined) animateNumber('stat-reports', d.scam_numbers_reported);
    if (d.total_checks !== undefined) animateNumber('stat-checks', d.total_checks);
    if (d.server_time) {
        const el = document.getElementById('stat-time');
        if (el) el.textContent = d.server_time.includes(' ') ? d.server_time.split(' ')[1] : d.server_time;
    }
    if (d.recent_reports) {
        cachedReports = d.recent_reports;
        const feedEl = document.getElementById('feed');
        if (feedEl && feedEl.classList.contains('active')) {
            renderFeed(cachedReports);
        }
    }
    updateLiveBar(d.server_time);
});

socket.on('new_report', d => {
    showNotification(d.category, d.number || d.username || 'Unknown');
    playAlert();
});

socket.on('connect_error', err => {
    console.log('[WS] Connection error:', err.message);
});

// ===== ANIMATED NUMBER COUNTER =====
function animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = parseInt(el.textContent.replace(/,/g,'')) || 0;
    if (current === target) return;
    const steps = 20;
    const increment = (target - current) / steps;
    let step = 0;
    const timer = setInterval(() => {
        step++;
        if (step >= steps) {
            el.textContent = target;
            clearInterval(timer);
        } else {
            el.textContent = Math.round(current + increment * step);
        }
    }, 30);
}

// ===== LIVE CLOCK =====
function updateLiveBar(t) {
    const el = document.getElementById('live-time');
    if (el && t) el.textContent = typeof t === 'string' && t.includes(':') ? (t.includes(' ') ? t.split(' ')[1] : t) : t;
}
setInterval(() => {
    const el = document.getElementById('live-time');
    if (el) el.textContent = new Date().toLocaleTimeString('id-ID');
}, 1000);

// ===== NOTIFICATION =====
function showNotification(category, number) {
    const container = document.getElementById('notif-container') || (() => {
        const c = document.createElement('div');
        c.id = 'notif-container';
        document.body.appendChild(c);
        return c;
    })();
    const n = document.createElement('div');
    n.className = 'notif-item';
    const time = new Date().toLocaleTimeString('id-ID');
    n.innerHTML = `
        <div class="notif-title">⚠️ LAPORAN BARU</div>
        <div class="notif-cat">${category || 'Unknown'}</div>
        <div class="notif-val">${number || '—'}</div>
        <div class="notif-time">${time}</div>
    `;
    container.appendChild(n);
    setTimeout(() => {
        n.style.opacity = '0';
        n.style.transform = 'translateX(100px)';
        n.style.transition = 'all 0.5s ease';
        setTimeout(() => n.remove(), 500);
    }, 6000);
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⚠️ Laporan Baru: ' + category, { body: number });
    }
}
if ('Notification' in window) Notification.requestPermission();

// ===== SOUND ALERT =====
function playAlert() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        [880, 1100].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.12 + 0.1);
            osc.start(audioCtx.currentTime + i * 0.12);
            osc.stop(audioCtx.currentTime + i * 0.12 + 0.1);
        });
    } catch(e) {}
}

// ===== TABS =====
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
    this.classList.add('active');
    const targetId = this.dataset.tab;
    const target = document.getElementById(targetId);
    if (target) {
        target.classList.add('active');
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (targetId === 'feed') loadFeed();
}));

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tabs = ['phone','username','ip','whois','email','report','feed','edu'];
    const idx = '12345678'.indexOf(e.key);
    if (idx >= 0 && idx < tabs.length) {
        e.preventDefault();
        const tab = document.querySelector(`.tab[data-tab="${tabs[idx]}"]`);
        if (tab) tab.click();
    }
});

// ===== FEED =====
function renderFeed(reports) {
    const box = document.getElementById('feed-list');
    if (!box) return;
    if (!reports || !Array.isArray(reports) || reports.length === 0) {
        box.innerHTML = '<div class="result-box" style="text-align:center;color:var(--text-dim);">Belum ada laporan. <span style="display:block;margin-top:0.5rem;font-size:0.8rem;">Laporan akan muncul real-time via WebSocket.</span></div>';
        return;
    }
    try {
        let h = '<div class="result-box success"><div style="max-height:400px;overflow-y:auto;">';
        reports.forEach(function(r) {
            const cls = r.category === 'Pelecehan Seksual' ? 'tag danger' : 'tag safe';
            const num = r.number || '—';
            const time = r.created_at ? r.created_at.slice(0, 19) : '';
            h += '<div class="result-item"><span class="label"><span class="' + cls + '">' + (r.category || 'Unknown') + '</span> ' + num + '</span><span class="value" style="font-size:0.75rem;color:var(--text-dim);">' + time + '</span></div>';
        });
        h += '</div></div>';
        box.innerHTML = h;
    } catch(e) {
        box.innerHTML = '<div class="result-box error">Gagal render feed.</div>';
    }
}

// ===== CACHED LOAD FEED =====
// Uses cached data first, then fetches fresh from API
async function loadFeed() {
    const box = document.getElementById('feed-list');
    if (!box) return;

    // If we have cached data, show it immediately
    if (cachedReports && Array.isArray(cachedReports) && cachedReports.length > 0) {
        renderFeed(cachedReports);
        return;
    }

    // Show loading state
    box.innerHTML = '<div class="result-box" style="text-align:center;"><div class="spinner" style="margin:0.5rem auto;"></div><span style="color:var(--text-dim);font-size:0.85rem;">Memuat feed...</span></div>';

    try {
        const resp = await fetch('/api/stats');
        if (!resp.ok) {
            box.innerHTML = '<div class="result-box error">Gagal memuat feed (HTTP ' + resp.status + ').</div>';
            return;
        }
        const d = await resp.json();
        if (d && d.recent_reports) {
            cachedReports = d.recent_reports;
            renderFeed(cachedReports);
        } else {
            box.innerHTML = '<div class="result-box" style="text-align:center;color:var(--text-dim);">Belum ada laporan.</div>';
        }
    } catch(e) {
        console.warn('[Feed] Error loading:', e);
        // If we already showed cached data, don't overwrite with error
        if (!cachedReports || cachedReports.length === 0) {
            box.innerHTML = '<div class="result-box error">Gagal memuat feed. <span style="display:block;font-size:0.75rem;margin-top:0.3rem;color:var(--text-dim);">Periksa koneksi internet. <button onclick="loadFeed()" style="background:var(--primary-dim);color:var(--primary);border:1px solid rgba(0,255,157,0.2);padding:0.2rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.75rem;">Coba Lagi</button></span></div>';
        }
    }
}

// ===== API FUNCTIONS =====
function showLoading(boxId, msg) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.className = 'result-box loading';
    box.innerHTML = '<span>' + msg + '</span>';
    box.style.display = 'block';
}
function showResult(boxId, html, type) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.className = 'result-box ' + (type || 'success');
    box.innerHTML = html;
    box.style.display = 'block';
}
function showError(boxId, msg) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.className = 'result-box error';
    box.textContent = msg;
    box.style.display = 'block';
}
function item(l, v) {
    return '<div class="result-item"><span class="label">' + l + '</span><span class="value">' + (v || '-') + '</span></div>';
}
function warn(text) {
    return '<div class="warn-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger);margin-right:0.5rem;"></i><strong style="color:var(--danger)">' + text + '</strong></div>';
}
function ok(text) {
    return '<div class="ok-box"><i class="fas fa-check-circle" style="color:var(--primary);margin-right:0.5rem;"></i><strong style="color:var(--primary)">' + text + '</strong></div>';
}

async function checkPhone() {
    const v = document.getElementById('phone-input').value.trim();
    if (!v) { showError('phone-result', 'Masukkan nomor telepon!'); return; }
    showLoading('phone-result', 'Menganalisis nomor...');
    try {
        const resp = await fetch('/api/phone', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({number:v}) });
        const d = await resp.json();
        if (d.error) { showError('phone-result', d.error); return; }
        const w = d.scam_reported ? warn('⚠️ Nomor ini pernah dilaporkan! (' + d.scam_reports_count + 'x laporan)') : ok('✅ Nomor bersih — belum ada laporan.');
        showResult('phone-result',
            item('Internasional', d.international) + item('Nasional', d.national) +
            item('Provider', d.provider) + item('Wilayah', d.region) +
            item('Tipe', d.type) + item('Zona Waktu', d.timezone) +
            item('Status', d.valid ? '<span class="tag safe">VALID</span>' : '<span class="tag danger">INVALID</span>') + w);
    } catch(e) { showError('phone-result', 'Gagal: ' + e.message); }
}

async function checkUsername() {
    const v = document.getElementById('username-input').value.trim();
    if (!v) { showError('username-result', 'Masukkan username!'); return; }
    showLoading('username-result', 'Melacak username di 10 platform...');
    try {
        const resp = await fetch('/api/username', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:v}) });
        const d = await resp.json();
        if (d.error) { showError('username-result', d.error); return; }
        let h = '';
        d.forEach(function(r) {
            const cls = r.status === 'FOUND' ? 'tag danger' : 'tag safe';
            h += item('<a href="' + r.url + '" target="_blank" style="color:var(--primary);">' + r.site + '</a>', '<span class="' + cls + '">' + r.status + '</span>');
        });
        const found = d.filter(function(r){return r.status==='FOUND'}).length;
        showResult('username-result', h + (found > 0 ? warn('Ditemukan di ' + found + ' platform!') : ok('Tidak ditemukan di platform utama.')));
    } catch(e) { showError('username-result', 'Gagal: ' + e.message); }
}

async function checkIp() {
    const v = document.getElementById('ip-input').value.trim();
    if (!v) { showError('ip-result', 'Masukkan IP/domain!'); return; }
    showLoading('ip-result', 'Lookup...');
    try {
        const resp = await fetch('/api/ip', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({target:v}) });
        const d = await resp.json();
        if (d.error) { showError('ip-result', d.error); return; }
        showResult('ip-result', item('IP', d.ip) + item('Hostname', d.hostname));
    } catch(e) { showError('ip-result', 'Gagal: ' + e.message); }
}

async function checkWhois() {
    const v = document.getElementById('whois-input').value.trim();
    if (!v) { showError('whois-result', 'Masukkan domain!'); return; }
    showLoading('whois-result', 'WHOIS lookup...');
    try {
        const resp = await fetch('/api/whois', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({domain:v}) });
        const d = await resp.json();
        if (d.error) { showError('whois-result', d.error); return; }
        showResult('whois-result',
            item('Domain', d.domain) + item('Registrar', d.registrar) + item('Dibuat', d.creation_date) +
            item('Kadaluarsa', d.expiration_date) + item('Org', d.org) + item('Negara', d.country) +
            item('NS', Array.isArray(d.name_servers) ? d.name_servers.join(', ') : d.name_servers));
    } catch(e) { showError('whois-result', 'Gagal: ' + e.message); }
}

async function checkEmail() {
    const v = document.getElementById('email-input').value.trim();
    if (!v) { showError('email-result', 'Masukkan email!'); return; }
    showLoading('email-result', 'OSINT scanning (holehe)...');
    try {
        const resp = await fetch('/api/email', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:v}) });
        const d = await resp.json();
        if (d.error) { showError('email-result', d.error); return; }
        let h = item('Email', d.email) + item('Akun Ditemukan', d.total);
        if (d.accounts_found && d.accounts_found.length) {
            h += '<div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.3rem;">' +
                d.accounts_found.map(function(a){return '<span class="tag info">'+a+'</span>'}).join(' ') + '</div>';
        }
        showResult('email-result', h);
    } catch(e) { showError('email-result', 'Gagal: ' + e.message); }
}

async function reportScam() {
    const num = document.getElementById('r-number').value.trim();
    const uname = document.getElementById('r-username').value.trim();
    const dom = document.getElementById('r-domain').value.trim();
    const cat = document.getElementById('r-category').value;
    const desc = document.getElementById('r-desc').value.trim();
    if (!num && !uname && !dom) { showError('report-result', 'Isi minimal satu field!'); return; }
    showLoading('report-result', 'Mengirim & broadcast real-time...');
    try {
        const resp = await fetch('/api/report-scam', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({number:num, username:uname, domain:dom, category:cat, description:desc}) });
        const d = await resp.json();
        showResult('report-result',
            '<i class="fas fa-check-circle" style="color:var(--primary);font-size:1.2rem;margin-right:0.5rem;"></i> ' + d.message +
            '<br><span style="color:var(--text-dim);font-size:0.85rem;">📊 Total: ' + d.total_reports + ' laporan</span>' +
            '<br><span style="color:var(--text-muted);font-size:0.75rem;">✅ Broadcast real-time ke semua pengguna</span>');
        document.getElementById('r-number').value = '';
        document.getElementById('r-username').value = '';
        document.getElementById('r-domain').value = '';
        document.getElementById('r-desc').value = '';
    } catch(e) { showError('report-result', 'Gagal: ' + e.message); }
}

// ===== ENTER KEY SUPPORT =====
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return;
    const tab = activeTab.dataset.tab;
    if (tab === 'phone') checkPhone();
    else if (tab === 'username') checkUsername();
    else if (tab === 'ip') checkIp();
    else if (tab === 'whois') checkWhois();
    else if (tab === 'email') checkEmail();
});

}); // end ready()
