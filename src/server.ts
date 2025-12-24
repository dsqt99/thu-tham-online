import 'dotenv/config';
import express, { Request, Response } from 'express';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { RateLimiter } from './RateLimiter';
import { Visualizer } from './Visualizer';
import { AdminController } from './AdminController';

const app = express();
const port = process.env.PORT || 3000;
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
    if (trustProxy === 'true') {
        app.set('trust proxy', true);
    } else if (trustProxy === 'false') {
        app.set('trust proxy', false);
    } else {
        const n = Number(trustProxy);
        if (!Number.isNaN(n)) {
            app.set('trust proxy', n);
        } else {
            app.set('trust proxy', trustProxy);
        }
    }
}

// Middleware
app.use(express.json());
app.use(cookieParser());

// CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tempDir = path.join(__dirname, '../storage/temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}_${timestamp}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    }
});

// Initialize services
const maxRateLimit = parseInt(process.env.MAX_RATE_LIMIT || '3', 10);
const limiter = new RateLimiter(undefined, maxRateLimit);
const visualizer = new Visualizer();
const adminController = new AdminController();

const adminUsername = process.env.ADMIN_USERNAME || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const adminAuthCookieName = 'tv_admin';
const adminAuthMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

function safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
}

function signAdminToken(payloadB64Url: string): string {
    return crypto.createHmac('sha256', adminPassword || 'missing_admin_password').update(payloadB64Url).digest('base64url');
}

function createAdminToken(username: string): string {
    const payload = { u: username, iat: Date.now() };
    const payloadB64Url = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = signAdminToken(payloadB64Url);
    return `${payloadB64Url}.${sig}`;
}

function verifyAdminToken(token: string | undefined): { ok: boolean; username?: string } {
    if (!token) return { ok: false };
    const parts = String(token).split('.');
    if (parts.length !== 2) return { ok: false };
    const [payloadB64Url, sig] = parts;
    const expectedSig = signAdminToken(payloadB64Url);
    if (!safeEqual(sig, expectedSig)) return { ok: false };
    try {
        const raw = Buffer.from(payloadB64Url, 'base64url').toString('utf8');
        const payload = JSON.parse(raw);
        if (!payload || typeof payload !== 'object') return { ok: false };
        const username = String(payload.u || '');
        const iat = Number(payload.iat || 0);
        if (!username) return { ok: false };
        if (!Number.isFinite(iat) || iat <= 0) return { ok: false };
        if (Date.now() - iat > adminAuthMaxAgeMs) return { ok: false };
        return { ok: true, username };
    } catch {
        return { ok: false };
    }
}

function adminAuthMiddleware(req: Request, res: Response, next: any) {
    const token = (req.cookies && (req.cookies as any)[adminAuthCookieName]) as string | undefined;
    const verified = verifyAdminToken(token);
    if (!verified.ok) {
        return res.status(401).json({ success: false, code: 'unauthorized', message: 'Unauthorized' });
    }
    (req as any).adminUser = verified.username;
    next();
}

// Admin Routes
app.post('/api/admin/login', (req: Request, res: Response) => {
    const { username, password } = (req.body || {}) as any;
    if (!adminUsername || !adminPassword) {
        return res.status(500).json({ success: false, message: 'Admin credentials not configured' });
    }
    const u = String(username || '');
    const p = String(password || '');
    if (!safeEqual(u, adminUsername) || !safeEqual(p, adminPassword)) {
        return res.status(401).json({ success: false, message: 'Sai username hoặc password' });
    }
    const token = createAdminToken(u);
    res.cookie(adminAuthCookieName, token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: adminAuthMaxAgeMs
    });
    return res.json({ success: true, username: u });
});

app.post('/api/admin/logout', (req: Request, res: Response) => {
    res.clearCookie(adminAuthCookieName, { httpOnly: true, secure: false, sameSite: 'lax' });
    return res.json({ success: true });
});

app.get('/api/admin/me', (req: Request, res: Response) => {
    const token = (req.cookies && (req.cookies as any)[adminAuthCookieName]) as string | undefined;
    const verified = verifyAdminToken(token);
    if (!verified.ok) {
        return res.status(401).json({ success: false, code: 'unauthorized' });
    }
    return res.json({ success: true, username: verified.username });
});

app.post('/api/admin/upload-rooms', adminAuthMiddleware, upload.single('file'), adminController.uploadRooms);
app.post('/api/admin/upload-rugs', adminAuthMiddleware, upload.single('file'), adminController.uploadRugs);
app.get('/api/options', adminController.getOptions);

app.post('/upload', upload.fields([
    { name: 'room', maxCount: 1 },
    { name: 'rug', maxCount: 1 }
]), async (req: Request, res: Response) => {
    try {
        // Ensure cookie
        limiter.ensureCookie(req, res);

        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        
        // Helper function to cleanup temp files
        const cleanupTempFiles = () => {
            try {
                if (files && files['room'] && files['room'][0] && fs.existsSync(files['room'][0].path)) {
                    fs.unlinkSync(files['room'][0].path);
                }
                if (files && files['rug'] && files['rug'][0] && fs.existsSync(files['rug'][0].path)) {
                    fs.unlinkSync(files['rug'][0].path);
                }
            } catch (cleanupErr) {
                console.error('Cleanup error:', cleanupErr);
            }
        };

        // Check rate limit AFTER files are uploaded (multer already saved them)
        if (!limiter.allowed(req)) {
            cleanupTempFiles(); // Xóa file temp ngay khi rate limit
            return res.status(429).json({
                success: false,
                code: 'rate_limit',
                message: 'Bạn đã sử dụng tối đa 3 lần trong hôm nay. Vui lòng thử lại ngày mai hoặc liên hệ tư vấn.'
            });
        }
        
        if (!files || !files['room'] || !files['rug']) {
            cleanupTempFiles(); // Xóa file temp nếu thiếu file
            return res.json({ success: false, message: 'Thiếu file upload' });
        }

        const prompt = req.body.prompt || '';
        const roomFile = files['room'][0];
        const rugFile = files['rug'][0];

        // Validate file types
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        if (!allowed.includes(roomFile.mimetype) || !allowed.includes(rugFile.mimetype)) {
            cleanupTempFiles(); // Xóa file temp nếu sai định dạng
            return res.json({ success: false, message: 'Chỉ chấp nhận JPG/PNG/WEBP/HEIC' });
        }

        // Validate file sizes
        const maxRoom = 10 * 1024 * 1024; // 10MB
        const maxRug = 5 * 1024 * 1024;   // 5MB
        
        if (roomFile.size > maxRoom) {
            cleanupTempFiles(); // Xóa file temp nếu quá lớn
            return res.json({ success: false, message: 'Ảnh phòng vượt quá 10MB' });
        }
        
        if (rugFile.size > maxRug) {
            cleanupTempFiles(); // Xóa file temp nếu quá lớn
            return res.json({ success: false, message: 'Ảnh thảm vượt quá 5MB' });
        }

        // Generate image
        const result = await visualizer.generate(
            prompt, // prompt
            roomFile.path,
            rugFile.path,
            roomFile.originalname,
            rugFile.originalname
        );

        // If error from visualizer
        if (result.error) {
            // Visualizer đã xóa file, nhưng đảm bảo cleanup nếu chưa
            cleanupTempFiles();
            return res.json({ success: false, message: result.error });
        }

        // Success -> increment the counter
        limiter.increment(req);

        return res.json({
            success: true,
            image: result.image,
            message: 'OK'
        });
    } catch (error: any) {
        console.error('Upload error:', error);
        
        // Ensure temp files are cleaned up on exception
        try {
            const files = req.files as { [fieldname: string]: Express.Multer.File[] };
            if (files) {
                if (files['room'] && files['room'][0] && fs.existsSync(files['room'][0].path)) {
                    fs.unlinkSync(files['room'][0].path);
                }
                if (files['rug'] && files['rug'][0] && fs.existsSync(files['rug'][0].path)) {
                    fs.unlinkSync(files['rug'][0].path);
                }
            }
        } catch (cleanupErr) {
            console.error('Cleanup error:', cleanupErr);
        }
        
        return res.status(500).json({
            success: false,
            message: error.message || 'Lỗi server'
        });
    }
});

// API: Lấy danh sách ảnh thảm
app.get('/api/rugs', (req: Request, res: Response) => {
    try {
        const csvPath = path.join(__dirname, '../storage/rugs.csv');
        if (fs.existsSync(csvPath)) {
            const content = fs.readFileSync(csvPath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim() !== '');
            // Skip header
            const dataLines = lines.slice(1);
            
            const images = dataLines.map(line => {
                const parts = line.split(',');
                if (parts.length >= 4) {
                    const id = parts[0];
                    const name = parts[1];
                    const code = parts[2];
                    const url = parts[3].trim();
                    
                    if (!url) return null;

                    // Verify file existence
                    let localPath = '';
                    if (url.startsWith('/images/')) {
                         // Resolve absolute path to images folder
                         const imagesDir = path.resolve(__dirname, '../images');
                         // Remove /images/ prefix to get relative path inside imagesDir
                         const relativePath = url.replace(/^\/images\//, ''); 
                         localPath = path.join(imagesDir, relativePath);
                    }
                    
                    if (localPath && !fs.existsSync(localPath)) {
                         console.warn(`[Missing File] URL: ${url} -> Path: ${localPath}`);
                         // return null; // Keep it commented unless we want to hide it
                    } else {
                         // console.log(`[Found File] URL: ${url}`);
                    }

                    return {
                        filename: name || code || path.basename(url),
                        url: url,
                        name: name,
                        code: code
                    };
                }
                return null;
            }).filter(item => item !== null);

            return res.json({ success: true, images });
        }

        // Fallback to directory scan if CSV not found
        const rugsDir = path.join(__dirname, '../images/rugs');
        if (!fs.existsSync(rugsDir)) {
            return res.json({ success: true, images: [] });
        }
        const files = fs.readdirSync(rugsDir)
            .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
            .map(file => ({
                filename: file,
                url: `/images/rugs/${file}`
            }));
        res.json({ success: true, images: files });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Helper to normalize string for comparison
function normalizeString(str: string): string {
    if (!str) return '';
    return str.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '');
}

// API: Lấy danh sách ảnh phòng với filter
app.get('/api/rooms', (req: Request, res: Response) => {
    try {
        const roomType = req.query.roomType as string;
        const color = req.query.color as string;
        const style = req.query.style as string;

        // Try reading from CSV first
        const csvPath = path.join(__dirname, '../storage/rooms.csv');
        if (fs.existsSync(csvPath)) {
            const content = fs.readFileSync(csvPath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim() !== '');
            const dataLines = lines.slice(1);

            let images = dataLines.map(line => {
                const parts = line.split(',');
                if (parts.length >= 5) {
                    // id,room,style,tone,path
                    const id = parts[0];
                    const room = parts[1];
                    const rowStyle = parts[2];
                    const tone = parts[3];
                    const url = parts[4].trim();

                    if (!url) return null;

                    return {
                        filename: path.basename(url),
                        url: url,
                        roomType: normalizeString(room),
                        style: normalizeString(rowStyle),
                        color: normalizeString(tone),
                        // Original values for reference
                        _room: room,
                        _style: rowStyle,
                        _tone: tone
                    };
                }
                return null;
            }).filter(item => item !== null) as any[];

            // Filter
            if (roomType) {
                images = images.filter(img => img.roomType === normalizeString(roomType));
            }
            if (style) {
                images = images.filter(img => img.style === normalizeString(style));
            }
            if (color) {
                // Tone maps to color
                images = images.filter(img => img.color === normalizeString(color));
            }

            return res.json({ success: true, images });
        }

        // Fallback to directory scan
        const roomsDir = path.join(__dirname, '../images/rooms');
        if (!fs.existsSync(roomsDir)) {
            return res.json({ success: true, images: [] });
        }

        let allFiles: Array<{ filename: string; url: string; roomType: string; color?: string; style?: string }> = [];

        // Map roomType từ frontend sang tên thư mục
        const roomTypeMap: Record<string, string> = {
            'phong-khach': 'phong-khach',
            'phong-ngu': 'phong-ngu',
            'phong-lam-viec': 'phong-lam-viec',
            'phong-bep': 'phong-bep'
        };

        // Nếu có roomType, chỉ lấy từ thư mục đó
        if (roomType && roomTypeMap[roomType]) {
            const roomTypeDir = path.join(roomsDir, roomTypeMap[roomType]);
            if (fs.existsSync(roomTypeDir) && fs.statSync(roomTypeDir).isDirectory()) {
                const files = fs.readdirSync(roomTypeDir)
                    .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
                    .map(file => ({
                        filename: file,
                        url: `/images/rooms/${roomTypeMap[roomType]}/${file}`,
                        roomType: roomType,
                        // Có thể thêm color và style vào metadata sau
                        color: color || undefined,
                        style: style || undefined
                    }));
                allFiles = files;
            }
        } else {
            // Nếu không có roomType, lấy tất cả từ tất cả thư mục
            const subdirs = fs.readdirSync(roomsDir)
                .filter(item => {
                    const itemPath = path.join(roomsDir, item);
                    return fs.statSync(itemPath).isDirectory();
                });

            subdirs.forEach(subdir => {
                const subdirPath = path.join(roomsDir, subdir);
                const files = fs.readdirSync(subdirPath)
                    .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
                    .map(file => ({
                        filename: file,
                        url: `/images/rooms/${subdir}/${file}`,
                        roomType: subdir,
                        color: color || undefined,
                        style: style || undefined
                    }));
                allFiles = allFiles.concat(files);
            });
        }

        // Filter theo color và style nếu có (có thể mở rộng sau với metadata)
        // Hiện tại chỉ filter theo roomType, color và style có thể dùng để filter sau
        let filteredFiles = allFiles;
        
        // TODO: Có thể thêm logic filter theo color và style dựa vào metadata hoặc tên file
        // Ví dụ: nếu có file metadata.json hoặc naming convention
        
        res.json({ success: true, images: filteredFiles });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Serve static files AFTER routes (để routes được ưu tiên)
app.use(express.static(path.join(__dirname, '../public')));
app.use('/images', (req, res, next) => {
    // console.log(`[Image Request] ${req.method} ${req.url}`);
    next();
}, express.static(path.join(__dirname, '../images')));
app.use('/admin', express.static(path.join(__dirname, '../upload')));

// Cleanup old temp files function
function cleanupOldTempFiles() {
    try {
        const tempDir = path.join(__dirname, '../storage/temp');
        if (!fs.existsSync(tempDir)) return;

        const files = fs.readdirSync(tempDir);
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 hour

        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
                const stats = fs.statSync(filePath);
                const age = now - stats.mtimeMs;
                
                if (age > maxAge) {
                    fs.unlinkSync(filePath);
                    console.log(`Đã xóa file tạm cũ: ${file}`);
                }
            } catch (err) {
                console.error(`Lỗi khi xóa file ${file}:`, err);
            }
        });
    } catch (error) {
        console.error('Lỗi cleanup temp files:', error);
    }
}

// Cleanup on startup
cleanupOldTempFiles();

// Cleanup every hour
setInterval(cleanupOldTempFiles, 60 * 60 * 1000);

app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
});

