// State management
const state = {
    currentStep: 0,
    roomType: null,
    style: null,
    color: null,
    selectedRug: null,
    selectedRoom: null,
    uploadedRoomFile: null
};

// Steps: 0=welcome, 1=roomType, 2=style, 3=color, 4=rugs, 5=room, 6=generate
const steps = ['welcome', 'roomType', 'style', 'color', 'rugs', 'room', 'generate'];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    startChatbot();
    setupEventListeners();
});

function startChatbot() {
    addBotMessage('Xin chào! Em là Trang, nhân viên tư vấn của công ty Thảm Hán Long. Em sẽ giúp anh/chị chọn thảm phù hợp cho phòng của anh/chị.');
    setTimeout(() => {
        showStep('roomType');
        addBotMessage('Anh/chị muốn đặt thảm cho loại phòng nào?');
    }, 1000);
}

function addBotMessage(text) {
    const messagesDiv = document.getElementById('chatbot-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'bot-message';
    messageDiv.textContent = text;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showStep(stepName) {
    // Hide all steps
    document.querySelectorAll('.step-container').forEach(el => el.style.display = 'none');
    
    const stepMap = {
        'roomType': 'step-room-type',
        'style': 'step-style',
        'color': 'step-color',
        'rugs': 'step-rugs',
        'room': 'step-room',
        'generate': 'step-generate'
    };
    
    const stepId = stepMap[stepName];
    if (stepId) {
        document.getElementById(stepId).style.display = 'block';
    }
}

function setupEventListeners() {
    // Step 1: Loại phòng
    document.querySelectorAll('#step-room-type .option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.roomType = btn.dataset.value;
            addBotMessage(`Bạn đã chọn: ${btn.textContent}`);
            setTimeout(() => {
                showStep('style');
                addBotMessage('Anh/chị thích phong cách nào?');
            }, 500);
        });
    });

    // Step 2: Phong cách
    document.querySelectorAll('#step-style .option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.style = btn.dataset.value;
            addBotMessage(`Bạn đã chọn: ${btn.textContent}`);
            setTimeout(() => {
                showStep('color');
                addBotMessage('Anh/chị muốn tông màu như thế nào?');
            }, 500);
        });
    });

    // Step 3: Tông màu
    document.querySelectorAll('#step-color .option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.color = btn.dataset.value;
            addBotMessage(`Anh/chị đã chọn: ${btn.textContent}`);
            setTimeout(() => {
                loadRugs();
                showStep('rugs');
                addBotMessage('Anh/chị muốn xem các mẫu thảm phù hợp không? Dưới đây là các gợi ý:');
            }, 500);
        });
    });

    // Step 4: Chọn thảm
    // (Rugs sẽ được load và click handler được thêm trong loadRugs())

    // Step 5: Chọn ảnh phòng
    document.getElementById('btn-choose-room-sample').addEventListener('click', () => {
        document.getElementById('upload-room-container').style.display = 'none';
        document.getElementById('rooms-list-container').style.display = 'block';
        loadRooms();
    });

    document.getElementById('btn-upload-room').addEventListener('click', () => {
        document.getElementById('rooms-list-container').style.display = 'none';
        document.getElementById('upload-room-container').style.display = 'block';
        document.getElementById('room-file-input').click();
    });

    document.getElementById('room-file-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate
        const allowed = ['image/jpeg', 'image/png', 'image/heic'];
        if (!allowed.includes(file.type)) {
            alert('Chỉ chấp nhận JPG/PNG/HEIC!');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            alert('Ảnh phòng phải nhỏ hơn 10MB!');
            return;
        }

        state.uploadedRoomFile = file;
        
        // Preview
        let previewUrl;
        if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
            try {
                const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg' });
                previewUrl = URL.createObjectURL(convertedBlob);
            } catch (err) {
                console.error('HEIC convert error:', err);
                previewUrl = URL.createObjectURL(file);
            }
        } else {
            previewUrl = URL.createObjectURL(file);
        }

        document.getElementById('preview-room-img').src = previewUrl;
        document.getElementById('room-preview').style.display = 'block';
        addBotMessage('Bạn đã tải ảnh phòng lên thành công!');
        
        setTimeout(() => {
            showStep('generate');
        }, 500);
    });

    // Step 6: Tạo ảnh
    document.getElementById('btn-generate').addEventListener('click', generateImage);

    // Reset
    document.getElementById('reset-btn').addEventListener('click', () => {
        resetFlow();
    });

    // Popup close handlers
    document.getElementById('popup-close').addEventListener('click', () => {
        hideRateLimitPopup();
    });

    document.getElementById('popup-ok').addEventListener('click', () => {
        hideRateLimitPopup();
    });

    // Close popup when clicking outside
    document.getElementById('rate-limit-popup').addEventListener('click', (e) => {
        if (e.target.id === 'rate-limit-popup') {
            hideRateLimitPopup();
        }
    });
}

function showRateLimitPopup(message) {
    const popup = document.getElementById('rate-limit-popup');
    const popupMessage = document.getElementById('popup-message');
    popupMessage.textContent = message;
    popup.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function hideRateLimitPopup() {
    const popup = document.getElementById('rate-limit-popup');
    popup.style.display = 'none';
    document.body.style.overflow = ''; // Restore scrolling
}

async function loadRugs() {
    try {
        const resp = await fetch('/api/rugs');
        const data = await resp.json();
        
        const rugsList = document.getElementById('rugs-list');
        rugsList.innerHTML = '';

        if (data.images && data.images.length > 0) {
            data.images.forEach(rug => {
                const rugDiv = document.createElement('div');
                rugDiv.className = 'image-item';
                rugDiv.innerHTML = `<img src="${rug.url}" alt="${rug.filename}" data-url="${rug.url}" data-filename="${rug.filename}">`;
                rugDiv.addEventListener('click', () => {
                    // Remove previous selection
                    document.querySelectorAll('#rugs-list .image-item').forEach(el => el.classList.remove('selected'));
                    rugDiv.classList.add('selected');
                    state.selectedRug = { url: rug.url, filename: rug.filename };
                    addBotMessage(`Bạn đã chọn mẫu thảm: ${rug.filename}`);
                    setTimeout(() => {
                        showStep('room');
                        addBotMessage('Bây giờ bạn muốn chọn ảnh phòng như thế nào?');
                    }, 500);
                });
                rugsList.appendChild(rugDiv);
            });
        } else {
            rugsList.innerHTML = '<p>Không có ảnh thảm nào.</p>';
        }
    } catch (error) {
        console.error('Error loading rugs:', error);
        addBotMessage('Có lỗi khi tải danh sách thảm. Vui lòng thử lại.');
    }
}

async function loadRooms() {
    try {
        // Build query params từ state
        const params = new URLSearchParams();
        if (state.roomType) {
            params.append('roomType', state.roomType);
        }
        if (state.color) {
            params.append('color', state.color);
        }
        if (state.style) {
            params.append('style', state.style);
        }
        
        const queryString = params.toString();
        const url = queryString ? `/api/rooms?${queryString}` : '/api/rooms';
        
        const resp = await fetch(url);
        const data = await resp.json();
        
        const roomsList = document.getElementById('rooms-list');
        roomsList.innerHTML = '';

        if (data.images && data.images.length > 0) {
            data.images.forEach(room => {
                const roomDiv = document.createElement('div');
                roomDiv.className = 'image-item';
                roomDiv.innerHTML = `<img src="${room.url}" alt="${room.filename}" data-url="${room.url}" data-filename="${room.filename}">`;
                roomDiv.addEventListener('click', () => {
                    document.querySelectorAll('#rooms-list .image-item').forEach(el => el.classList.remove('selected'));
                    roomDiv.classList.add('selected');
                    state.selectedRoom = { url: room.url, filename: room.filename };
                    state.uploadedRoomFile = null; // Clear uploaded file if any
                    addBotMessage(`Bạn đã chọn ảnh phòng: ${room.filename}`);
                    setTimeout(() => {
                        showStep('generate');
                    }, 500);
                });
                roomsList.appendChild(roomDiv);
            });
        } else {
            roomsList.innerHTML = '<p>Không có ảnh phòng mẫu nào.</p>';
        }
    } catch (error) {
        console.error('Error loading rooms:', error);
        addBotMessage('Có lỗi khi tải danh sách phòng. Vui lòng thử lại.');
    }
}

async function generateImage() {
    if (!state.selectedRug) {
        alert('Vui lòng chọn thảm!');
        return;
    }

    if (!state.selectedRoom && !state.uploadedRoomFile) {
        alert('Vui lòng chọn hoặc tải ảnh phòng!');
        return;
    }

    // Disable button và show spinner
    const btnGenerate = document.getElementById('btn-generate');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const statusMsg = document.getElementById('status-message');

    btnGenerate.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
    progressContainer.style.display = 'block';
    statusMsg.textContent = 'Đang tạo ảnh AI...';
    statusMsg.style.display = 'block';
    statusMsg.style.color = 'var(--text)';

    // Progress từ 0-90% trong 30 giây (mỗi 10% = 3.33 giây)
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
        if (currentProgress < 90) {
            currentProgress += 10;
            progressFill.style.width = currentProgress + '%';
            progressText.textContent = currentProgress + '%';
        }
    }, 3333); // 3.33 giây = 3333ms

    try {
        // Download rug image if needed
        let rugFile;
        if (state.selectedRug.url.startsWith('/')) {
            const rugResp = await fetch(state.selectedRug.url);
            const rugBlob = await rugResp.blob();
            rugFile = new File([rugBlob], state.selectedRug.filename, { type: rugBlob.type });
        } else {
            rugFile = state.selectedRug;
        }

        // Prepare room file
        let roomFile;
        if (state.uploadedRoomFile) {
            roomFile = state.uploadedRoomFile;
        } else {
            // Download room image
            const roomResp = await fetch(state.selectedRoom.url);
            const roomBlob = await roomResp.blob();
            roomFile = new File([roomBlob], state.selectedRoom.filename, { type: roomBlob.type });
        }

        // Create FormData
        const form = new window.FormData();
        form.append('room', roomFile);
        form.append('rug', rugFile);

        // Upload
        const resp = await fetch('/upload', {
            method: 'POST',
            body: form
        });

        // Khi API trả về, set progress lên 100%
        clearInterval(progressInterval);
        currentProgress = 100;
        progressFill.style.width = '100%';
        progressText.textContent = '100%';

        const json = await resp.json();

        // Kiểm tra rate limit (status 429)
        if (resp.status === 429 || (json.code === 'rate_limit')) {
            // Reset button state
            btnGenerate.disabled = false;
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';
            progressContainer.style.display = 'none';
            
            // Hiển thị popup
            showRateLimitPopup(json.message || 'Bạn đã sử dụng tối đa 3 lần trong hôm nay. Vui lòng thử lại ngày mai hoặc liên hệ tư vấn.');
            return;
        }

        if (!json.success) {
            // Reset button state
            btnGenerate.disabled = false;
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';
            progressContainer.style.display = 'none';
            statusMsg.textContent = json.message || 'Có lỗi xảy ra';
            statusMsg.style.color = 'red';
            return;
        }

        // Show result
        const imgUrl = 'data:image/jpeg;base64,' + json.image;
        document.getElementById('result-image').src = imgUrl;
        document.getElementById('download-btn').href = imgUrl;
        
        document.getElementById('chatbot-container').style.display = 'none';
        document.getElementById('result-container').style.display = 'block';
        statusMsg.textContent = 'Hoàn tất!';
        statusMsg.style.color = 'green';

        // Reset button state (ẩn spinner và progress)
        btnGenerate.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
        progressContainer.style.display = 'none';

    } catch (error) {
        console.error('Generate error:', error);
        
        // Reset button state
        clearInterval(progressInterval);
        btnGenerate.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
        progressContainer.style.display = 'none';
        
        statusMsg.textContent = 'Có lỗi xảy ra: ' + error.message;
        statusMsg.style.color = 'red';
    }
}

function resetFlow() {
    // Reset state
    state.currentStep = 0;
    state.roomType = null;
    state.style = null;
    state.color = null;
    state.selectedRug = null;
    state.selectedRoom = null;
    state.uploadedRoomFile = null;

    // Reset UI
    document.getElementById('chatbot-messages').innerHTML = '';
    document.getElementById('result-container').style.display = 'none';
    document.getElementById('chatbot-container').style.display = 'block';
    document.getElementById('rooms-list-container').style.display = 'none';
    document.getElementById('upload-room-container').style.display = 'none';
    document.getElementById('room-preview').style.display = 'none';
    document.getElementById('status-message').style.display = 'none';
    document.querySelectorAll('.image-item').forEach(el => el.classList.remove('selected'));
    
    // Reset button và progress
    const btnGenerate = document.getElementById('btn-generate');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    btnGenerate.disabled = false;
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';
    progressContainer.style.display = 'none';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    // Restart
    startChatbot();
}
