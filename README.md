# Tham VPS - TypeScript Version

Ứng dụng AI để trải thảm vào phòng của bạn.

## Cài đặt

```bash
npm install
```

## Chạy Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Chạy Production

```bash
npm start
```

## Docker

```bash
docker-compose up -d
```

## Cấu trúc

- `src/` - Source code TypeScript
  - `server.ts` - Express server (thay thế PHP)
  - `RateLimiter.ts` - Giới hạn số lần sử dụng
  - `Visualizer.ts` - Gọi API tạo ảnh
- `public/` - Frontend files (HTML, CSS, JS)
- `storage/` - Lưu trữ files và usage data

## Luồng hoạt động

1. User upload ảnh phòng và ảnh thảm
2. Server kiểm tra rate limit (3 lần/ngày)
3. Gọi API n8n để tạo ảnh
4. Trả về kết quả base64

