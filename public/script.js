// State management
const state = {
    currentStep: 0,
    roomType: null,
    style: null,
    selectedRug: null,
    uploadedRugFile: null,
    selectedRoom: null,
    uploadedRoomFile: null
};

// Steps: 0=welcome, 1=roomType, 2=style, 3=rugs, 4=room, 5=generate
const steps = ['welcome', 'roomType', 'style', 'rugs', 'room', 'generate'];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await fetchAndRenderOptions();
    startChatbot();
    setupEventListeners();
});

async function fetchAndRenderOptions() {
    try {
        const res = await fetch('/api/options');
        const data = await res.json();
        if (data.success && data.data) {
             renderButtons('options-room-type', data.data.rooms);
             renderButtons('options-style', data.data.styles);
        }
    } catch (e) {
        console.error('Failed to fetch options', e);
        // Fallback or show error
    }
}

function renderButtons(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    // Sort items if needed, or keep order
    items.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.dataset.value = normalizeString(item);
        btn.textContent = item;
        container.appendChild(btn);
    });
}

function normalizeString(str) {
    return str.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '');
}

function startChatbot() {
    addBotMessage('Xin chào! Em là AiCarpet, nhân viên tư vấn của công ty Thảm Hán Long. Em sẽ giúp anh/chị chọn thảm phù hợp cho phòng của anh/chị.');
    setTimeout(() => {
        showStep('roomType');
        ensureBotQuestion('roomType', 'Anh/chị muốn đặt thảm cho loại phòng nào?');
    }, 1000);
}

function addBotMessage(text) {
    const messagesDiv = document.getElementById('chatbot-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'bot-message-group';
    
    const bubble = document.createElement('div');
    bubble.className = 'bot-message';
    bubble.textContent = text;
    
    messageDiv.appendChild(bubble);
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function getBotQuestionElement(key) {
    const messagesDiv = document.getElementById('chatbot-messages');
    const matches = messagesDiv.querySelectorAll(`.bot-message-group[data-question-key="${key}"]`);
    if (matches.length === 0) return null;
    return matches[matches.length - 1];
}

function getStepContainerId(key) {
    const map = {
        'roomType': 'step-room-type',
        'style': 'step-style',
        'rug': 'step-rugs',
        'rugs': 'step-rugs',
        'room': 'step-room',
        'generate': 'step-generate'
    };
    return map[key];
}

function ensureBotQuestion(key, text) {
    let messageDiv = getBotQuestionElement(key);
    if (!messageDiv) {
        const messagesDiv = document.getElementById('chatbot-messages');
        messageDiv = document.createElement('div');
        messageDiv.className = 'bot-message-group';
        messageDiv.dataset.questionKey = key;

        const textDiv = document.createElement('div');
        textDiv.className = 'bot-message';
        textDiv.textContent = text;
        
        messageDiv.appendChild(textDiv);
        messagesDiv.appendChild(messageDiv);
    }

    // Move options container into the message group
    const stepId = getStepContainerId(key);
    if (stepId) {
        const container = document.getElementById(stepId);
        if (container && container.parentElement !== messageDiv) {
            messageDiv.appendChild(container);
            container.style.display = 'block';
            
            // Scroll to bottom
            const messagesDiv = document.getElementById('chatbot-messages');
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }

    return messageDiv;
}

function updateBotSelection(key, selectionText) {
    // No-op: We display selection via button highlighting
}

function clearBotSelection(key) {
    // No-op
}

function showStep(stepName) {
    const orderedSteps = ['roomType', 'style', 'rugs', 'room', 'generate'];
    const targetIndex = orderedSteps.indexOf(stepName);
    if (targetIndex === -1) return;

    state.currentStep = targetIndex + 1;
    updateGenerateButtonState();
}

function setupEventListeners() {
    // Step 1: Loại phòng
    document.querySelectorAll('#step-room-type .option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const nextValue = btn.dataset.value;
            state.roomType = nextValue;
            setOptionSelected('#step-room-type', btn);
            updateBotSelection('roomType', btn.textContent);
            const btnChooseRoomSample = document.getElementById('btn-choose-room-sample');
            if (btnChooseRoomSample && btnChooseRoomSample.classList.contains('selected')) {
                loadRooms();
            }
            setTimeout(() => {
                if (state.currentStep <= 1) {
                    showStep('style');
                    ensureBotQuestion('style', 'Anh/chị thích phong cách nào?');
                }
            }, 500);
        });
    });

    // Step 2: Phong cách
    document.querySelectorAll('#step-style .option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const nextValue = btn.dataset.value;
            state.style = nextValue;
            setOptionSelected('#step-style', btn);
            updateBotSelection('style', btn.textContent);
            
            // Reload rugs if rug sample choice is active
            const btnChooseRugSample = document.getElementById('btn-choose-rug-sample');
            if (btnChooseRugSample && btnChooseRugSample.classList.contains('selected')) {
                loadRugs();
            }

            setTimeout(() => {
                if (state.currentStep <= 2) {
                    showStep('rugs');
                    ensureBotQuestion('rug', 'Anh/chị muốn xem các mẫu thảm phù hợp không? Dưới đây là các gợi ý:');
                    if (!state.selectedRug && !state.uploadedRugFile) {
                        const rugsListContainer = document.getElementById('rugs-list-container');
                        if (rugsListContainer) rugsListContainer.style.display = 'none';
                        const uploadRugContainer = document.getElementById('upload-rug-container');
                        if (uploadRugContainer) uploadRugContainer.style.display = 'none';
                        const rugPreview = document.getElementById('rug-preview');
                        if (rugPreview) rugPreview.style.display = 'none';
                        setRugChoiceSelected('');
                    }
                }
            }, 500);
        });
    });

    // Step 4: Chọn thảm
    document.getElementById('btn-choose-rug-sample').addEventListener('click', () => {
        document.getElementById('upload-rug-container').style.display = 'none';
        document.getElementById('rugs-list-container').style.display = 'block';
        setRugChoiceSelected('btn-choose-rug-sample');
        state.uploadedRugFile = null;
        document.getElementById('rug-preview').style.display = 'none';
        ensureBotQuestion('rug', 'Anh/chị muốn xem các mẫu thảm phù hợp không? Dưới đây là các gợi ý:');
        clearBotSelection('rug');
        updateGenerateButtonState();
        loadRugs();
    });

    document.getElementById('btn-upload-rug').addEventListener('click', () => {
        document.getElementById('rugs-list-container').style.display = 'none';
        document.getElementById('upload-rug-container').style.display = 'block';
        setRugChoiceSelected('btn-upload-rug');
        state.selectedRug = null;
        document.querySelectorAll('#rugs-list .image-item').forEach(el => el.classList.remove('selected'));
        ensureBotQuestion('rug', 'Anh/chị muốn xem các mẫu thảm phù hợp không? Dưới đây là các gợi ý:');
        clearBotSelection('rug');
        updateGenerateButtonState();
        document.getElementById('rug-file-input').click();
    });

    document.getElementById('rug-file-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
        if (!allowed.includes(file.type) && !file.name.toLowerCase().endsWith('.heic')) {
            alert('Chỉ chấp nhận JPG/PNG/WEBP/HEIC!');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('Ảnh thảm phải nhỏ hơn 5MB!');
            return;
        }

        state.uploadedRugFile = file;
        state.selectedRug = null;
        document.querySelectorAll('#rugs-list .image-item').forEach(el => el.classList.remove('selected'));

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

        document.getElementById('preview-rug-img').src = previewUrl;
        document.getElementById('rug-preview').style.display = 'block';
        ensureBotQuestion('rug', 'Anh/chị muốn xem các mẫu thảm phù hợp không? Dưới đây là các gợi ý:');
        updateBotSelection('rug', file.name);
        updateGenerateButtonState();

        setTimeout(() => {
            showStep('room');
            ensureBotQuestion('room', 'Bây giờ bạn muốn chọn ảnh phòng như thế nào?');
            const roomsListContainer = document.getElementById('rooms-list-container');
            if (roomsListContainer) roomsListContainer.style.display = 'none';
            const uploadRoomContainer = document.getElementById('upload-room-container');
            if (uploadRoomContainer) uploadRoomContainer.style.display = 'none';
            const roomPreview = document.getElementById('room-preview');
            if (roomPreview) roomPreview.style.display = 'none';
            setChoiceSelected('');
        }, 500);
    });

    // Step 5: Chọn ảnh phòng
    document.getElementById('btn-choose-room-sample').addEventListener('click', () => {
        document.getElementById('upload-room-container').style.display = 'none';
        document.getElementById('rooms-list-container').style.display = 'block';
        setChoiceSelected('btn-choose-room-sample');
        state.uploadedRoomFile = null;
        document.getElementById('room-preview').style.display = 'none';
        ensureBotQuestion('room', 'Bây giờ bạn muốn chọn ảnh phòng như thế nào?');
        clearBotSelection('room');
        updateGenerateButtonState();
        loadRooms();
    });

    document.getElementById('btn-upload-room').addEventListener('click', () => {
        document.getElementById('rooms-list-container').style.display = 'none';
        document.getElementById('upload-room-container').style.display = 'block';
        setChoiceSelected('btn-upload-room');
        state.selectedRoom = null;
        document.querySelectorAll('#rooms-list .image-item').forEach(el => el.classList.remove('selected'));
        ensureBotQuestion('room', 'Bây giờ bạn muốn chọn ảnh phòng như thế nào?');
        clearBotSelection('room');
        updateGenerateButtonState();
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
        state.selectedRoom = null;
        document.querySelectorAll('#rooms-list .image-item').forEach(el => el.classList.remove('selected'));
        
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
        ensureBotQuestion('room', 'Bây giờ bạn muốn chọn ảnh phòng như thế nào?');
        updateBotSelection('room', file.name);
        updateGenerateButtonState();
        
        setTimeout(() => {
            showStep('generate');
            ensureBotQuestion('generate', 'Anh/chị bấm \"✨ Click để tạo ảnh\" để tạo ảnh thảm trong phòng của anh/chị nhé!');
        }, 500);
    });

    // Step 6: Tạo ảnh
    document.getElementById('btn-generate').addEventListener('click', generateImage);

    // Reset
    document.getElementById('reset-btn').addEventListener('click', () => {
        resetFlow();
    });

    document.getElementById('result-close').addEventListener('click', () => {
        hideResultPopup();
    });

    document.getElementById('result-container').addEventListener('click', (e) => {
        if (e.target && e.target.id === 'result-container') {
            hideResultPopup();
        }
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

function hideResultPopup() {
    const resultContainer = document.getElementById('result-container');
    if (resultContainer) resultContainer.style.display = 'none';
    document.body.style.overflow = '';
    if (resultResizeHandler) {
        window.removeEventListener('resize', resultResizeHandler);
        resultResizeHandler = null;
    }
}

let resultResizeHandler = null;

function fitResultImage() {
    const img = document.getElementById('result-image');
    const box = document.querySelector('#result-container .result-image-box');
    if (!img || !box) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const maxW = box.clientWidth || 0;
    const maxH = Math.min(600, Math.floor(window.innerHeight * 0.75));
    if (maxW <= 0 || maxH <= 0) return;

    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = Math.floor(img.naturalWidth * scale);
    const h = Math.floor(img.naturalHeight * scale);

    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
}

function showResultPopup() {
    const resultContainer = document.getElementById('result-container');
    if (resultContainer) resultContainer.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (!resultResizeHandler) {
        resultResizeHandler = () => fitResultImage();
        window.addEventListener('resize', resultResizeHandler);
    }
    fitResultImage();
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
        const params = new URLSearchParams();
        if (state.style) {
            params.append('style', state.style);
        }
        const queryString = params.toString();
        const url = queryString ? `/api/rugs?${queryString}` : '/api/rugs';

        const resp = await fetch(url);
        const data = await resp.json();
        
        const rugsList = document.getElementById('rugs-list');
        rugsList.innerHTML = '';

        const rugsListContainer = document.getElementById('rugs-list-container');
        if (rugsListContainer) {
            rugsListContainer.style.display = 'block';
        }

        if (data.images && data.images.length > 0) {
            data.images.forEach(rug => {
                const rugDiv = document.createElement('div');
                rugDiv.className = 'image-item';
                // Display image and name
                const displayName = rug.name || rug.code || rug.filename;
                rugDiv.innerHTML = `
                    <div class="img-wrapper">
                        <img src="${rug.url}" alt="${displayName}" loading="lazy" onerror="this.src='https://placehold.co/300x300?text=No+Image'">
                    </div>
                    <div class="img-name">${displayName}</div>
                `;
                
                if (state.selectedRug && state.selectedRug.url === rug.url) {
                    rugDiv.classList.add('selected');
                }
                
                rugDiv.addEventListener('click', () => {
                    // Remove previous selection
                    document.querySelectorAll('#rugs-list .image-item').forEach(el => el.classList.remove('selected'));
                    rugDiv.classList.add('selected');
                    
                    // Ensure filename has extension for File object creation later
                    let filename = rug.filename;
                    if (filename && !filename.includes('.')) {
                        const ext = rug.url.split('.').pop();
                        if (ext && ext.length < 5) {
                            filename = `${filename}.${ext}`;
                        } else {
                            filename = `${filename}.jpg`; // Default
                        }
                    }

                    state.selectedRug = { url: rug.url, filename: filename };
                    state.uploadedRugFile = null;
                    const rugPreview = document.getElementById('rug-preview');
                    if (rugPreview) rugPreview.style.display = 'none';
                    clearRoomSelection();
                    updateGenerateButtonState();
                    updateBotSelection('rug', displayName);
                    setTimeout(() => {
                        showStep('room');
                        ensureBotQuestion('room', 'Bây giờ bạn muốn chọn ảnh phòng như thế nào?');
                        const roomsListContainer = document.getElementById('rooms-list-container');
                        if (roomsListContainer) roomsListContainer.style.display = 'none';
                        const uploadRoomContainer = document.getElementById('upload-room-container');
                        if (uploadRoomContainer) uploadRoomContainer.style.display = 'none';
                        const roomPreview = document.getElementById('room-preview');
                        if (roomPreview) roomPreview.style.display = 'none';
                        setChoiceSelected('');
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
                if (state.selectedRoom && state.selectedRoom.filename === room.filename) {
                    roomDiv.classList.add('selected');
                }
                roomDiv.addEventListener('click', () => {
                    document.querySelectorAll('#rooms-list .image-item').forEach(el => el.classList.remove('selected'));
                    roomDiv.classList.add('selected');
                    state.selectedRoom = { url: room.url, filename: room.filename };
                    state.uploadedRoomFile = null; // Clear uploaded file if any
                    document.getElementById('room-preview').style.display = 'none';
                    updateGenerateButtonState();
                    ensureBotQuestion('room', 'Bây giờ bạn muốn chọn ảnh phòng như thế nào?');
                    updateBotSelection('room', room.filename);
                    setTimeout(() => {
                        showStep('generate');
                        ensureBotQuestion('generate', 'Anh/chị bấm \"✨ Click để tạo ảnh\" để tạo ảnh thảm trong phòng của anh/chị nhé!');
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

function setOptionSelected(stepSelector, selectedBtn) {
    document.querySelectorAll(`${stepSelector} .option-btn`).forEach(btn => btn.classList.remove('selected'));
    selectedBtn.classList.add('selected');
}

function clearOptionSelections(stepSelector) {
    document.querySelectorAll(`${stepSelector} .option-btn`).forEach(btn => btn.classList.remove('selected'));
}

function clearRugSelection() {
    state.selectedRug = null;
    state.uploadedRugFile = null;
    document.querySelectorAll('#rugs-list .image-item').forEach(el => el.classList.remove('selected'));
    const rugsList = document.getElementById('rugs-list');
    if (rugsList) rugsList.innerHTML = '';
    const rugPreview = document.getElementById('rug-preview');
    if (rugPreview) rugPreview.style.display = 'none';
    const rugInput = document.getElementById('rug-file-input');
    if (rugInput) rugInput.value = '';
    clearBotSelection('rug');
    updateGenerateButtonState();
}

function clearRoomSelection() {
    state.selectedRoom = null;
    state.uploadedRoomFile = null;
    document.querySelectorAll('#rooms-list .image-item').forEach(el => el.classList.remove('selected'));
    const roomPreview = document.getElementById('room-preview');
    if (roomPreview) roomPreview.style.display = 'none';
    const roomInput = document.getElementById('room-file-input');
    if (roomInput) roomInput.value = '';
    clearBotSelection('room');
    updateGenerateButtonState();
}

function setChoiceSelected(buttonId) {
    const ids = ['btn-choose-room-sample', 'btn-upload-room'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === buttonId) el.classList.add('selected');
        else el.classList.remove('selected');
    });
}

function setRugChoiceSelected(buttonId) {
    const ids = ['btn-choose-rug-sample', 'btn-upload-rug'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === buttonId) el.classList.add('selected');
        else el.classList.remove('selected');
    });
}

function updateGenerateButtonState() {
    const btnGenerate = document.getElementById('btn-generate');
    if (!btnGenerate) return;
    const hasRug = !!state.selectedRug || !!state.uploadedRugFile;
    const hasRoom = !!state.selectedRoom || !!state.uploadedRoomFile;
    const ready = hasRug && hasRoom;
    btnGenerate.disabled = !ready;
}

async function generateImage() {
    if (!state.selectedRug && !state.uploadedRugFile) {
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
    statusMsg.textContent = 'Đang tạo ảnh ...';
    statusMsg.style.display = 'block';
    statusMsg.style.color = 'var(--text)';

    // Progress từ 0-90% trong 60 giây (mỗi 10% = 6 giây)
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
        if (currentProgress < 90) {
            currentProgress += 10;
            progressFill.style.width = currentProgress + '%';
            progressText.textContent = currentProgress + '%';
        }
    }, 6000); // 6 giây = 6000ms

    try {
        // Download rug image if needed
        let rugFile;
        if (state.uploadedRugFile) {
            rugFile = state.uploadedRugFile;
        } else if (state.selectedRug.url.startsWith('/')) {
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

        // Upload to start job
        const resp = await fetch('/upload', {
            method: 'POST',
            body: form
        });

        const json = await resp.json();

        // Kiểm tra rate limit (status 429)
        if (resp.status === 429 || (json.code === 'rate_limit')) {
            clearInterval(progressInterval);
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
            clearInterval(progressInterval);
            // Reset button state
            btnGenerate.disabled = false;
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';
            progressContainer.style.display = 'none';
            statusMsg.textContent = json.message || 'Có lỗi xảy ra';
            statusMsg.style.color = 'red';
            return;
        }

        // Job started successfully, now poll for status
        const jobId = json.jobId;
        statusMsg.textContent = 'Đang xử lý (0%)...';
        
        let pollCount = 0;
        const maxPolls = 60; // Limit to 5 minutes (50 * 6s)

        // Polling loop
        const pollInterval = setInterval(async () => {
            pollCount++;
            if (pollCount > maxPolls) {
                clearInterval(pollInterval);
                clearInterval(progressInterval);
                
                // Reset UI
                btnGenerate.disabled = false;
                btnText.style.display = 'inline';
                btnSpinner.style.display = 'none';
                progressContainer.style.display = 'none';
                
                showErrorToast('Quá thời gian xử lý (timeout). Vui lòng thử lại sau.');
                return;
            }

            try {
                const statusResp = await fetch(`/api/job-status/${jobId}`);
                const statusJson = await statusResp.json();

                if (!statusJson.success) {
                    throw new Error(statusJson.message || 'Lỗi kiểm tra trạng thái');
                }

                const status = statusJson.status;
                
                // Update progress based on status
                if (status === 'completed') {
                    clearInterval(pollInterval);
                    clearInterval(progressInterval);
                    
                    progressFill.style.width = '100%';
                    progressText.textContent = '100%';

                    // Handle result
                    let imgUrl = '';
                    let imgBase64 = '';

                    if (statusJson.result) {
                        if (statusJson.result.imageBase64) {
                            imgBase64 = statusJson.result.imageBase64;
                        }
                        
                        if (statusJson.result.imageUrl) {
                            imgUrl = statusJson.result.imageUrl;
                        } else if (Array.isArray(statusJson.result.imageUrls) && statusJson.result.imageUrls.length > 0) {
                            imgUrl = statusJson.result.imageUrls[0];
                        }
                    }

                    if (!imgBase64 && !imgUrl) {
                        throw new Error('Không tìm thấy ảnh trong kết quả trả về');
                    }

                    // Show result
                    const resultImg = document.getElementById('result-image');
                    const downloadBtn = document.getElementById('download-btn');
                    
                    resultImg.onload = () => {
                        fitResultImage();
                    };
                    resultImg.onerror = () => {
                        statusMsg.textContent = 'Lỗi tải ảnh kết quả';
                        statusMsg.style.color = 'red';
                    };

                    if (imgBase64) {
                        const src = imgBase64.startsWith('data:image') ? imgBase64 : `data:image/jpeg;base64,${imgBase64}`;
                        resultImg.src = src;
                        
                        // Setup download for Base64
                        downloadBtn.href = '#';
                        downloadBtn.onclick = (e) => {
                            e.preventDefault();
                            fetch(src)
                                .then(res => res.blob())
                                .then(blob => {
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.style.display = 'none';
                                    a.href = url;
                                    a.download = `tham_result_${Date.now()}.jpg`;
                                    document.body.appendChild(a);
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                })
                                .catch(err => console.error('Download error:', err));
                        };
                    } else {
                        // Fallback to URL
                        resultImg.src = imgUrl;
                        downloadBtn.href = imgUrl;
                        downloadBtn.onclick = async (e) => {
                            e.preventDefault();
                            try {
                                const blobResp = await fetch(imgUrl);
                                const blob = await blobResp.blob();
                                const blobUrl = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = blobUrl;
                                a.download = `tham_result_${Date.now()}.jpg`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(blobUrl);
                            } catch (err) {
                                console.error('Download error:', err);
                                window.open(imgUrl, '_blank');
                            }
                        };
                    }

                    showResultPopup();
                    statusMsg.textContent = 'Hoàn tất!';
                    statusMsg.style.color = 'green';
                    
                    // Reset UI logic
                    btnGenerate.disabled = false;
                    btnText.style.display = 'inline';
                    btnSpinner.style.display = 'none';
                    progressContainer.style.display = 'none';

                } else if (status === 'failed') {
                    clearInterval(pollInterval);
                    clearInterval(progressInterval);
                    throw new Error(statusJson.error || 'Quá trình xử lý thất bại');
                }
            } catch (err) {
                console.error('Polling error:', err);
                if (err.message.includes('Lỗi kiểm tra trạng thái') || err.message.includes('thất bại')) {
                     clearInterval(pollInterval);
                     clearInterval(progressInterval);
                     btnGenerate.disabled = false;
                     btnText.style.display = 'inline';
                     btnSpinner.style.display = 'none';
                     progressContainer.style.display = 'none';
                     statusMsg.textContent = err.message;
                     statusMsg.style.color = 'red';
                     
                     showErrorToast(err.message);
                }
            }
        }, 6000);

    } catch (error) {
        clearInterval(progressInterval);
        console.error('Generate error:', error);
        
        btnGenerate.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
        progressContainer.style.display = 'none';
        
        statusMsg.textContent = 'Có lỗi xảy ra: ' + error.message;
        statusMsg.style.color = 'red';
    }
}

function showErrorToast(message) {
    let toast = document.getElementById('error-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'error-toast';
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.right = '20px';
        toast.style.backgroundColor = '#ff4d4f';
        toast.style.color = 'white';
        toast.style.padding = '15px 25px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        toast.style.zIndex = '9999';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '10px';
        toast.style.transition = 'opacity 0.3s ease';
        
        const icon = document.createElement('span');
        icon.innerHTML = '⚠️';
        toast.appendChild(icon);
        
        const text = document.createElement('span');
        text.id = 'error-toast-text';
        toast.appendChild(text);
        
        const close = document.createElement('button');
        close.innerHTML = '×';
        close.style.background = 'none';
        close.style.border = 'none';
        close.style.color = 'white';
        close.style.fontSize = '20px';
        close.style.cursor = 'pointer';
        close.style.marginLeft = '10px';
        close.onclick = () => { toast.style.opacity = '0'; setTimeout(() => toast.style.display = 'none', 300); };
        toast.appendChild(close);
        
        document.body.appendChild(toast);
    }
    
    document.getElementById('error-toast-text').textContent = message;
    toast.style.display = 'flex';
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.style.display = 'none', 300);
    }, 5000);
}

function resetFlow() {
    // Move containers back to hidden area before clearing messages
    const holdingArea = document.getElementById('chatbot-container');
    ['roomType', 'style', 'rugs', 'room', 'generate'].forEach(key => {
        const id = getStepContainerId(key);
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            holdingArea.appendChild(el);
        }
    });

    // Reset state
    state.currentStep = 0;
    state.roomType = null;
    state.style = null;
    state.selectedRug = null;
    state.uploadedRugFile = null;
    state.selectedRoom = null;
    state.uploadedRoomFile = null;

    // Reset UI
    document.getElementById('chatbot-messages').innerHTML = '';
    hideResultPopup();
    document.getElementById('chatbot-container').style.display = 'block';
    document.getElementById('rooms-list-container').style.display = 'none';
    document.getElementById('upload-room-container').style.display = 'none';
    document.getElementById('room-preview').style.display = 'none';
    const rugsListContainer = document.getElementById('rugs-list-container');
    if (rugsListContainer) rugsListContainer.style.display = 'none';
    const uploadRugContainer = document.getElementById('upload-rug-container');
    if (uploadRugContainer) uploadRugContainer.style.display = 'none';
    const rugPreview = document.getElementById('rug-preview');
    if (rugPreview) rugPreview.style.display = 'none';
    document.getElementById('status-message').style.display = 'none';
    document.querySelectorAll('.image-item').forEach(el => el.classList.remove('selected'));
    clearOptionSelections('#step-room-type');
    clearOptionSelections('#step-style');
    setChoiceSelected('');
    setRugChoiceSelected('');
    const roomInput = document.getElementById('room-file-input');
    if (roomInput) roomInput.value = '';
    const rugInput = document.getElementById('rug-file-input');
    if (rugInput) rugInput.value = '';
    
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
