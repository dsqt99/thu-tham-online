<?php
require_once __DIR__ . '/../src/Visualizer.php';
require_once __DIR__ . '/../src/RateLimiter.php';

header("Content-Type: application/json");

// ensure cookie id
$limiter = new RateLimiter();
$limiter->ensureCookie();

// check rate limit BEFORE heavy processing
if (!$limiter->allowed()) {
    http_response_code(429);
    echo json_encode([
        'success' => false,
        'code' => 'rate_limit',
        'message' => 'Bạn đã sử dụng tối đa 3 lần trong hôm nay. Vui lòng thử lại ngày mai hoặc liên hệ tư vấn.'
    ]);
    exit;
}

if (!isset($_FILES['room']) || !isset($_FILES['rug'])) {
    echo json_encode(['success' => false, 'message' => 'Thiếu file upload']);
    exit;
}

$allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
if (!in_array($_FILES['room']['type'], $allowed) || !in_array($_FILES['rug']['type'], $allowed)) {
    echo json_encode(['success' => false, 'message' => 'Chỉ chấp nhận JPG/PNG/WEBP/HEIC']);
    exit;
}

// optional: size validation (room <=10MB, rug <=5MB)
$maxRoom = 10 * 1024 * 1024;
$maxRug  = 5 * 1024 * 1024;
if ($_FILES['room']['size'] > $maxRoom) {
    echo json_encode(['success' => false, 'message' => 'Ảnh phòng vượt quá 10MB']);
    exit;
}
if ($_FILES['rug']['size'] > $maxRug) {
    echo json_encode(['success' => false, 'message' => 'Ảnh thảm vượt quá 5MB']);
    exit;
}

$visualizer = new Visualizer();

$result = $visualizer->generate(
    $_FILES['room']['tmp_name'],
    $_FILES['rug']['tmp_name'],
    $_FILES['room']['name'],
    $_FILES['rug']['name']
);

// if error from visualizer
if (isset($result['error'])) {
    echo json_encode(['success' => false, 'message' => $result['error']]);
    exit;
}

// success -> increment the counter
$limiter->increment();

echo json_encode([
    'success' => true,
    'image' => $result['image'],
    'message' => 'OK'
]);
