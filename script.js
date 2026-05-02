// ================= DỮ LIỆU & CẤU HÌNH =================
// Đã thêm nhiều video mẫu để bạn test chức năng Search
let defaultVideos = [
    { id: "XqZsoesa55w", title: "Baby Shark Dance" },
    { id: "_OBlgSz8sSM", title: "Nhạc Thiếu Nhi Sôi Động" },
    { id: "M7lc1UVf-VE", title: "Video Hoạt Hình Google" },
    { id: "aqz-KE-bpKQ", title: "Phim Hoạt Hình Chú Thỏ" },
    { id: "020g-0hhCQ8", title: "Học Chữ Cái Tiếng Anh" }
];

let videos = JSON.parse(localStorage.getItem('ytKidsWhitelist')) || defaultVideos;
const ADMIN_PIN = "8989";
const FIXED_TV_CODE = "1111"; // Mã TV mà bạn yêu cầu
const PEER_PREFIX = "YTKIDS-VUONG-"; // Tiền tố ẩn để mã 1111 không bị trùng với người khác trên server

let player;
let currentIndex = 0;
let screenTimer = null;

// ================= CHỌN CHẾ ĐỘ TỪ MÀN HÌNH CHỜ =================
document.getElementById('btn-mode-tv').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('tv-view').classList.remove('hidden');
    loadYouTubeAPI();
    setupPeerJS_TV();
});

document.getElementById('btn-mode-admin').addEventListener('click', () => {
    document.getElementById('pin-modal').classList.remove('hidden');
});

// Xác thực PIN để vào Admin
document.getElementById('btn-submit-pin').addEventListener('click', () => {
    if (document.getElementById('pin-input').value === ADMIN_PIN) {
        document.getElementById('pin-modal').classList.add('hidden');
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('remote-view').classList.remove('hidden');
        renderAdminPlaylist();
    } else {
        alert("Sai mã PIN!");
        document.getElementById('pin-input').value = "";
    }
});

document.getElementById('btn-cancel-pin').addEventListener('click', () => {
    document.getElementById('pin-modal').classList.add('hidden');
});

// ================= LOGIC TÌM KIẾM CHO BÉ =================
// Hàm này sẽ render lại danh sách dựa trên từ khóa gõ vào
function renderKidsPlaylist(keyword = "") {
    const container = document.getElementById('kids-playlist-container');
    container.innerHTML = "";
    
    // Lọc mảng video theo từ khóa (Không phân biệt hoa/thường)
    const filteredVideos = videos.filter(vid => 
        vid.title.toLowerCase().includes(keyword.toLowerCase())
    );

    if (filteredVideos.length === 0) {
        container.innerHTML = "<p style='padding: 20px; color: #aaa;'>Không tìm thấy video nào!</p>";
        return;
    }

    filteredVideos.forEach(vid => {
        // Tìm lại index gốc của video trong mảng 'videos' để khi click nó play đúng bài
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

// Bắt sự kiện mỗi khi người dùng gõ phím vào ô Search
document.getElementById('kids-search').addEventListener('input', (e) => {
    renderKidsPlaylist(e.target.value);
});

// ================= YOUTUBE PLAYER =================
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
        playerVars: { 'autoplay': 1, 'controls': 0, 'rel': 0, 'modestbranding': 1, 'disablekb': 1, 'fs': 0, 'origin': window.location.origin },
        events: {
            'onReady': (e) => { 
                e.target.playVideo(); 
                renderKidsPlaylist(); // Gọi render danh sách lần đầu
            },
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

// ================= ĐIỀU KHIỂN PEERJS (CỐ ĐỊNH MÃ 1111) =================
let remoteConnection = null;

// Khởi tạo phía TV
function setupPeerJS_TV() {
    // Đăng ký Peer với ID cố định: YTKIDS-VUONG-1111
    const tvPeer = new Peer(PEER_PREFIX + FIXED_TV_CODE); 
    
    tvPeer.on('connection', (conn) => {
        conn.on('data', (data) => {
            if(data.command === 'playpause') togglePlay();
            if(data.command === 'next') nextVideo();
            if(data.command === 'prev') prevVideo();
            if(data.command === 'setTimer') startScreenTimer(data.minutes);
        });
    });
    tvPeer.on('error', (err) => console.log("Lỗi mạng TV:", err));
}

// Khởi tạo phía Remote (Mobile)
document.getElementById('btn-connect-tv').addEventListener('click', () => {
    const inputCode = document.getElementById('remote-target-id').value.trim();
    if(!inputCode) return;
    
    document.getElementById('remote-status').innerText = "Đang kết nối đến TV...";
    const tempPeer = new Peer();
    
    tempPeer.on('open', () => {
        // Kết nối vào mã ẩn
        remoteConnection = tempPeer.connect(PEER_PREFIX + inputCode);
        
        remoteConnection.on('open', () => {
            document.getElementById('remote-controls').classList.remove('hidden');
            document.getElementById('remote-status').innerText = "";
        });
        
        remoteConnection.on('error', () => {
            document.getElementById('remote-status').innerText = "Không tìm thấy TV! Hãy chắc chắn TV đang mở ứng dụng.";
        });
    });
});

document.getElementById('rem-play').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'playpause'}); });
document.getElementById('rem-next').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'next'}); });
document.getElementById('rem-prev').addEventListener('click', () => { if(remoteConnection) remoteConnection.send({command: 'prev'}); });

// ================= TÍNH NĂNG ADMIN KHÁC =================
// Xử lý chuyển Tab trong Admin
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
    });
});

// Hẹn giờ TV
document.getElementById('btn-set-timer').addEventListener('click', () => {
    const mins = parseInt(document.getElementById('timer-input').value);
    if(mins > 0 && remoteConnection) {
        remoteConnection.send({command: 'setTimer', minutes: mins});
        alert(`Đã ra lệnh tắt TV sau ${mins} phút!`);
    } else {
        alert("Vui lòng kết nối TV trước khi hẹn giờ!");
    }
});

function startScreenTimer(minutes) {
    if(screenTimer) clearTimeout(screenTimer);
    screenTimer = setTimeout(() => {
        if(player) player.pauseVideo();
        document.getElementById('timeout-overlay').classList.remove('hidden');
    }, minutes * 60 * 1000);
}

// Quản lý Video Admin
function renderAdminPlaylist() {
    const ul = document.getElementById('admin-playlist');
    ul.innerHTML = "";
    videos.forEach((vid, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span><strong>${vid.title}</strong></span>
                        <button class="btn-primary" style="background:#ff4757" onclick="deleteVideo(${index})">Xóa</button>`;
        ul.appendChild(li);
    });
}

document.getElementById('btn-add-video').addEventListener('click', () => {
    const id = document.getElementById('new-vid-id').value.trim();
    const title = document.getElementById('new-vid-title').value.trim();
    if(id && title) {
        videos.push({ id, title });
        localStorage.setItem('ytKidsWhitelist', JSON.stringify(videos));
        renderAdminPlaylist();
        document.getElementById('new-vid-id').value = '';
        document.getElementById('new-vid-title').value = '';
        alert("Thêm thành công! Bạn hãy load lại trang trên TV để cập nhật.");
    }
});

window.deleteVideo = function(index) {
    if(confirm("Bạn có chắc muốn xóa?")) {
        videos.splice(index, 1);
        localStorage.setItem('ytKidsWhitelist', JSON.stringify(videos));
        renderAdminPlaylist();
    }
};
