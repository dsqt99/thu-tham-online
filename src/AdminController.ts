import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import axios from 'axios';
import * as https from 'https';

export class AdminController {
    private storageDir = path.join(__dirname, '../storage');
    private imagesDir = path.join(__dirname, '../images');

    constructor() {
        if (!fs.existsSync(this.storageDir)) fs.mkdirSync(this.storageDir, { recursive: true });
        if (!fs.existsSync(this.imagesDir)) fs.mkdirSync(this.imagesDir, { recursive: true });
    }

    private clearImagesSubdir(subdir: 'rooms' | 'rugs') {
        const base = path.resolve(this.imagesDir);
        const target = path.resolve(this.imagesDir, subdir);
        if (!target.startsWith(base + path.sep)) {
            throw new Error('Invalid images directory');
        }
        fs.rmSync(target, { recursive: true, force: true });
        fs.mkdirSync(target, { recursive: true });
    }

    private getExtensionFromUrl(url: string): string | undefined {
        try {
            const u = new URL(url);
            const ext = path.extname(u.pathname || '').toLowerCase();
            if (!ext) return undefined;
            if (ext === '.jpeg') return '.jpg';
            if (ext === '.jpg' || ext === '.png' || ext === '.webp') return ext;
            return undefined;
        } catch {
            const ext = path.extname(url || '').toLowerCase();
            if (!ext) return undefined;
            if (ext === '.jpeg') return '.jpg';
            if (ext === '.jpg' || ext === '.png' || ext === '.webp') return ext;
            return undefined;
        }
    }

    private getExtensionFromContentType(contentType: string | undefined): string | undefined {
        const ct = String(contentType || '').toLowerCase();
        if (!ct) return undefined;
        if (ct.includes('image/jpeg')) return '.jpg';
        if (ct.includes('image/png')) return '.png';
        if (ct.includes('image/webp')) return '.webp';
        return undefined;
    }

    // Helper to download image
    private async downloadImage(url: string, destPathBase: string): Promise<{ ok: boolean; destPath?: string; ext?: string }> {
        try {
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                validateStatus: (status) => status >= 200 && status < 400,
                httpsAgent: new https.Agent({ rejectUnauthorized: false })
            });

            const ext = this.getExtensionFromUrl(url) || this.getExtensionFromContentType(response.headers?.['content-type']) || '.jpg';
            const destPath = `${destPathBase}${ext}`;

            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const writer = fs.createWriteStream(destPath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve({ ok: true, destPath, ext }));
                writer.on('error', reject);
            });
        } catch (error) {
            console.error(`Failed to download ${url}:`, error);
            return { ok: false };
        }
    }

    // Process Rooms Upload
    public uploadRooms = async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }

            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const data: any[] = xlsx.utils.sheet_to_json(sheet);

            if (!data || data.length === 0) {
                return res.status(400).json({ success: false, message: 'Empty file' });
            }

            this.clearImagesSubdir('rooms');

            // CSV Header: id,room,code,path
            const csvLines = ['id,room,code,path'];
            let count = 0;

            for (const row of data) {
                // Expected columns: id, room, code (or room_code), link
                const { id, room, link } = row;
                // Support both 'code' (from demo) and 'room_code'
                const roomCode = row.code || row.room_code || '';

                if (!link) continue;

                // Create filename by id
                const filenameBase = `${id}`;
                const localPathBase = path.join(this.imagesDir, 'rooms', filenameBase);

                // Download image
                const dl = await this.downloadImage(link, localPathBase);
                if (!dl.ok || !dl.ext) continue;

                // Add to CSV
                const relativePath = `/images/rooms/${filenameBase}${dl.ext}`;
                csvLines.push(`${id},${room},${roomCode},${relativePath}`);
                count++;
            }

            // Write CSV
            fs.writeFileSync(path.join(this.storageDir, 'rooms.csv'), csvLines.join('\n'));

            // Update options.json (Rooms only)
            this.updateRoomOptions(data);

            // Cleanup temp file
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

            return res.json({ success: true, count, message: 'Upload completed' });
        } catch (error: any) {
            console.error('Upload Rooms Error:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    // Process Rugs Upload
    public uploadRugs = async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }

            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const data: any[] = xlsx.utils.sheet_to_json(sheet);

            if (!data || data.length === 0) {
                return res.status(400).json({ success: false, message: 'Empty file' });
            }

            this.clearImagesSubdir('rugs');

            // CSV Header: id,name,code,style,room_code,path
            const csvLines = ['id,name,code,style,room_code,path'];
            let count = 0;

            for (const row of data) {
                // Expected columns: id, name, code, style, room, link
                // Note: 'room' from Excel is already normalized (e.g., 'phong-khach')
                const { id, name, code, style, room, link } = row;
                if (!link) continue;

                const filenameBase = `${code || id}`;
                const localPathBase = path.join(this.imagesDir, 'rugs', filenameBase);

                // Download
                const dl = await this.downloadImage(link, localPathBase);
                if (!dl.ok || !dl.ext) continue;

                // room from Excel is already normalized code (e.g., 'phong-khach')
                const roomCode = room || '';

                const relativePath = `/images/rugs/${filenameBase}${dl.ext}`;
                csvLines.push(`${id},${name || ''},${code || ''},${style || ''},${roomCode},${relativePath}`);
                count++;
            }

            // Write CSV
            fs.writeFileSync(path.join(this.storageDir, 'rugs.csv'), csvLines.join('\n'));

            // Update options.json (Styles and rugRooms)
            this.updateRugOptions(data);

            // Cleanup
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

            return res.json({ success: true, count, message: 'Upload completed' });
        } catch (error: any) {
            console.error('Upload Rugs Error:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    // Helper to read options
    private readOptions(): { rooms: string[], styles: string[], rugRooms: string[], tones: string[] } {
        const optionsPath = path.join(this.storageDir, 'options.json');
        if (fs.existsSync(optionsPath)) {
            try {
                return JSON.parse(fs.readFileSync(optionsPath, 'utf-8'));
            } catch (e) {
                console.error('Error reading options.json:', e);
            }
        }
        return { rooms: [], styles: [], rugRooms: [], tones: [] };
    }

    // Helper to save options
    private saveOptions(options: any) {
        fs.writeFileSync(path.join(this.storageDir, 'options.json'), JSON.stringify(options, null, 2));
    }

    // Update Room Options
    private updateRoomOptions(data: any[]) {
        const options = this.readOptions();
        const rooms = new Set<string>();

        data.forEach(row => {
            if (row.room) rooms.add(row.room);
        });

        options.rooms = Array.from(rooms);
        this.saveOptions(options);
    }

    // Update Style Options (from Rugs) - kept for backward compatibility
    private updateStyleOptions(data: any[]) {
        const options = this.readOptions();
        const styles = new Set<string>();

        data.forEach(row => {
            if (row.style) styles.add(row.style);
        });

        options.styles = Array.from(styles);
        this.saveOptions(options);
    }

    // Update Rug Options (Styles and Room types from Rugs)
    private updateRugOptions(data: any[]) {
        const options = this.readOptions();
        const styles = new Set<string>();
        const rugRooms = new Set<string>();

        data.forEach(row => {
            if (row.style) styles.add(row.style);
            if (row.room) rugRooms.add(row.room);
        });

        options.styles = Array.from(styles);
        options.rugRooms = Array.from(rugRooms);
        this.saveOptions(options);
    }

    // Helper to normalize string for folder names (e.g. "Phòng Khách" -> "phong-khach")
    private normalizeString(str: string): string {
        return str.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '');
    }

    // Public API to get options
    public getOptions = (req: Request, res: Response) => {
        try {
            const optionsPath = path.join(this.storageDir, 'options.json');
            if (fs.existsSync(optionsPath)) {
                const options = fs.readFileSync(optionsPath, 'utf-8');
                return res.json({ success: true, data: JSON.parse(options) });
            }
            // Default if no file
            return res.json({
                success: true,
                data: {
                    rooms: ['Phòng khách', 'Phòng ngủ', 'Phòng làm việc', 'Phòng bếp'],
                    styles: ['Hiện đại', 'Cổ điển', 'Tối giản', 'Scandinavian'],
                    rugRooms: ['Phòng khách', 'Phòng ngủ'],
                }
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    };
}
