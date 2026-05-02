// Thay đổi danh sách video thành các video MÃ NGUỒN MỞ / TEST CỦA GOOGLE
// Đảm bảo 100% không bị chặn bản quyền khi test
let videos = [
    { id: "M7lc1UVf-VE", title: "Video Test của Google (Chắc chắn xem được)" },
    { id: "aqz-KE-bpKQ", title: "Phim Hoạt Hình Big Buck Bunny" },
    { id: "_OBlgSz8sSM", title: "Beli Beli Kids TV (Bài hát thiếu nhi)" }
];
let player;
let currentIndex = 0;
let pinSuccessAction = ""; 

function getAdminPin() {
    return localStorage.getItem('ytKidsAdminPin') || '8989';
}

// --- 1. PeerJS (Remote) ---
const peer = new Peer();
let remoteConnection = null;

peer.on('open', (id) => {
    const shortId = id.substring(0, 5).toUpperCase();
    peer.destroy(); 
    const customPeer = new Peer('YTKIDS-' + shortId); 
    
    customPeer.on('open', (newId) => {
        document.getElementById('tv-peer-id').innerText = newId;
    });

    customPeer.on('connection', (conn) => {
        conn.on('data', (data) => {
            if(data.command === 'playpause') togglePlay();
            if(data.command === 'next') nextVideo();
            if(data.command === 'prev') prevVideo();
        });
    });
});

// --- 2. Xử lý Chế độ & Load YouTube API ---
document.getElementById('btn-mode-tv').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('tv-view').classList.remove('hidden');
    loadYouTubeAPI(); // Bấm vào TV mới bắt đầu tải YouTube API
});

document.getElementById('btn-mode-remote').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('remote-view').classList.remove('hidden');
});

// Load Script động để chống lỗi khi chưa chọn chế độ
function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) {
        createPlayer();
        return;
    }
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function() {
    createPlayer();
}

function createPlayer() {
    player = new YT.Player('ytplayer', {
        videoId: videos[currentIndex].id,
        playerVars: {
            'autoplay': 1,
            'controls': 0,
            'rel': 0,
            'modestbranding': 1,
            'disablekb': 1,
            'fs': 0,
            'playsinline': 1
        },
        events: {
            'onReady': (e) => {
                e.target.playVideo();
                renderPlaylist();
            },
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerStateChange(event) {
    const playBtn = document.getElementById('btn-play-pause');
    if (event.data === YT.PlayerState.PLAYING) {
        playBtn.innerHTML = '⏸';
    } else if (event.data === YT.PlayerState.PAUSED) {
        playBtn.innerHTML = '▶';
    } else if (event.data === YT.PlayerState.ENDED) {
        nextVideo();
    }
}

function loadVideo(index) {
    if (index >= 0 && index < videos.length && player) {
        currentIndex = index;
        player.loadVideoById(videos[currentIndex].id);
        renderPlaylist();
    }
}

function togglePlay() {
    if(!player) return;
    if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
}

function nextVideo() {
    if(videos.length === 0) return;
    currentIndex = (currentIndex + 1) % videos.length;
    loadVideo(currentIndex);
}

function prevVideo() {
    if(videos.length === 0) return;
    currentIndex = (currentIndex - 1 + videos.length) % videos.length;
    loadVideo(currentIndex);
}

document.getElementById('btn-play-pause').addEventListener('click', togglePlay);
document.getElementById('btn-next').addEventListener('click', nextVideo);
document.getElementById('btn-prev').addEventListener('click', prevVideo);

// --- 3. Khóa & Mật khẩu ---
document.getElementById('btn-lock').addEventListener('click', () => {
    document.getElementById('controls-bar').classList.add('hidden');
    document.getElementById('btn-unlock').classList.remove('hidden');
});

document.getElementById('btn-unlock').addEventListener('click', () => {
    pinSuccessAction = 'unlock';
    openPinModal();
});

document.getElementById('btn-parent').addEventListener('click', () => {
    pinSuccessAction = 'parent';
    openPinModal();
});

function openPinModal() {
    document.getElementById('pin-modal').classList.remove('hidden');
    document.getElementById('pin-input').value = "";
    document.getElementById('pin-input').focus();
    if(player && player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
}

document.getElementById('btn-submit-pin').addEventListener('click', () => {
    if (document.getElementById('pin-input').value === getAdminPin()) {
        document.getElementById('pin-modal').classList.add('hidden');
        if (pinSuccessAction === 'unlock') {
            document.getElementById('controls-bar').classList.remove('hidden');
            document.getElementById('btn-unlock').classList.add('hidden');
            if(player) player.playVideo();
        } else if (pinSuccessAction === 'parent') {
            document.getElementById('parent-modal').classList.remove('hidden');
            document.getElementById('search-input').value = "";
            renderPlaylist();
        }
    } else {
        alert("Mã PIN sai!");
        document.getElementById('pin-input').value = "";
    }
});

document.getElementById('btn-cancel-pin').addEventListener('click', () => {
    document.getElementById('pin-modal').classList.add('hidden');
    if(player) player.playVideo();
});

document.getElementById('btn-close-parent').addEventListener('click', () => {
    document.getElementById('parent-modal').classList.add('hidden');
    if(player) player.playVideo();
});

// --- 4. Quản lý Video (Tìm kiếm & Thêm mới) ---
document.getElementById('search-input').addEventListener('input', (e) => {
    renderPlaylist(e.target.value.toLowerCase());
});

document.getElementById('btn-add-video').addEventListener('click', () => {
    const idInput = document.getElementById('new-vid-id').value.trim();
    const titleInput = document.getElementById('new-vid-title').value.trim();
    if(idInput && titleInput) {
        videos.push({ id: idInput, title: titleInput });
        document.getElementById('new-vid-id').value = '';
        document.getElementById('new-vid-title').value = '';
        renderPlaylist();
        alert("Đã thêm thành công!");
    }
});

function renderPlaylist(filterKeyword = "") {
    const playlistContainer = document.getElementById('playlist-container');
    playlistContainer.innerHTML = "";
    
    videos.forEach((video, index) => {
        // Chức năng lọc của ô tìm kiếm
        if (filterKeyword && !video.title.toLowerCase().includes(filterKeyword)) {
            return; 
        }

        const li = document.createElement('li');
        let status = index === currentIndex ? `<span class="playing-indicator">Đang phát</span>` : ``;
        li.innerHTML = `<span style="color: #aaa; margin-right: 10px;">▶</span> ${video.title} ${status}`;
        li.addEventListener('click', () => {
            loadVideo(index);
            document.getElementById('parent-modal').classList.add('hidden');
        });
        playlistContainer.appendChild(li);
    });
}

// --- 5. Logic Remote ---
document.getElementById('btn-connect-tv').addEventListener('click', () => {
    const targetId = document.getElementById('remote-target-id').value.trim().toUpperCase();
    if(!targetId) return;
    
    document.getElementById('remote-status').innerText = "Đang kết nối...";
    const tempPeer = new Peer();
    
    tempPeer.on('open', () => {
        remoteConnection = tempPeer.connect(targetId);
        remoteConnection.on('open', () => {
            document.getElementById('remote-setup').classList.add('hidden');
            document.getElementById('remote-controls').classList.remove('hidden');
        });
    });
});

document.getElementById('rem-play').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'playpause'}); });
document.getElementById('rem-next').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'next'}); });
document.getElementById('rem-prev').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'prev'}); });
document.getElementById('btn-disconnect').addEventListener('click', () => location.reload());