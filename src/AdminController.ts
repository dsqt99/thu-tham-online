import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import axios from 'axios';

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

    // Helper to download image
    private async downloadImage(url: string, destPath: string): Promise<boolean> {
        try {
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream'
            });

            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const writer = fs.createWriteStream(destPath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(true));
                writer.on('error', reject);
            });
        } catch (error) {
            console.error(`Failed to download ${url}:`, error);
            return false;
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

            // CSV Header: id,room,style,tone,path
            const csvLines = ['id,room,style,tone,path'];
            let count = 0;

            for (const row of data) {
                // Expected columns: id, room, style, tone, link
                const { id, room, style, tone, link } = row;
                if (!link) continue;

                // Create filename by id
                const filename = `${id}`;
                // Folder structure: images/rooms/{filename}
                // normalize room name for folder
                const relativePath = `/images/rooms/${filename}`;
                const localPath = path.join(this.imagesDir, 'rooms', filename);

                // Download image
                await this.downloadImage(link, localPath);

                // Add to CSV
                csvLines.push(`${id},${room || ''},${style || ''},${tone || ''},${relativePath}`);
                count++;
            }

            // Write CSV
            fs.writeFileSync(path.join(this.storageDir, 'rooms.csv'), csvLines.join('\n'));

            // Update options.json
            this.updateOptionsJson(data);

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

            // CSV Header: id,name,code,path
            const csvLines = ['id,name,code,path'];
            let count = 0;

            for (const row of data) {
                // Expected columns: id, name, code, link
                const { id, name, code, link } = row;
                if (!link) continue;

                const filename = `${code || id}`; // Use code as filename if available
                const relativePath = `/images/rugs/${filename}`;
                const localPath = path.join(this.imagesDir, 'rugs', filename);

                // Download
                await this.downloadImage(link, localPath);

                csvLines.push(`${id},${name || ''},${code || ''},${relativePath}`);
                count++;
            }

            // Write CSV
            fs.writeFileSync(path.join(this.storageDir, 'rugs.csv'), csvLines.join('\n'));

            // Cleanup
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

            return res.json({ success: true, count, message: 'Upload completed' });
        } catch (error: any) {
            console.error('Upload Rugs Error:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    // Extract options and save to JSON
    private updateOptionsJson(data: any[]) {
        const rooms = new Set<string>();
        const styles = new Set<string>();
        const tones = new Set<string>();

        data.forEach(row => {
            if (row.room) rooms.add(row.room);
            if (row.style) styles.add(row.style);
            if (row.tone) tones.add(row.tone);
        });

        const options = {
            rooms: Array.from(rooms),
            styles: Array.from(styles),
            tones: Array.from(tones)
        };

        fs.writeFileSync(path.join(this.storageDir, 'options.json'), JSON.stringify(options, null, 2));
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
                    tones: ['Trắng', 'Xám', 'Nâu', 'Xanh', 'Hồng', 'Khác']
                } 
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    };
}
