// ================= DỮ LIỆU CƠ BẢN =================
let videos = JSON.parse(localStorage.getItem('ytKidsWhitelist')) || [
    { id: "XqZsoesa55w", title: "Baby Shark Dance" },
    { id: "020g-0hhCQ8", title: "Phonics Song with Two Words" }
];
const ADMIN_PIN = "8989";
const FIXED_TV_CODE = "1111"; 
const PEER_PREFIX = "YTKIDS-V1-"; 

let player;
let currentIndex = 0;
let isLooping = false;
let progressInterval;

// ================= CHUYỂN ĐỔI MÀN HÌNH =================
document.getElementById('btn-mode-tv').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('tv-view').classList.remove('hidden');
    loadYouTubeAPI();
    setupPeerJS_TV();
});

document.getElementById('btn-mode-admin').addEventListener('click', () => {
    document.getElementById('pin-modal').classList.remove('hidden');
});

document.getElementById('btn-submit-pin').addEventListener('click', () => {
    if (document.getElementById('pin-input').value === ADMIN_PIN) {
        document.getElementById('pin-modal').classList.add('hidden');
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('remote-view').classList.remove('hidden');
        renderAdminPlaylist();
        
        // Load API Key đã lưu
        const savedKey = localStorage.getItem('ytApiKey');
        if(savedKey) document.getElementById('yt-api-key').value = savedKey;
    } else {
        alert("Sai mã PIN!");
        document.getElementById('pin-input').value = "";
    }
});
document.getElementById('btn-cancel-pin').addEventListener('click', () => document.getElementById('pin-modal').classList.add('hidden'));

// ================= YOUTUBE PLAYER & CUSTOM CONTROLS =================
function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) { createPlayer(); return; }
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function() { createPlayer(); }

function createPlayer() {
    if(videos.length === 0) return;
    player = new YT.Player('ytplayer', {
        videoId: videos[currentIndex].id,
        playerVars: { 
            'autoplay': 1, 'controls': 0, 'rel': 0, 'modestbranding': 1, 
            'disablekb': 1, 'fs': 0, 'playsinline': 1 // playsinline giúp hạn chế pause khi ẩn web
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(e) {
    e.target.playVideo();
    renderKidsPlaylist();
    // Bắt đầu đồng bộ thanh Progress Bar
    progressInterval = setInterval(updateProgressBar, 1000);
}

function onPlayerStateChange(e) {
    const playBtn = document.getElementById('btn-custom-play');
    if (e.data === YT.PlayerState.PLAYING) {
        playBtn.innerText = '⏸';
    } else if (e.data === YT.PlayerState.PAUSED) {
        playBtn.innerText = '▶';
    } else if (e.data === YT.PlayerState.ENDED) {
        if(isLooping) {
            player.seekTo(0);
            player.playVideo();
        } else {
            nextVideo();
        }
    }
}

// Hàm format giây sang MM:SS
function formatTime(time) {
    time = Math.round(time);
    let m = Math.floor(time / 60);
    let s = time % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
}

function updateProgressBar() {
    if(player && player.getPlayerState() === YT.PlayerState.PLAYING) {
        const curr = player.getCurrentTime();
        const duration = player.getDuration();
        document.getElementById('current-time').innerText = formatTime(curr);
        document.getElementById('duration-time').innerText = formatTime(duration);
        document.getElementById('progress-bar').style.width = (curr / duration) * 100 + "%";
    }
}

// Seek Video (Tua)
document.getElementById('progress-container').addEventListener('click', (e) => {
    if(!player) return;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    player.seekTo(ratio * player.getDuration(), true);
});

// Nút Play/Pause Custom
document.getElementById('btn-custom-play').addEventListener('click', togglePlay);
function togglePlay() { 
    if(!player) return;
    player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo(); 
}

// Nút Lặp lại
document.getElementById('btn-custom-loop').addEventListener('click', (e) => {
    isLooping = !isLooping;
    e.target.classList.toggle('active', isLooping);
});

// Nút Toàn màn hình
document.getElementById('btn-custom-fullscreen').addEventListener('click', () => {
    const tvView = document.getElementById('tv-view');
    if (!document.fullscreenElement) {
        if(tvView.requestFullscreen) tvView.requestFullscreen();
        else if(tvView.webkitRequestFullscreen) tvView.webkitRequestFullscreen(); // Safari
    } else {
        if(document.exitFullscreen) document.exitFullscreen();
        else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
});

function loadVideo(index) {
    if (index >= 0 && index < videos.length && player) {
        currentIndex = index;
        player.loadVideoById(videos[currentIndex].id);
    }
}
function nextVideo() { if(videos.length > 0) { currentIndex = (currentIndex + 1) % videos.length; loadVideo(currentIndex); } }
function prevVideo() { if(videos.length > 0) { currentIndex = (currentIndex - 1 + videos.length) % videos.length; loadVideo(currentIndex); } }

// ================= VOICE SEARCH & TÌM KIẾM BÉ =================
function renderKidsPlaylist(keyword = "") {
    const container = document.getElementById('kids-playlist-container');
    container.innerHTML = "";
    
    const filteredVideos = videos.filter(vid => vid.title.toLowerCase().includes(keyword.toLowerCase()));
    
    filteredVideos.forEach(vid => {
        const originalIndex = videos.findIndex(v => v.id === vid.id);
        const card = document.createElement('div');
        card.className = 'vid-card';
        card.innerHTML = `
            <img src="https://img.youtube.com/vi/${vid.id}/mqdefault.jpg" class="vid-thumb">
            <div class="vid-title">${vid.title}</div>
        `;
        card.addEventListener('click', () => loadVideo(originalIndex));
        container.appendChild(card);
    });
}

document.getElementById('kids-search').addEventListener('input', (e) => renderKidsPlaylist(e.target.value));

// Nhận diện giọng nói Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if(SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    
    const voiceBtn = document.getElementById('btn-voice-search');
    
    voiceBtn.addEventListener('click', () => {
        recognition.start();
        voiceBtn.classList.add('recording');
    });
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('kids-search').value = transcript;
        renderKidsPlaylist(transcript);
        voiceBtn.classList.remove('recording');
    };
    
    recognition.onerror = () => voiceBtn.classList.remove('recording');
    recognition.onend = () => voiceBtn.classList.remove('recording');
} else {
    document.getElementById('btn-voice-search').style.display = 'none'; // Ẩn nếu trình duyệt ko hỗ trợ
}

// ================= ADMIN: TÌM KIẾM TRỰC TIẾP TRÊN YOUTUBE =================
document.getElementById('btn-live-search').addEventListener('click', async () => {
    const apiKey = document.getElementById('yt-api-key').value.trim();
    const query = document.getElementById('live-search-input').value.trim();
    const resultsContainer = document.getElementById('live-search-results');
    
    if(!apiKey || !query) return alert("Vui lòng nhập API Key và Từ khóa!");
    
    localStorage.setItem('ytApiKey', apiKey); // Lưu lại API Key
    resultsContainer.innerHTML = "<p style='color:#aaa;'>Đang tìm kiếm...</p>";
    
    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if(data.error) throw new Error(data.error.message);
        
        resultsContainer.innerHTML = "";
        data.items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'search-result-item';
            el.innerHTML = `
                <img src="${item.snippet.thumbnails.medium.url}" alt="thumb">
                <div class="search-result-info">
                    <div class="search-result-title">${item.snippet.title}</div>
                    <button class="btn-primary" style="padding: 5px 10px; font-size:0.85rem;" 
                        onclick="addFromLiveSearch('${item.id.videoId}', '${item.snippet.title.replace(/'/g, "\\'")}')">➕ Thêm vào Web</button>
                </div>
            `;
            resultsContainer.appendChild(el);
        });
    } catch (err) {
        resultsContainer.innerHTML = `<p style="color:#ff0000;">Lỗi: ${err.message}</p>`;
    }
});

window.addFromLiveSearch = function(id, title) {
    if(!videos.find(v => v.id === id)) {
        videos.push({ id, title });
        localStorage.setItem('ytKidsWhitelist', JSON.stringify(videos));
        renderAdminPlaylist();
        alert("Đã thêm thành công!");
    } else {
        alert("Video này đã có trong danh sách!");
    }
}

// Quản lý Whitelist
function renderAdminPlaylist() {
    const ul = document.getElementById('admin-playlist');
    ul.innerHTML = "";
    videos.forEach((vid, index) => {
        const li = document.createElement('li');
        li.className = 'whitelist-item';
        li.innerHTML = `
            <div style="flex:1;"><strong>${vid.title}</strong><br><small style="color:#aaa;">ID: ${vid.id}</small></div>
            <button class="btn-primary" style="background:#ff0000; padding: 5px 10px;" onclick="deleteVideo(${index})">Xóa</button>
        `;
        ul.appendChild(li);
    });
}

window.deleteVideo = function(index) {
    if(confirm("Bạn có chắc muốn xóa?")) {
        videos.splice(index, 1);
        localStorage.setItem('ytKidsWhitelist', JSON.stringify(videos));
        renderAdminPlaylist();
    }
};

// ================= ĐIỀU KHIỂN PEERJS =================
let remoteConnection = null;

function setupPeerJS_TV() {
    const tvPeer = new Peer(PEER_PREFIX + FIXED_TV_CODE); 
    tvPeer.on('connection', (conn) => {
        conn.on('data', (data) => {
            if(data.command === 'playpause') togglePlay();
            if(data.command === 'next') nextVideo();
            if(data.command === 'prev') prevVideo();
        });
    });
}

document.getElementById('btn-connect-tv').addEventListener('click', () => {
    const inputCode = document.getElementById('remote-target-id').value.trim();
    if(!inputCode) return;
    
    document.getElementById('remote-status').innerText = "Đang kết nối đến TV...";
    const tempPeer = new Peer();
    
    tempPeer.on('open', () => {
        remoteConnection = tempPeer.connect(PEER_PREFIX + inputCode);
        remoteConnection.on('open', () => {
            document.getElementById('remote-controls').classList.remove('hidden');
            document.getElementById('remote-status').innerText = "";
        });
    });
});

document.getElementById('rem-play').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'playpause'}); });
document.getElementById('rem-next').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'next'}); });
document.getElementById('rem-prev').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'prev'}); });

// Tabs Admin
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
    });
});
