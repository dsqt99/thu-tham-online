# AI Trải Thảm

Ứng dụng web chọn thảm + ảnh phòng và gọi AI để “trải thảm vào phòng”.

**Tính năng**
- Giao diện chat chọn `phòng` → `phong cách` → `tông màu` → chọn `thảm` → chọn `ảnh phòng` → tạo ảnh.
- Chọn ảnh từ thư viện hoặc tự upload (hỗ trợ JPG/PNG/WEBP; phòng hỗ trợ thêm HEIC).
- Popup hiển thị kết quả, tải ảnh về máy, tạo lại ảnh khác.
- Giới hạn số lượt tạo ảnh theo ngày (mặc định `3`).
- Admin Upload Center (`/admin`) để upload file dữ liệu và tải ảnh về server.

## Cấu hình

Tạo file `.env` (hoặc chỉnh `.env` có sẵn):

```env
# Rate limit
MAX_RATE_LIMIT=3
RATE_LIMIT_MODE=ip

# API tạo ảnh
API_GEN_IMAGE_URL=https://<your-webhook>

# Admin Upload Center account
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<your-strong-password>
```

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000/`.

## Build & chạy production (Node)

```bash
npm install
npm run build
npm start
```

## Deploy bằng Docker

```bash
docker-compose up -d --build
```

- App chạy tại `http://<server>:3000/`.
- `docker-compose.yml` mount `./storage` để giữ dữ liệu (CSV/options/usage).

## Deploy sau reverse proxy (Nginx)

Repo có sẵn file mẫu `nginx.conf` để proxy vào container/app port `3000`.
- Nếu chạy sau proxy, nên set `TRUST_PROXY=1` (đã có trong `docker-compose.yml`) để lấy IP thật qua `X-Forwarded-For`.

### Cấu hình Nginx chuẩn (Khuyên dùng)
Nếu bạn cài Nginx trực tiếp trên Host (Ubuntu/CentOS), hãy tạo file cấu hình mới:

1. Tạo file config:
   ```bash
   sudo nano /etc/nginx/sites-available/gheptham.thamhanlong.com
   sudo rm -rf /etc/nginx/sites-available/gheptham.cahy.io.vn
   ```

2. Dán nội dung sau (Thay `gheptham.cahy.io.vn` bằng domain của bạn):
   ```nginx
   server {
       server_name gheptham.cahy.io.vn;

       # Tăng giới hạn upload
       client_max_body_size 20M;

       location / {
           # Dùng IP LAN của server nếu localhost bị chặn (hostname -I để lấy IP)
           # Hoặc dùng http://localhost:3000 nếu không có vấn đề firewall
           proxy_pass http://127.0.0.1:3000;
           
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. Kích hoạt và cài SSL:
   ```bash
   sudo ln -s /etc/nginx/sites-available/gheptham.thamhanlong.com /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   sudo certbot --nginx -d gheptham.thamhanlong.com
   ```

## Hướng dẫn sử dụng web

1. Chọn `Loại phòng` → `Phong cách`.
2. Chọn thảm:
   - Danh sách thảm sẽ được lọc theo `Phong cách` đã chọn.
   - `Chọn thảm có sẵn` để mở danh sách thảm.
   - Hoặc `Tải ảnh thảm lên`.
3. Chọn ảnh phòng:
   - Bấm `Chọn ảnh phòng có sẵn` để mở danh sách ảnh phòng.
   - Khi đang ở chế độ chọn ảnh có sẵn, danh sách sẽ tự reload theo bộ lọc `room` (Loại phòng).
   - Hoặc `Tải ảnh phòng lên`.
4. Bấm `✨ Click để tạo ảnh` để gọi API tạo ảnh.
5. Kết quả hiển thị dạng popup: tải ảnh / đóng popup / tạo lại.

## Giới hạn lượt tạo ảnh

- Chỉ khi bấm tạo ảnh và server trả kết quả thành công mới tính “+1 lượt”.
- Mặc định giới hạn `MAX_RATE_LIMIT=3` lượt/ngày.
- `RATE_LIMIT_MODE`:
  - `ip`: tính theo IP.
  - `cookie`: tính theo cookie.
  - `both`: lấy max giữa 2 cách.

## Admin Upload Center

### Đăng nhập

- Truy cập `http://<host>/admin`.
- Đăng nhập bằng `ADMIN_USERNAME` và `ADMIN_PASSWORD` trong `.env`.
- API upload được bảo vệ (chưa đăng nhập sẽ trả `401`).

### Upload dữ liệu Rooms

Endpoint: `POST /api/admin/upload-rooms`

File Excel cần có các cột:
- `id`: định danh (nên unique).
- `room`: tên phòng (tuỳ ý).
- `style`: phong cách (tuỳ ý).
- `link`: URL ảnh phòng (nên là link ảnh trực tiếp có đuôi `.jpg/.png/.webp`).

Khi upload rooms:
- Xoá sạch toàn bộ ảnh cũ trong `images/rooms/` rồi tải ảnh mới vào lại.
- Ghi `storage/rooms.csv`.
- Cập nhật `storage/options.json` để UI dùng làm danh sách `room/style`.

### Upload dữ liệu Rugs

Endpoint: `POST /api/admin/upload-rugs`

File Excel cần có các cột:
- `id`: định danh.
- `name`: tên hiển thị.
- `code`: mã thảm (khuyến nghị unique).
- `link`: URL ảnh thảm (nên là link ảnh trực tiếp có đuôi `.jpg/.png/.webp`).

Khi upload rugs:
- Xoá sạch toàn bộ ảnh cũ trong `images/rugs/` rồi tải ảnh mới vào lại.
- Ghi `storage/rugs.csv`.

## Lưu trữ dữ liệu

- `images/rooms/`: ảnh phòng đã tải về từ Admin Upload (mỗi lần upload rooms sẽ xoá và tải lại).
- `images/rugs/`: ảnh thảm đã tải về từ Admin Upload (mỗi lần upload rugs sẽ xoá và tải lại).
- `storage/rooms.csv`: dữ liệu rooms + đường dẫn ảnh.
- `storage/rugs.csv`: dữ liệu rugs + đường dẫn ảnh.
- `storage/options.json`: danh sách `rooms/styles` hiển thị ở UI.
- `storage/usage.json`: bộ đếm giới hạn lượt tạo ảnh theo ngày.
- `storage/temp/`: file upload tạm khi user tạo ảnh.

## Rooms / Style có thể điền bất kỳ

- `room`, `style` trong file rooms có thể là chuỗi bất kỳ.
- Hệ thống sẽ normalize để lọc (bỏ dấu, viết thường, thay khoảng trắng bằng `-`).
- Để thêm lựa chọn mới cho UI, chỉ cần thêm giá trị mới vào file rooms và upload lại (options sẽ tự cập nhật).

1. gcloud init
2. gcloud compute ssh --zone "asia-southeast1-c" "instance-20250912-094812" --project "continew-ai-471909"