import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
// @ts-ignore - form-data có thể không có type definitions đầy đủ
import FormData from 'form-data';

export class Visualizer {
    private tempDir: string;

    constructor() {
        this.tempDir = path.join(__dirname, '../storage/temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    public async generate(roomPath: string, rugPath: string, roomName: string, rugName: string): Promise<{ image?: string; error?: string }> {
        try {
            const imgBase64 = await this.callApi(roomPath, rugPath);
            
            // Xóa file tạm
            try {
                fs.unlinkSync(roomPath);
                fs.unlinkSync(rugPath);
            } catch (err) {
                // Ignore cleanup errors
            }

            return { image: imgBase64 };
        } catch (error: any) {
            // Xóa file tạm ngay cả khi lỗi
            try {
                fs.unlinkSync(roomPath);
                fs.unlinkSync(rugPath);
            } catch (err) {
                // Ignore cleanup errors
            }
            return { error: error.message || 'Lỗi không xác định' };
        }
    }

    private async callApi(roomFile: string, rugFile: string): Promise<string> {
        const apiUrl = "https://n8n-ec2.cahy.io.vn/webhook/bananaproGen";

        return new Promise((resolve, reject) => {
            const form = new FormData();
            
            form.append('prompt', `## NHIỆM VỤ: Chỉnh sửa ảnh cục bộ (Local Editing)
                ## INPUT DỮ LIỆU:
                - Ảnh 1 (Phòng): Đóng vai trò [GEOMETRY_REFERENCE]. Giữ nguyên tuyệt đối 100% phối cảnh, vị trí đồ đạc, ánh sáng và cấu trúc tường.
                - Ảnh 2 (Thảm): Đóng vai trò [MATERIAL_REFERENCE]. Lấy họa tiết và màu sắc của thảm này để thay thế sàn nhà trong Ảnh 1.
                
                ## LỆNH THỰC THI (ACTION):
                Thay thế bề mặt sàn nhà trong Ảnh 1 bằng chất liệu từ Ảnh 2.
                1. [PERSPECTIVE MATCH]: Bẻ cong họa tiết thảm (Ảnh 2) để khớp hoàn hảo với điểm tụ và mặt phẳng sàn của Ảnh 1.
                2. [OCCLUSION HANDLING]: Xác định các vật thể tiền cảnh (chân bàn, ghế, sofa). Đặt lớp thảm mới nằm DƯỚI các vật thể này. Không được vẽ đè lên đồ đạc.
                3. [LIGHTING INTEGRATION]: Giữ nguyên bản đồ bóng đổ (shadow map) của Ảnh 1. Áp bóng đổ của bàn ghế lên mặt thảm mới một cách tự nhiên.
                
                ## RÀNG BUỘC (CONSTRAINTS):
                - Tuyệt đối KHÔNG thay đổi hình dáng hay vị trí của bất kỳ đồ nội thất nào.
                - KHÔNG thay đổi góc camera.
                - Độ phân giải đầu ra: Giữ nguyên như Ảnh 1.`);
            
            const roomStream = fs.createReadStream(roomFile);
            const rugStream = fs.createReadStream(rugFile);
            
            form.append('room_file', roomStream, {
                filename: path.basename(roomFile),
                contentType: this.getMimeType(roomFile)
            });
            
            form.append('rug_file', rugStream, {
                filename: path.basename(rugFile),
                contentType: this.getMimeType(rugFile)
            });

            const url = new URL(apiUrl);
            const isHttps = url.protocol === 'https:';
            const client = isHttps ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: form.getHeaders(),
                timeout: 600000 // 10 minutes
            };

            const req = client.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`API trả mã ${res.statusCode} — Response: ${data}`));
                        return;
                    }

                    try {
                        const json = JSON.parse(data);
                        if (!json || !json.image_base64) {
                            reject(new Error(`API không trả image hợp lệ: ${data}`));
                            return;
                        }
                        resolve(json.image_base64);
                    } catch (error) {
                        reject(new Error(`Lỗi parse JSON: ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request error: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            form.pipe(req);
        });
    }

    private getMimeType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.heic': 'image/heic',
            '.heif': 'image/heif'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
}

