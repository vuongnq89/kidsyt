// ==============================================================
// 1. CẤU HÌNH FIREBASE & YOUTUBE API
// ==============================================================
const firebaseConfig = {
    apiKey: "AIzaSy_YOUR_FIREBASE_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.firebaseio.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123:web:abc"
};

const YOUTUBE_API_KEY = "AIzaSy_YOUR_YOUTUBE_API_KEY_HERE"; 

let db;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
} catch (error) {
    console.warn("Chưa cấu hình Firebase. Giao diện hoạt động nhưng không lưu dữ liệu:", error);
}

// ==============================================================
// 2. BIẾN TOÀN CỤC (GLOBAL MODE)
// ==============================================================
const GLOBAL_ROOM = "global_tv"; // Mã cố định, áp dụng cho tất cả người xem
let adminPinBase64 = "ODk4OQ=="; // Mặc định là 8989

let player;
let isTVMode = false;
let currentPlaylist = [];
let uiSyncInterval; 
let remoteLocalInterval; 
let remoteStateCache = null;

const el = {
    startScreen: document.getElementById('start-screen'),
    tvView: document.getElementById('tv-view'),
    remoteView: document.getElementById('remote-view'),
    pinModal: document.getElementById('pin-modal'),
    spinner: document.getElementById('loading-spinner')
};

function sanitizeText(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span.innerHTML;
}

// Đồng bộ Mật khẩu Admin từ Firebase khi vừa tải trang
if (db) {
    db.ref(`${GLOBAL_ROOM}/pin`).on('value', snap => {
        if (snap.exists()) {
            adminPinBase64 = snap.val();
        } else {
            // Nếu chưa có, tạo mặc định 8989
            db.ref(`${GLOBAL_ROOM}/pin`).set(adminPinBase64);
        }
    });
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
    document.getElementById('pin-input').focus();
});

document.getElementById('btn-submit-pin').addEventListener('click', () => {
    const input = document.getElementById('pin-input').value;
    if (btoa(input) === adminPinBase64) {
        el.pinModal.classList.add('hidden');
        el.startScreen.classList.add('hidden');
        el.remoteView.classList.remove('hidden');
        document.getElementById('pin-input').value = "";
        initAdminMode(); // Mở luôn vì không cần kết nối TV nữa
    } else {
        alert("Sai mật khẩu Admin!");
        document.getElementById('pin-input').value = "";
    }
});
document.getElementById('btn-cancel-pin').addEventListener('click', () => el.pinModal.classList.add('hidden'));

// ==============================================================
// 4. LOGIC CHẾ ĐỘ NGƯỜI XEM (VIEWER/TV)
// ==============================================================
function initTVMode() {
    loadYouTubeAPI();
    
    if(!db) return;

    // Lấy danh sách video chung toàn cầu
    db.ref(`${GLOBAL_ROOM}/playlist`).on('value', (snapshot) => {
        const data = snapshot.val();
        currentPlaylist = data ? Object.values(data) : [];
        renderKidsPlaylist(document.getElementById('kids-search').value);
        
        if(currentPlaylist.length > 0 && (!player || player.getPlayerState() === YT.PlayerState.UNSTARTED)) {
            if(player && player.loadVideoById) player.loadVideoById(currentPlaylist[0].id);
        }
    });

    // Nhận lệnh từ Admin
    db.ref(`${GLOBAL_ROOM}/command`).on('value', (snapshot) => {
        const cmd = snapshot.val();
        if(!cmd || !player) return;

        switch(cmd.action) {
            case 'play': player.playVideo(); break;
            case 'pause': player.pauseVideo(); break;
            case 'play_id': playById(cmd.payload); break; 
            case 'volume': player.setVolume(cmd.payload); break;
        }
    });

    // Điều khiển bằng phím cứng
    document.addEventListener('keydown', (e) => {
        if(!isTVMode || !player) return;
        const vol = player.getVolume();
        switch(e.key) {
            case ' ': player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo(); break;
            case 'ArrowRight': playNextAuto(); break;
            case 'ArrowLeft': playPrevAuto(); break;
            case 'ArrowUp': player.setVolume(Math.min(100, vol + 10)); syncVolume(); break;
            case 'ArrowDown': player.setVolume(Math.max(0, vol - 10)); syncVolume(); break;
        }
    });

    // Xử lý nút Fullscreen
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            el.tvView.requestFullscreen?.() || el.tvView.webkitRequestFullscreen?.();
            document.getElementById('btn-custom-fullscreen').innerHTML = "🔲 Thu nhỏ";
        } else {
            document.exitFullscreen?.() || document.webkitExitFullscreen?.();
            document.getElementById('btn-custom-fullscreen').innerHTML = "🔲 Toàn màn hình";
        }
    };
    
    // Nút và Nháy đúp
    document.getElementById('btn-custom-fullscreen').addEventListener('click', toggleFullscreen);
    document.getElementById('click-blocker').addEventListener('dblclick', toggleFullscreen);

    // Tua video
    document.getElementById('tv-progress-container').addEventListener('click', (e) => {
        if(!player) return;
        const rect = e.target.getBoundingClientRect();
        const seekTime = (e.clientX - rect.left) / rect.width * player.getDuration();
        player.seekTo(seekTime, true);
        syncStateToFirebase(); 
    });

    uiSyncInterval = setInterval(updateTVUI, 500);
}

function loadYouTubeAPI() {
    window.onYouTubeIframeAPIReady = function() { createPlayer(); };
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
                syncStateToFirebase(); 
            },
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerStateChange(e) {
    if (e.data === YT.PlayerState.BUFFERING) el.spinner.classList.remove('hidden');
    else el.spinner.classList.add('hidden');

    if (e.data === YT.PlayerState.ENDED) playNextAuto();
    
    if ([YT.PlayerState.PLAYING, YT.PlayerState.PAUSED, YT.PlayerState.CUED].includes(e.data)) {
        syncStateToFirebase();
    }
}

function playById(videoId) {
    if (player && videoId) player.loadVideoById(videoId);
}

function playNextAuto() {
    if(currentPlaylist.length === 0) return;
    const currentUrl = player.getVideoUrl();
    const videoId = currentUrl.split('v=')[1]?.substring(0, 11);
    const currIdx = currentPlaylist.findIndex(v => v.id === videoId);
    if(currIdx !== -1) playById(currentPlaylist[(currIdx + 1) % currentPlaylist.length].id);
}

function playPrevAuto() {
    if(currentPlaylist.length === 0) return;
    const currentUrl = player.getVideoUrl();
    const videoId = currentUrl.split('v=')[1]?.substring(0, 11);
    const currIdx = currentPlaylist.findIndex(v => v.id === videoId);
    if(currIdx !== -1) playById(currentPlaylist[(currIdx - 1 + currentPlaylist.length) % currentPlaylist.length].id);
}

function formatTime(sec) {
    let m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function updateTVUI() {
    if(player && player.getPlayerState) {
        const curr = player.getCurrentTime() || 0;
        const dur = player.getDuration() || 0;
        document.getElementById('tv-progress-bar').style.width = dur > 0 ? (curr/dur*100) + '%' : '0%';
        document.getElementById('tv-time-display').innerText = `${formatTime(curr)} / ${formatTime(dur)}`;
    }
}

function syncStateToFirebase() {
    if(player && player.getPlayerState && db) {
        const state = player.getPlayerState();
        const curr = player.getCurrentTime() || 0;
        const dur = player.getDuration() || 0;
        const currentUrl = player.getVideoUrl();
        const videoId = currentUrl.split('v=')[1]?.substring(0, 11);
        const activeVid = currentPlaylist.find(v => v.id === videoId);

        db.ref(`${GLOBAL_ROOM}/state`).set({
            isPlaying: state === YT.PlayerState.PLAYING,
            currentTime: curr,
            duration: dur,
            updatedAt: Date.now(), 
            nowPlayingTitle: activeVid ? activeVid.title : 'Đang tải...',
            nowPlayingId: videoId
        });
    }
}

function syncVolume() {
    if (player && db) db.ref(`${GLOBAL_ROOM}/volume`).set(player.getVolume());
}

// ==============================================================
// 5. TÌM KIẾM TRẺ EM & GỢI Ý (VIEWER VIEW)
// ==============================================================
function renderKidsPlaylist(keyword = "") {
    const container = document.getElementById('kids-playlist-container');
    container.innerHTML = "";
    
    // Tìm kiếm trong danh sách cho phép
    const filtered = currentPlaylist.filter(vid => vid.title.toLowerCase().includes(keyword.toLowerCase()));
    
    filtered.forEach((vid) => {
        const card = document.createElement('div');
        card.className = 'vid-card';
        card.tabIndex = 0;
        card.innerHTML = `
            <img src="https://img.youtube.com/vi/${sanitizeText(vid.id)}/mqdefault.jpg" class="vid-thumb">
            <div class="vid-title">${sanitizeText(vid.title)}</div>
        `;
        // Cho người xem bấm chọn video trực tiếp
        card.onclick = () => { playById(vid.id); syncStateToFirebase(); };
        card.onkeydown = (e) => { if(e.key === 'Enter') { playById(vid.id); syncStateToFirebase(); } };
        container.appendChild(card);
    });
}
document.getElementById('kids-search').addEventListener('input', (e) => renderKidsPlaylist(e.target.value));

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
// 6. LOGIC ADMIN (GLOBAL REMOTE)
// ==============================================================
function sendCommand(action, payload = null) {
    if(!db) return;
    db.ref(`${GLOBAL_ROOM}/command`).set({ action, payload, ts: Date.now() });
}

function initAdminMode() {
    if(!db) return alert("Chưa kết nối Database!");

    // Lắng nghe danh sách
    db.ref(`${GLOBAL_ROOM}/playlist`).on('value', (snap) => {
        const data = snap.val();
        currentPlaylist = data ? Object.values(data) : [];
        renderAdminPlaylist();
    });

    // Lắng nghe trạng thái xem chung
    db.ref(`${GLOBAL_ROOM}/state`).on('value', (snap) => {
        const state = snap.val();
        if(state) {
            remoteStateCache = state;
            document.getElementById('rem-now-playing').textContent = state.nowPlayingTitle; 
            document.getElementById('rem-play').innerText = state.isPlaying ? '⏸' : '▶';
        }
    });

    // Chạy thanh thời gian Remote
    if(remoteLocalInterval) clearInterval(remoteLocalInterval);
    remoteLocalInterval = setInterval(() => {
        if(remoteStateCache && remoteStateCache.duration > 0) {
            let current = remoteStateCache.currentTime;
            if(remoteStateCache.isPlaying) {
                current += (Date.now() - remoteStateCache.updatedAt) / 1000;
            }
            if(current > remoteStateCache.duration) current = remoteStateCache.duration;
            document.getElementById('rem-progress-bar').style.width = (current/remoteStateCache.duration*100) + '%';
        }
    }, 1000);
}

// Các nút điều khiển
document.getElementById('rem-play').onclick = () => sendCommand(document.getElementById('rem-play').innerText === '⏸' ? 'pause' : 'play');
document.getElementById('rem-next').onclick = () => {
    if(!currentPlaylist.length || !remoteStateCache) return;
    const currIdx = currentPlaylist.findIndex(v => v.id === remoteStateCache.nowPlayingId);
    if(currIdx !== -1) sendCommand('play_id', currentPlaylist[(currIdx + 1) % currentPlaylist.length].id);
};
document.getElementById('rem-prev').onclick = () => {
    if(!currentPlaylist.length || !remoteStateCache) return;
    const currIdx = currentPlaylist.findIndex(v => v.id === remoteStateCache.nowPlayingId);
    if(currIdx !== -1) sendCommand('play_id', currentPlaylist[(currIdx - 1 + currentPlaylist.length) % currentPlaylist.length].id);
};
document.getElementById('rem-volume').addEventListener('change', (e) => sendCommand('volume', parseInt(e.target.value)));

// Đổi mật khẩu
document.getElementById('btn-change-pin').addEventListener('click', () => {
    const newPin = document.getElementById('new-pin-input').value.trim();
    if(newPin.length < 4) return alert("Mật khẩu phải có ít nhất 4 ký tự!");
    
    if(db) {
        db.ref(`${GLOBAL_ROOM}/pin`).set(btoa(newPin));
        alert("✅ Đổi mật khẩu thành công! Hãy ghi nhớ mật khẩu này.");
        document.getElementById('new-pin-input').value = "";
        adminPinBase64 = btoa(newPin); // Cập nhật ngay lập tức
    }
});


document.getElementById('btn-add-channel').addEventListener('click', async () => {
    const channelId = document.getElementById('channel-id-input').value.trim();
    const statusDiv = document.getElementById('api-status');
    if (!channelId.startsWith('UC')) return alert("Channel ID phải bắt đầu bằng 'UC'");
    
    statusDiv.innerHTML = "<span style='color:#3ea6ff;'>⏳ Đang kết nối YouTube API...</span>";
    
    try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${channelId}&part=snippet,id&order=date&maxResults=15`;
        const res = await fetch(apiUrl);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error.message);
        
        let count = 0;
        data.items.forEach(item => {
            if(item.id.kind === "youtube#video") {
                const videoId = item.id.videoId;
                if (!currentPlaylist.find(v => v.id === videoId)) {
                    currentPlaylist.push({ id: videoId, title: item.snippet.title });
                    count++;
                }
            }
        });
        
        if (count > 0 && db) {
            await db.ref(`${GLOBAL_ROOM}/playlist`).set(currentPlaylist); 
            statusDiv.innerHTML = `<span style='color:#2ed573;'>✅ Thành công! Đã đẩy ${count} video mới lên TV.</span>`;
            document.getElementById('channel-id-input').value = "";
        } else {
            statusDiv.innerHTML = `<span style='color:#ff0000;'>⚠️ Các video mới nhất đều đã có trong danh sách.</span>`;
        }
    } catch(e) {
        statusDiv.innerHTML = `<span style='color:#ff0000;'>❌ Lỗi: ${e.message}</span>`;
    }
});

document.getElementById('btn-add-manual').addEventListener('click', async () => {
    const id = document.getElementById('manual-vid-id').value.trim();
    const title = document.getElementById('manual-vid-title').value.trim();
    if(!id || !title) return alert("Vui lòng nhập đủ ID và Tên!");
    
    let cleanId = id;
    if(id.includes('v=')) cleanId = id.split('v=')[1].split('&')[0];
    else if(id.includes('youtu.be/')) cleanId = id.split('youtu.be/')[1].split('?')[0];

    if (!currentPlaylist.find(v => v.id === cleanId)) {
        currentPlaylist.push({ id: cleanId, title: title });
        if(db) await db.ref(`${GLOBAL_ROOM}/playlist`).set(currentPlaylist);
        document.getElementById('manual-vid-id').value = '';
        document.getElementById('manual-vid-title').value = '';
        alert("✅ Đã đẩy video mới lên TV!");
    } else {
        alert("⚠️ Video đã tồn tại!");
    }
});

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
            if(db) db.ref(`${GLOBAL_ROOM}/playlist`).set(currentPlaylist);
        };

        li.appendChild(infoDiv);
        li.appendChild(btnDel);
        ul.appendChild(li);
    });
}

// Đổi Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
    });
});
