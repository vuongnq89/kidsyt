// ================= TRẠNG THÁI & DỮ LIỆU CỤC BỘ =================
let videos = JSON.parse(localStorage.getItem('ytKidsWhitelist')) || [
    { id: "M7lc1UVf-VE", title: "Video Mẫu Google", thumb: "https://img.youtube.com/vi/M7lc1UVf-VE/mqdefault.jpg" },
    { id: "aqz-KE-bpKQ", title: "Big Buck Bunny", thumb: "https://img.youtube.com/vi/aqz-KE-bpKQ/mqdefault.jpg" }
];
const ADMIN_PIN = "8989"; // Khóa cứng theo yêu cầu, không cần hiển thị
let player;
let currentIndex = 0;
let isTVMode = false;
let screenTimer = null;

// ================= NHẬN DIỆN THIẾT BỊ =================
function detectDevice() {
    const ua = navigator.userAgent;
    // Nhận diện Mobile (iPhone, Android) -> Mở Remote/Admin
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
        return 'mobile';
    }
    // Mặc định PC/SmartTV -> Mở TV View
    return 'tv';
}

// ================= KHỞI TẠO APP =================
document.addEventListener('DOMContentLoaded', () => {
    const device = detectDevice();
    
    document.getElementById('btn-start').addEventListener('click', () => {
        document.getElementById('start-screen').classList.add('hidden');
        if (device === 'mobile') {
            document.getElementById('remote-view').classList.remove('hidden');
            renderAdminPlaylist();
        } else {
            isTVMode = true;
            document.getElementById('tv-view').classList.remove('hidden');
            loadYouTubeAPI();
            setupPeerJS_TV();
        }
    });

    // Xử lý Tabs Admin
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab).classList.add('active');
        });
    });
});

// ================= LOGIC YOUTUBE PLAYER (CHỈ CHẠY TRÊN TV/PC) =================
function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) { createPlayer(); return; }
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function() {
    createPlayer();
}

function createPlayer() {
    if(videos.length === 0) return;
    player = new YT.Player('ytplayer', {
        videoId: videos[currentIndex].id,
        playerVars: { 'autoplay': 1, 'controls': 0, 'rel': 0, 'modestbranding': 1, 'disablekb': 1, 'fs': 0 },
        events: {
            'onReady': (e) => { e.target.playVideo(); renderKidsPlaylist(); },
            'onStateChange': (e) => { if (e.data === YT.PlayerState.ENDED) nextVideo(); }
        }
    });
}

function loadVideo(index) {
    if (index >= 0 && index < videos.length && player) {
        currentIndex = index;
        player.loadVideoById(videos[currentIndex].id);
    }
}
function togglePlay() { if(player) player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo(); }
function nextVideo() { if(videos.length > 0) { currentIndex = (currentIndex + 1) % videos.length; loadVideo(currentIndex); } }
function prevVideo() { if(videos.length > 0) { currentIndex = (currentIndex - 1 + videos.length) % videos.length; loadVideo(currentIndex); } }

// ================= TÌM KIẾM & DANH SÁCH BÉ XEM (TV/PC) =================
function renderKidsPlaylist(keyword = "") {
    const container = document.getElementById('kids-playlist-container');
    container.innerHTML = "";
    
    videos.forEach((vid, index) => {
        if (keyword && !vid.title.toLowerCase().includes(keyword.toLowerCase())) return;
        
        const card = document.createElement('div');
        card.className = 'vid-card';
        card.tabIndex = 0;
        
        // Nếu không có thumb tự nhập, tự động lấy ảnh chất lượng vừa của YouTube
        const thumbUrl = vid.thumb || `https://img.youtube.com/vi/${vid.id}/mqdefault.jpg`;
        
        card.innerHTML = `
            <img src="${thumbUrl}" class="vid-thumb" alt="Thumbnail">
            <div class="vid-title">${vid.title}</div>
        `;
        
        const selectAction = () => loadVideo(index);
        card.addEventListener('click', selectAction);
        card.addEventListener('keydown', (e) => { if(e.key === 'Enter') selectAction(); });
        
        container.appendChild(card);
    });
}

document.getElementById('kids-search').addEventListener('input', (e) => renderKidsPlaylist(e.target.value));

// ================= BẢO MẬT: NÚT LOGO BÍ MẬT 5 CLICK (TRÊN TV) =================
let logoClickCount = 0;
let logoClickTimer;

document.getElementById('secret-admin-logo').addEventListener('click', () => {
    logoClickCount++;
    clearTimeout(logoClickTimer);
    
    if (logoClickCount >= 5) {
        logoClickCount = 0; // Reset
        document.getElementById('pin-modal').classList.remove('hidden');
        document.getElementById('pin-input').value = "";
        document.getElementById('pin-input').focus();
        if(player) player.pauseVideo();
    } else {
        // Hết 2 giây không bấm đủ 5 lần thì reset
        logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 2000);
    }
});

document.getElementById('btn-submit-pin').addEventListener('click', () => {
    if (document.getElementById('pin-input').value === ADMIN_PIN) {
        document.getElementById('pin-modal').classList.add('hidden');
        document.getElementById('tv-info-modal').classList.remove('hidden'); // Mở bảng chứa Mã TV
    } else {
        alert("Sai mã PIN!");
        document.getElementById('pin-input').value = "";
    }
});

document.getElementById('btn-cancel-pin').addEventListener('click', () => {
    document.getElementById('pin-modal').classList.add('hidden');
    if(player) player.playVideo();
});

document.getElementById('btn-close-tv-info').addEventListener('click', () => {
    document.getElementById('tv-info-modal').classList.add('hidden');
    if(player) player.playVideo();
});

// ================= ĐIỀU KHIỂN & KẾT NỐI (PEER JS) =================
const peer = new Peer();
let tvPeerId = "";
let remoteConnection = null;

// Khởi tạo PeerJS cho TV
function setupPeerJS_TV() {
    peer.on('open', (id) => {
        const shortId = id.substring(0, 5).toUpperCase();
        peer.destroy(); 
        const customPeer = new Peer('YTKIDS-' + shortId); 
        
        customPeer.on('open', (newId) => {
            tvPeerId = newId;
            document.getElementById('display-tv-id').innerText = newId; // Gắn ID vào modal bí mật
        });

        customPeer.on('connection', (conn) => {
            conn.on('data', (data) => {
                if(data.command === 'playpause') togglePlay();
                if(data.command === 'next') nextVideo();
                if(data.command === 'prev') prevVideo();
                if(data.command === 'setTimer') startScreenTimer(data.minutes);
            });
        });
    });
}

// Logic cho Mobile Remote kết nối đến TV
document.getElementById('btn-connect-tv').addEventListener('click', () => {
    const targetId = document.getElementById('remote-target-id').value.trim().toUpperCase();
    if(!targetId) return;
    
    document.getElementById('remote-status').innerText = "Đang kết nối...";
    const tempPeer = new Peer();
    
    tempPeer.on('open', () => {
        remoteConnection = tempPeer.connect(targetId);
        remoteConnection.on('open', () => {
            document.getElementById('remote-controls').classList.remove('hidden');
            document.getElementById('remote-status').innerText = "";
        });
        remoteConnection.on('error', () => {
            document.getElementById('remote-status').innerText = "Lỗi! Kiểm tra lại mã.";
        });
    });
});

document.getElementById('rem-play').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'playpause'}); });
document.getElementById('rem-next').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'next'}); });
document.getElementById('rem-prev').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'prev'}); });

// ================= CHÍNH SÁCH: HẸN GIỜ (SCREEN TIME) =================
document.getElementById('btn-set-timer').addEventListener('click', () => {
    const mins = parseInt(document.getElementById('timer-input').value);
    if(mins > 0 && remoteConnection) {
        remoteConnection.send({command: 'setTimer', minutes: mins});
        alert(`Đã đặt giờ tắt TV sau ${mins} phút!`);
        document.getElementById('timer-input').value = "";
    } else {
        alert("Vui lòng kết nối TV và nhập số phút hợp lệ.");
    }
});

function startScreenTimer(minutes) {
    if(screenTimer) clearTimeout(screenTimer);
    screenTimer = setTimeout(() => {
        if(player) player.pauseVideo();
        document.getElementById('timeout-overlay').classList.remove('hidden');
    }, minutes * 60 * 1000);
}

// ================= QUẢN LÝ VIDEO (ADMIN TRÊN MOBILE) =================
function renderAdminPlaylist() {
    const ul = document.getElementById('admin-playlist');
    ul.innerHTML = "";
    videos.forEach((vid, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span><strong>${vid.title}</strong></span>
            <button class="btn-primary btn-delete" onclick="deleteVideo(${index})">Xóa</button>
        `;
        ul.appendChild(li);
    });
}

document.getElementById('btn-add-video').addEventListener('click', () => {
    const id = document.getElementById('new-vid-id').value.trim();
    const title = document.getElementById('new-vid-title').value.trim();
    const thumb = document.getElementById('new-vid-thumb').value.trim();
    
    if(id && title) {
        videos.push({ id, title, thumb });
        localStorage.setItem('ytKidsWhitelist', JSON.stringify(videos));
        renderAdminPlaylist();
        document.getElementById('new-vid-id').value = '';
        document.getElementById('new-vid-title').value = '';
        document.getElementById('new-vid-thumb').value = '';
        alert("Thêm thành công! Khởi động lại trang trên TV để cập nhật.");
    }
});

window.deleteVideo = function(index) {
    if(confirm("Xóa video này khỏi Whitelist?")) {
        videos.splice(index, 1);
        localStorage.setItem('ytKidsWhitelist', JSON.stringify(videos));
        renderAdminPlaylist();
    }
};