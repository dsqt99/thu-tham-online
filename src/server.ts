import express, { Request, Response } from 'express';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import * as path from 'path';
import * as fs from 'fs';
import { RateLimiter } from './RateLimiter';
import { Visualizer } from './Visualizer';

const app = express();
const port = process.env.PORT || 3000;

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
const limiter = new RateLimiter();
const visualizer = new Visualizer();

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

// Giữ /upload.php để tương thích
app.post('/upload.php', upload.fields([
    { name: 'room', maxCount: 1 },
    { name: 'rug', maxCount: 1 }
]), async (req: Request, res: Response) => {
    // Helper function to cleanup temp files
    const cleanupTempFiles = () => {
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
    };

    try {
        limiter.ensureCookie(req, res);
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        
        if (!limiter.allowed(req)) {
            cleanupTempFiles(); // Xóa file temp khi rate limit
            return res.status(429).json({
                success: false,
                code: 'rate_limit',
                message: 'Bạn đã sử dụng tối đa 3 lần trong hôm nay. Vui lòng thử lại ngày mai hoặc liên hệ tư vấn.'
            });
        }
        if (!files || !files['room'] || !files['rug']) {
            cleanupTempFiles();
            return res.json({ success: false, message: 'Thiếu file upload' });
        }
        const roomFile = files['room'][0];
        const rugFile = files['rug'][0];
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        if (!allowed.includes(roomFile.mimetype) || !allowed.includes(rugFile.mimetype)) {
            cleanupTempFiles();
            return res.json({ success: false, message: 'Chỉ chấp nhận JPG/PNG/WEBP/HEIC' });
        }
        const maxRoom = 10 * 1024 * 1024;
        const maxRug = 5 * 1024 * 1024;
        if (roomFile.size > maxRoom) {
            cleanupTempFiles();
            return res.json({ success: false, message: 'Ảnh phòng vượt quá 10MB' });
        }
        if (rugFile.size > maxRug) {
            cleanupTempFiles();
            return res.json({ success: false, message: 'Ảnh thảm vượt quá 5MB' });
        }
        const result = await visualizer.generate(roomFile.path, rugFile.path, roomFile.originalname, rugFile.originalname);
        if (result.error) {
            cleanupTempFiles();
            return res.json({ success: false, message: result.error });
        }
        limiter.increment(req);
        return res.json({ success: true, image: result.image, message: 'OK' });
    } catch (error: any) {
        console.error('Upload error:', error);
        // Cleanup on exception
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
        return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
    }
});

// API: Lấy danh sách ảnh thảm
app.get('/api/rugs', (req: Request, res: Response) => {
    try {
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

// API: Lấy danh sách ảnh phòng với filter
app.get('/api/rooms', (req: Request, res: Response) => {
    try {
        const roomsDir = path.join(__dirname, '../images/rooms');
        if (!fs.existsSync(roomsDir)) {
            return res.json({ success: true, images: [] });
        }

        const roomType = req.query.roomType as string;
        const color = req.query.color as string;
        const style = req.query.style as string;

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
app.use('/images', express.static(path.join(__dirname, '../images')));

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

