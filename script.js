// ==============================================================
// 1. CẤU HÌNH FIREBASE (HÃY THAY BẰNG THÔNG TIN CỦA BẠN)
// ==============================================================
const firebaseConfig = {
    apiKey: "AIzaSy_YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.firebaseio.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123:web:abc"
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==============================================================
// 2. BIẾN TOÀN CỤC & BẢO MẬT
// ==============================================================
const HASHED_PIN = btoa("8989"); // Tương đương chuỗi "ODk4OQ=="
const TV_ROOM_ID = "1111"; 

let player;
let isTVMode = false;
let currentPlaylist = [];
let tvSyncInterval;

// DOM Cache
const el = {
    startScreen: document.getElementById('start-screen'),
    tvView: document.getElementById('tv-view'),
    remoteView: document.getElementById('remote-view'),
    pinModal: document.getElementById('pin-modal'),
    spinner: document.getElementById('loading-spinner')
};

// Hàm chống XSS khi render nội dung
function sanitizeText(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span.innerHTML;
}

// ==============================================================
// 3. ĐIỀU HƯỚNG MÀN HÌNH CHÍNH
// ==============================================================
document.getElementById('btn-mode-tv').addEventListener('click', () => {
    isTVMode = true;
    el.startScreen.classList.add('hidden');
    el.tvView.classList.remove('hidden');
    initTVMode();
});

document.getElementById('btn-mode-admin').addEventListener('click', () => {
    el.pinModal.classList.remove('hidden');
});

document.getElementById('btn-submit-pin').addEventListener('click', () => {
    const input = document.getElementById('pin-input').value;
    if (btoa(input) === HASHED_PIN) {
        el.pinModal.classList.add('hidden');
        el.startScreen.classList.add('hidden');
        el.remoteView.classList.remove('hidden');
        initAdminMode();
    } else {
        alert("Sai mã PIN!");
        document.getElementById('pin-input').value = "";
    }
});
document.getElementById('btn-cancel-pin').addEventListener('click', () => el.pinModal.classList.add('hidden'));

// ==============================================================
// 4. LOGIC CHẾ ĐỘ TV (KIDS VIEW)
// ==============================================================
function initTVMode() {
    loadYouTubeAPI();
    
    // Đồng bộ Playlist từ Firebase
    db.ref(`rooms/${TV_ROOM_ID}/playlist`).on('value', (snapshot) => {
        const data = snapshot.val();
        currentPlaylist = data ? Object.values(data) : [];
        renderKidsPlaylist(document.getElementById('kids-search').value);
        
        // Auto play video đầu tiên nếu chưa play
        if(currentPlaylist.length > 0 && (!player || player.getPlayerState() === YT.PlayerState.UNSTARTED)) {
            if(player && player.loadVideoById) player.loadVideoById(currentPlaylist[0].id);
        }
    });

    // Lắng nghe lệnh điều khiển từ Mobile Remote
    db.ref(`rooms/${TV_ROOM_ID}/command`).on('value', (snapshot) => {
        const cmd = snapshot.val();
        if(!cmd || !player) return;

        switch(cmd.action) {
            case 'play': player.playVideo(); break;
            case 'pause': player.pauseVideo(); break;
            case 'next': playIndex(cmd.payload || 0); break;
            case 'prev': playIndex(cmd.payload || 0); break;
            case 'volume': player.setVolume(cmd.payload); break;
        }
    });

    // Cài đặt Keyboard Control cho TV
    document.addEventListener('keydown', (e) => {
        if(!isTVMode || !player) return;
        const vol = player.getVolume();
        switch(e.key) {
            case ' ': player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo(); break;
            case 'ArrowRight': playNextAuto(); break;
            case 'ArrowLeft': playPrevAuto(); break;
            case 'ArrowUp': player.setVolume(Math.min(100, vol + 10)); break;
            case 'ArrowDown': player.setVolume(Math.max(0, vol - 10)); break;
        }
    });

    // Event Nút Fullscreen TV
    document.getElementById('btn-custom-fullscreen').addEventListener('click', () => {
        if (!document.fullscreenElement) el.tvView.requestFullscreen?.() || el.tvView.webkitRequestFullscreen?.();
        else document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    });

    // Event tua thanh Progress
    document.getElementById('tv-progress-container').addEventListener('click', (e) => {
        if(!player) return;
        const rect = e.target.getBoundingClientRect();
        player.seekTo((e.clientX - rect.left) / rect.width * player.getDuration(), true);
    });
}

function loadYouTubeAPI() {
    window.onYouTubeIframeAPIReady = window.onYouTubeIframeAPIReady || function() { createPlayer(); };
    if (window.YT && window.YT.Player) { createPlayer(); return; }
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
}

function createPlayer() {
    player = new YT.Player('ytplayer', {
        playerVars: { 'autoplay': 1, 'controls': 0, 'rel': 0, 'modestbranding': 1, 'disablekb': 1, 'playsinline': 1 },
        events: {
            'onReady': (e) => {
                if(currentPlaylist.length > 0) e.target.loadVideoById(currentPlaylist[0].id);
                tvSyncInterval = setInterval(syncStateToFirebase, 1000); // 1s sync 1 lần
            },
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerStateChange(e) {
    if (e.data === YT.PlayerState.BUFFERING) el.spinner.classList.remove('hidden');
    else el.spinner.classList.add('hidden');

    if (e.data === YT.PlayerState.ENDED) playNextAuto();
}

function playIndex(index) {
    if (index >= 0 && index < currentPlaylist.length && player) {
        player.loadVideoById(currentPlaylist[index].id);
    }
}

function playNextAuto() {
    if(currentPlaylist.length === 0) return;
    const currentUrl = player.getVideoUrl();
    const videoId = currentUrl.split('v=')[1]?.substring(0, 11);
    const currIdx = currentPlaylist.findIndex(v => v.id === videoId);
    playIndex((currIdx + 1) % currentPlaylist.length);
}

function playPrevAuto() {
    if(currentPlaylist.length === 0) return;
    const currentUrl = player.getVideoUrl();
    const videoId = currentUrl.split('v=')[1]?.substring(0, 11);
    const currIdx = currentPlaylist.findIndex(v => v.id === videoId);
    playIndex((currIdx - 1 + currentPlaylist.length) % currentPlaylist.length);
}

function formatTime(sec) {
    let m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Báo cáo trạng thái Video lên Firebase (Dành cho Mobile đọc)
function syncStateToFirebase() {
    if(player && player.getPlayerState) {
        const state = player.getPlayerState();
        const curr = player.getCurrentTime() || 0;
        const dur = player.getDuration() || 0;
        
        // Render TV UI
        document.getElementById('tv-progress-bar').style.width = dur > 0 ? (curr/dur*100) + '%' : '0%';
        document.getElementById('tv-time-display').innerText = `${formatTime(curr)} / ${formatTime(dur)}`;

        // Sync Firebase
        if(state === YT.PlayerState.PLAYING || state === YT.PlayerState.PAUSED) {
            const currentUrl = player.getVideoUrl();
            const videoId = currentUrl.split('v=')[1]?.substring(0, 11);
            const activeVid = currentPlaylist.find(v => v.id === videoId);

            db.ref(`rooms/${TV_ROOM_ID}/state`).set({
                isPlaying: state === YT.PlayerState.PLAYING,
                currentTime: curr,
                duration: dur,
                nowPlayingTitle: activeVid ? activeVid.title : 'Đang tải...'
            });
        }
    }
}

// ==============================================================
// 5. TÌM KIẾM TRẺ EM & VOICE SEARCH
// ==============================================================
function renderKidsPlaylist(keyword = "") {
    const container = document.getElementById('kids-playlist-container');
    container.innerHTML = "";
    
    const filtered = currentPlaylist.filter(vid => vid.title.toLowerCase().includes(keyword.toLowerCase()));
    filtered.forEach((vid) => {
        const originalIndex = currentPlaylist.findIndex(v => v.id === vid.id);
        const card = document.createElement('div');
        card.className = 'vid-card';
        card.tabIndex = 0;
        card.innerHTML = `
            <img src="https://img.youtube.com/vi/${sanitizeText(vid.id)}/mqdefault.jpg" class="vid-thumb">
            <div class="vid-title">${sanitizeText(vid.title)}</div>
        `;
        card.onclick = () => playIndex(originalIndex);
        card.onkeydown = (e) => { if(e.key === 'Enter') playIndex(originalIndex); };
        container.appendChild(card);
    });
}
document.getElementById('kids-search').addEventListener('input', (e) => renderKidsPlaylist(e.target.value));

// API Tìm kiếm giọng nói (Web Speech API)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if(SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    const voiceBtn = document.getElementById('btn-voice-search');
    
    voiceBtn.addEventListener('click', () => {
        recognition.start();
        voiceBtn.classList.add('recording');
    });
    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        document.getElementById('kids-search').value = text;
        renderKidsPlaylist(text);
        voiceBtn.classList.remove('recording');
    };
    recognition.onerror = () => voiceBtn.classList.remove('recording');
    recognition.onend = () => voiceBtn.classList.remove('recording');
} else {
    document.getElementById('btn-voice-search').style.display = 'none';
}

// ==============================================================
// 6. LOGIC ADMIN (MOBILE REMOTE & QUẢN LÝ)
// ==============================================================
let remoteConnected = false;

function initAdminMode() {
    // Kéo danh sách
    db.ref(`rooms/${TV_ROOM_ID}/playlist`).on('value', (snapshot) => {
        const data = snapshot.val();
        currentPlaylist = data ? Object.values(data) : [];
        renderAdminPlaylist();
    });
}

function sendCommand(action, payload = null) {
    if(!remoteConnected) return;
    db.ref(`rooms/${TV_ROOM_ID}/command`).set({ action, payload, ts: Date.now() });
}

// Kết nối Mobile làm Remote
document.getElementById('btn-connect-tv').addEventListener('click', () => {
    const inputCode = document.getElementById('remote-target-id').value.trim();
    if(inputCode !== TV_ROOM_ID) return alert("Sai mã TV!");

    remoteConnected = true;
    document.getElementById('remote-status').innerText = "✅ Đã kết nối vào phòng " + TV_ROOM_ID;
    document.getElementById('remote-controls').classList.remove('hidden');

    // Nhận Feedback realtime từ TV
    db.ref(`rooms/${TV_ROOM_ID}/state`).on('value', (snapshot) => {
        const state = snapshot.val();
        if(state) {
            document.getElementById('rem-now-playing').textContent = state.nowPlayingTitle; 
            document.getElementById('rem-play').innerText = state.isPlaying ? '⏸' : '▶';
            document.getElementById('rem-progress-bar').style.width = state.duration > 0 ? (state.currentTime/state.duration*100) + '%' : '0%';
        }
    });
});

// Nút bấm Remote
document.getElementById('rem-play').onclick = () => sendCommand(document.getElementById('rem-play').innerText === '⏸' ? 'pause' : 'play');
document.getElementById('rem-next').onclick = () => sendCommand('next');
document.getElementById('rem-prev').onclick = () => sendCommand('prev');
document.getElementById('rem-volume').addEventListener('change', (e) => sendCommand('volume', parseInt(e.target.value)));

// --- THÊM KÊNH BẰNG RSS (KHÔNG CẦN API KEY) ---
document.getElementById('btn-add-channel').addEventListener('click', async () => {
    const channelId = document.getElementById('channel-id-input').value.trim();
    const statusDiv = document.getElementById('rss-status');
    if (!channelId.startsWith('UC')) return alert("Channel ID phải bắt đầu bằng 'UC'");
    
    statusDiv.innerHTML = "<span style='color:#3ea6ff;'>⏳ Đang quét lấy dữ liệu kênh...</span>";
    
    try {
        const rssUrl = encodeURIComponent(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
        const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`;
        const res = await fetch(proxyUrl);
        const data = await res.json();
        
        if (data.status !== 'ok') throw new Error("Kênh không tồn tại hoặc bị ẩn.");
        
        let count = 0;
        data.items.forEach(item => {
            const videoId = item.link.split('v=')[1];
            if (videoId && !currentPlaylist.find(v => v.id === videoId)) {
                currentPlaylist.push({ id: videoId, title: item.title });
                count++;
            }
        });
        
        if (count > 0) {
            db.ref(`rooms/${TV_ROOM_ID}/playlist`).set(currentPlaylist); 
            statusDiv.innerHTML = `<span style='color:#2ed573;'>✅ Thành công! Đã đẩy ${count} video mới lên TV.</span>`;
            document.getElementById('channel-id-input').value = "";
        } else {
            statusDiv.innerHTML = `<span style='color:#ff0000;'>⚠️ Các video mới nhất của kênh này đều đã có trong danh sách.</span>`;
        }
    } catch(e) {
        statusDiv.innerHTML = `<span style='color:#ff0000;'>❌ Lỗi: ${e.message}</span>`;
    }
});

// --- THÊM VIDEO THỦ CÔNG ---
document.getElementById('btn-add-manual').addEventListener('click', () => {
    const id = document.getElementById('manual-vid-id').value.trim();
    const title = document.getElementById('manual-vid-title').value.trim();
    if(!id || !title) return alert("Vui lòng nhập đủ ID và Tên!");
    
    let cleanId = id;
    if(id.includes('v=')) cleanId = id.split('v=')[1].split('&')[0];
    else if(id.includes('youtu.be/')) cleanId = id.split('youtu.be/')[1].split('?')[0];

    if (!currentPlaylist.find(v => v.id === cleanId)) {
        currentPlaylist.push({ id: cleanId, title: title });
        db.ref(`rooms/${TV_ROOM_ID}/playlist`).set(currentPlaylist);
        document.getElementById('manual-vid-id').value = '';
        document.getElementById('manual-vid-title').value = '';
        alert("✅ Đã đẩy video mới lên TV!");
    } else {
        alert("⚠️ Video đã tồn tại!");
    }
});

// Render Whitelist Admin (An toàn XSS)
function renderAdminPlaylist() {
    const ul = document.getElementById('admin-playlist');
    ul.innerHTML = "";
    currentPlaylist.forEach((vid, index) => {
        const li = document.createElement('li');
        li.className = 'whitelist-item';
        
        const infoDiv = document.createElement('div');
        infoDiv.style.flex = "1";
        const strongTitle = document.createElement('strong');
        strongTitle.textContent = vid.title;
        infoDiv.appendChild(strongTitle);

        const btnDel = document.createElement('button');
        btnDel.className = "btn-primary";
        btnDel.style.background = "#ff0000";
        btnDel.style.padding = "5px 15px";
        btnDel.textContent = "Xóa";
        btnDel.onclick = () => {
            currentPlaylist.splice(index, 1);
            db.ref(`rooms/${TV_ROOM_ID}/playlist`).set(currentPlaylist);
        };

        li.appendChild(infoDiv);
        li.appendChild(btnDel);
        ul.appendChild(li);
    });
}

// Logic chuyển Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
    });
});
