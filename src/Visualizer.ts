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

    public async generate(prompt: string, roomPath: string, rugPath: string, roomName: string, rugName: string): Promise<{ image?: string; error?: string }> {
        try {
            const imgBase64 = await this.callApi(prompt, roomPath, rugPath);
            
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

    private async callApi(prompt: string, roomFile: string, rugFile: string): Promise<string> {
        const apiUrl = process.env.API_GEN_IMAGE_URL || "https://continew-ai.app.n8n.cloud/webhook/thu-tham-online";

        return new Promise((resolve, reject) => {
            const form = new FormData();
            
            if (!prompt) {
                prompt = `## NHIỆM VỤ: Chỉnh sửa ảnh cục bộ (Local Editing)
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
                - Độ phân giải đầu ra: Giữ nguyên như Ảnh 1.`;
            }
            form.append('prompt', prompt);

            // Construct public URLs
            const baseUrl = 'https://thu-tham-online.aicontinew.com';
            const roomUrl = `${baseUrl}/temp/${path.basename(roomFile)}`;
            const rugUrl = `${baseUrl}/temp/${path.basename(rugFile)}`;

            console.log(`[Visualizer] Sending URLs to API: Room=${roomUrl}, Rug=${rugUrl}`);

            // Send URLs instead of files to avoid 413 Entity Too Large
            form.append('room_image_url', roomUrl);
            form.append('rug_image_url', rugUrl);
            
            // Keep sending file streams? No, user wants to use public links to avoid 413.
            // But if the API expects "room_file" key with a file, sending a URL in "room_image_url" might not work unless API logic handles it.
            // Assuming the API is updated or smart enough to handle 'room_image_url' and 'rug_image_url'.

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
                        const imageBase64 = this.extractImageBase64(json);
                        const summary = this.summarizeApiResponse(json, imageBase64);

                        if (!imageBase64) {
                            reject(new Error(`API không trả image hợp lệ: ${JSON.stringify(summary)} — Raw: ${data}`));
                            return;
                        }

                        resolve(imageBase64);
                    } catch (error: any) {
                        console.error('JSON Parse Error:', error);
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

    private extractImageBase64(payload: any): string | undefined {
        if (payload == null) return undefined;

        if (Array.isArray(payload)) {
            for (const item of payload) {
                const extracted = this.extractImageBase64(item);
                if (extracted) return extracted;
            }
            return undefined;
        }

        const candidates = [
            payload?.data,
            payload?.image,
            payload?.json?.data,
            payload?.json?.image
        ];

        for (const candidate of candidates) {
            if (typeof candidate !== 'string') continue;
            const trimmed = candidate.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('data:image') && trimmed.includes(',')) {
                const [, base64Part] = trimmed.split(',', 2);
                const base64Trimmed = (base64Part || '').trim();
                if (base64Trimmed) return base64Trimmed;
                continue;
            }

            return trimmed;
        }

        return undefined;
    }

    private summarizeApiResponse(payload: any, extractedImageBase64?: string) {
        const type = Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload;
        const summary: any = { type };

        if (Array.isArray(payload)) {
            summary.length = payload.length;
            summary.firstItemKeys = payload[0] && typeof payload[0] === 'object' ? Object.keys(payload[0]) : undefined;
        } else if (payload && typeof payload === 'object') {
            summary.keys = Object.keys(payload);
        }

        summary.extractedImageLength = extractedImageBase64 ? extractedImageBase64.length : 0;
        return summary;
    }
}
