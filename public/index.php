<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trải Thảm Vào Phòng Của Bạn</title>
    <link rel="stylesheet" href="style.css">
    <script src="https://cdn.jsdelivr.net/npm/heic2any/dist/heic2any.min.js"></script>
</head>

<body>
    <div class="tv-container">

        <section class="tv-hero">
            <h1>Trải Thảm Vào Phòng Của Bạn</h1>
            <p>Công cụ AI giúp bạn xem trước phòng sau khi đặt thảm — trực quan, nhanh chóng và chính xác.</p>
        </section>

        <div class="tv-upload-grid">
            <div class="tv-upload-card">
                <div class="tv-label">
                    <span>Ảnh Phòng</span>
                </div>
                <div class="tv-dropzone-inner" id="room-dropzone">
                    <small>Tối đa 10 MB – JPG/PNG/HEIC</small>
                    <input type="file" id="tv-room-file" accept="image/*">
                </div>
                <div class="tv-preview" id="tv-room-preview"></div>
                <div class="preview-wrap">
                    <img id="preview-room" />
                </div>

            </div>

            <div class="tv-upload-card">
                <div class="tv-label">
                    <span>Ảnh Thảm</span>
                </div>
                <div class="tv-dropzone-inner" id="rug-dropzone">
                    <small>Tối đa 5 MB – JPG/PNG/HEIC</small>
                    <input type="file" id="tv-rug-file" accept="image/*">
                </div>
                <div class="tv-preview" id="tv-rug-preview"></div>
                <div class="preview-wrap">
                    <img id="preview-rug" />
                </div>
            </div>
        </div>

        <div class="tv-actions">
            <button id="tv-generate" class="tv-btn-main">
                <span>Tạo ảnh AI</span>
            </button>
            <div style="margin-top: 20px;">
                <span id="tv-status" class="tv-status"></span>
                <span id="progress"></span>
            </div>
        </div>

        <div id="tv-result" class="tv-result">
            <h2>Kết quả</h2>
            <div class="tv-result-box">
                <img id="tv-result-img" src="" />
            </div>
            <a id="tv-download" class="tv-btn-download" download="tham_result.jpg">
                Tải ảnh
            </a>
        </div>

    </div>
    <script src="script.js"></script>
</body>

</html>