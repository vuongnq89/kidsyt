// ================= FIREBASE CONFIG & INIT =================
// THAY BẰNG CONFIG CỦA BẠN (Lấy từ Firebase Console > Project Settings)
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

// ================= CẤU HÌNH & BẢO MẬT =================
// 1. PIN obfuscation (Tránh lộ plaintext trực tiếp)
const HASHED_PIN = btoa("8989"); // "ODk4OQ=="
const TV_ROOM_ID = "1111"; 

let player;
let isTVMode = false;
let currentPlaylist = [];
let tvSyncInterval;

// DOM Elements
const el = {
    startScreen: document.getElementById('start-screen'),
    tvView: document.getElementById('tv-view'),
    remoteView: document.getElementById('remote-view'),
    pinModal: document.getElementById('pin-modal'),
    spinner: document.getElementById('loading-spinner')
};

// ================= CHUYỂN ĐỔI MÀN HÌNH =================
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

// ================= ANTI-XSS HELPER =================
function sanitizeText(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span.innerHTML;
}

// ================= TV MODE LOGIC =================
function initTVMode() {
    loadYouTubeAPI();
    
    // Lắng nghe thay đổi Playlist từ Firebase
    db.ref(`rooms/${TV_ROOM_ID}/playlist`).on('value', (snapshot) => {
        const data = snapshot.val();
        currentPlaylist = data ? Object.values(data) : [];
        renderKidsPlaylist();
        
        // Load video đầu tiên nếu chưa play
        if(currentPlaylist.length > 0 && (!player || player.getPlayerState() === YT.PlayerState.UNSTARTED)) {
            if(player && player.loadVideoById) {
                player.loadVideoById(currentPlaylist[0].id);
            }
        }
    });

    // Lắng nghe lệnh (Command) từ Remote
    db.ref(`rooms/${TV_ROOM_ID}/command`).on('value', (snapshot) => {
        const cmd = snapshot.val();
        if(!cmd || !player) return;

        switch(cmd.action) {
            case 'play': player.playVideo(); break;
            case 'pause': player.pauseVideo(); break;
            case 'next': playIndex(cmd.payload || 0); break;
            case 'prev': playIndex(cmd.payload || 0); break;
            case 'volume': player.setVolume(cmd.payload); break;
            case 'seek': player.seekTo(cmd.payload, true); break;
        }
    });

    // Bắt sự kiện bàn phím (TV Remote thật thường map ra Arrow Keys / Space)
    document.addEventListener('keydown', handleKeyboardControl);
}

function loadYouTubeAPI() {
    // Tránh ghi đè toàn cục gây xung đột script khác
    window.onYouTubeIframeAPIReady = window.onYouTubeIframeAPIReady || function() {
        createPlayer();
    };
    if (window.YT && window.YT.Player) { createPlayer(); return; }
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
}

function createPlayer() {
    player = new YT.Player('ytplayer', {
        playerVars: { 'autoplay': 1, 'controls': 0, 'rel': 0, 'modestbranding': 1, 'disablekb': 1 },
        events: {
            'onReady': (e) => {
                if(currentPlaylist.length > 0) e.target.loadVideoById(currentPlaylist[0].id);
                // Báo cáo State lên Firebase mỗi giây
                tvSyncInterval = setInterval(syncStateToFirebase, 1000);
            },
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerStateChange(e) {
    if (e.data === YT.PlayerState.BUFFERING) el.spinner.classList.remove('hidden');
    else el.spinner.classList.add('hidden');

    if (e.data === YT.PlayerState.ENDED) {
        // Tìm index hiện tại và tự nhảy bài tiếp theo
        const currentUrl = player.getVideoUrl();
        const videoId = currentUrl.split('v=')[1]?.substring(0, 11);
        const currentIndex = currentPlaylist.findIndex(v => v.id === videoId);
        if(currentIndex !== -1 && currentPlaylist.length > 1) {
            const nextIdx = (currentIndex + 1) % currentPlaylist.length;
            playIndex(nextIdx);
        }
    }
}

function playIndex(index) {
    if (index >= 0 && index < currentPlaylist.length && player) {
        player.loadVideoById(currentPlaylist[index].id);
    }
}

function formatTime(sec) {
    let m = Math.floor(sec / 60);
    let s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Báo cáo tiến trình và metadata lên Firebase
function syncStateToFirebase() {
    if(player && player.getPlayerState) {
        const state = player.getPlayerState();
        const curr = player.getCurrentTime() || 0;
        const dur = player.getDuration() || 0;
        
        // Update UI TV
        document.getElementById('tv-progress-bar').style.width = dur > 0 ? (curr/dur*100) + '%' : '0%';
        document.getElementById('tv-time-display').innerText = `${formatTime(curr)} / ${formatTime(dur)}`;

        // Update Firebase (Chỉ ghi nếu đang Play hoặc Pause để tránh spam)
        if(state === YT.PlayerState.PLAYING || state === YT.PlayerState.PAUSED) {
            const currentUrl = player.getVideoUrl();
            const videoId = currentUrl.split('v=')[1]?.substring(0, 11);
            const activeVid = currentPlaylist.find(v => v.id === videoId);

            db.ref(`rooms/${TV_ROOM_ID}/state`).set({
                isPlaying: state === YT.PlayerState.PLAYING,
                currentTime: curr,
                duration: dur,
                nowPlayingTitle: activeVid ? activeVid.title : '---',
                nowPlayingId: activeVid ? activeVid.id : ''
            });
        }
    }
}

function handleKeyboardControl(e) {
    if(!isTVMode || !player) return;
    const currentVol = player.getVolume();
    switch(e.key) {
        case ' ': player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo(); break;
        case 'ArrowUp': player.setVolume(Math.min(100, currentVol + 10)); break;
        case 'ArrowDown': player.setVolume(Math.max(0, currentVol - 10)); break;
    }
}

// Render Kids Search & UI
function renderKidsPlaylist(keyword = "") {
    const container = document.getElementById('kids-playlist-container');
    container.innerHTML = "";
    
    const filtered = currentPlaylist.filter(vid => vid.title.toLowerCase().includes(keyword.toLowerCase()));
    filtered.forEach((vid) => {
        const originalIndex = currentPlaylist.findIndex(v => v.id === vid.id);
        const card = document.createElement('div');
        card.className = 'vid-card';
        // Sử dụng textContent thông qua hàm helper để phòng XSS
        card.innerHTML = `
            <img src="https://img.youtube.com/vi/${sanitizeText(vid.id)}/mqdefault.jpg" class="vid-thumb">
            <div class="vid-title">${sanitizeText(vid.title)}</div>
        `;
        card.onclick = () => playIndex(originalIndex);
        container.appendChild(card);
    });
}
const searchInput = document.getElementById('kids-search');
if(searchInput) searchInput.addEventListener('input', (e) => renderKidsPlaylist(e.target.value));

// ================= ADMIN MODE LOGIC (MOBILE) =================
let remoteConnected = false;

function initAdminMode() {
    // Load Playlist từ Firebase
    db.ref(`rooms/${TV_ROOM_ID}/playlist`).on('value', (snapshot) => {
        const data = snapshot.val();
        currentPlaylist = data ? Object.values(data) : [];
        renderAdminPlaylist();
    });

    const savedKey = localStorage.getItem('ytApiKey');
    if(savedKey) document.getElementById('yt-api-key').value = savedKey;
}

// Gửi lệnh qua Firebase (Thay thế PeerJS)
function sendCommand(action, payload = null) {
    if(!remoteConnected) return;
    db.ref(`rooms/${TV_ROOM_ID}/command`).set({
        action: action,
        payload: payload,
        ts: Date.now() // Timestamp bắt buộc để trigger event
    });
}

document.getElementById('btn-connect-tv').addEventListener('click', () => {
    const inputCode = document.getElementById('remote-target-id').value.trim();
    if(inputCode !== TV_ROOM_ID) return alert("Sai mã TV!");

    remoteConnected = true;
    document.getElementById('remote-status').innerText = "✅ Kết nối thành công!";
    document.getElementById('remote-controls').classList.remove('hidden');

    // Lắng nghe State từ TV để hiển thị lên Remote
    db.ref(`rooms/${TV_ROOM_ID}/state`).on('value', (snapshot) => {
        const state = snapshot.val();
        if(state) {
            document.getElementById('rem-now-playing').textContent = state.nowPlayingTitle; // XSS safe
            document.getElementById('rem-play').innerText = state.isPlaying ? '⏸' : '▶';
            document.getElementById('rem-progress-bar').style.width = state.duration > 0 ? (state.currentTime/state.duration*100) + '%' : '0%';
        }
    });
});

document.getElementById('rem-play').onclick = () => {
    const isPlaying = document.getElementById('rem-play').innerText === '⏸';
    sendCommand(isPlaying ? 'pause' : 'play');
};

document.getElementById('rem-next').onclick = () => {
    const stateVal = document.getElementById('rem-now-playing').textContent;
    const currIdx = currentPlaylist.findIndex(v => v.title === stateVal);
    if(currIdx !== -1) sendCommand('next', (currIdx + 1) % currentPlaylist.length);
};

document.getElementById('rem-prev').onclick = () => {
    const stateVal = document.getElementById('rem-now-playing').textContent;
    const currIdx = currentPlaylist.findIndex(v => v.title === stateVal);
    if(currIdx !== -1) sendCommand('prev', (currIdx - 1 + currentPlaylist.length) % currentPlaylist.length);
};

document.getElementById('rem-volume').addEventListener('change', (e) => {
    sendCommand('volume', parseInt(e.target.value));
});

// Admin Whitelist Sync Firebase
function renderAdminPlaylist() {
    const ul = document.getElementById('admin-playlist');
    ul.innerHTML = "";
    currentPlaylist.forEach((vid, index) => {
        const li = document.createElement('li');
        li.className = 'whitelist-item';
        
        // Tạo DOM an toàn 100% chống XSS
        const infoDiv = document.createElement('div');
        infoDiv.style.flex = "1";
        const strongTitle = document.createElement('strong');
        strongTitle.textContent = vid.title;
        infoDiv.appendChild(strongTitle);

        const btnDel = document.createElement('button');
        btnDel.className = "btn-primary";
        btnDel.style.background = "#ff0000";
        btnDel.style.padding = "5px 10px";
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

// Live Search YouTube
document.getElementById('btn-live-search').addEventListener('click', async () => {
    const apiKey = document.getElementById('yt-api-key').value.trim();
    const query = document.getElementById('live-search-input').value.trim();
    const resultsContainer = document.getElementById('live-search-results');
    
    if(!apiKey || !query) return alert("Nhập API Key và Từ khóa!");
    localStorage.setItem('ytApiKey', apiKey); 
    resultsContainer.innerHTML = "<p>Đang tìm kiếm...</p>";
    
    try {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`);
        const data = await res.json();
        if(data.error) throw new Error(data.error.message);
        
        resultsContainer.innerHTML = "";
        data.items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'search-result-item';
            
            // XSS Safe creation
            const img = document.createElement('img');
            img.src = item.snippet.thumbnails.medium.url;
            
            const info = document.createElement('div');
            info.className = 'search-result-info';
            const titleDiv = document.createElement('div');
            titleDiv.textContent = item.snippet.title;
            titleDiv.className = 'search-result-title';
            
            const addBtn = document.createElement('button');
            addBtn.className = "btn-primary";
            addBtn.textContent = "➕ Thêm";
            addBtn.onclick = () => {
                if(!currentPlaylist.find(v => v.id === item.id.videoId)) {
                    currentPlaylist.push({ id: item.id.videoId, title: item.snippet.title });
                    db.ref(`rooms/${TV_ROOM_ID}/playlist`).set(currentPlaylist); // Lưu thẳng lên Firebase
                    alert("Đã thêm thành công!");
                }
            };
            
            info.appendChild(titleDiv);
            info.appendChild(addBtn);
            el.appendChild(img);
            el.appendChild(info);
            resultsContainer.appendChild(el);
        });
    } catch(e) {
        resultsContainer.innerHTML = `<p style="color:red">Lỗi: ${e.message}</p>`;
    }
});

// Admin Tabs Navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
    });
});
