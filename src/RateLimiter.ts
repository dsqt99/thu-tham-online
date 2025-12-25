import * as fs from 'fs';
import * as path from 'path';

export class RateLimiter {
    private storeFile: string;
    private limitPerDay: number;
    private mode: 'cookie' | 'ip' | 'both';

    constructor(storeFile?: string, limitPerDay?: number) {
        this.storeFile = storeFile || path.join(__dirname, '../storage/usage.json');
        this.limitPerDay = limitPerDay ?? parseInt(process.env.MAX_RATE_LIMIT || '3', 10);
        const rawMode = String(process.env.RATE_LIMIT_MODE || 'both').toLowerCase();
        if (rawMode === 'cookie' || rawMode === 'ip' || rawMode === 'both') {
            this.mode = rawMode;
        } else {
            this.mode = 'both';
        }

        const dir = path.dirname(this.storeFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (!fs.existsSync(this.storeFile)) {
            fs.writeFileSync(this.storeFile, JSON.stringify({}));
        }
    }

    private getTodayVnYYYYMMDD(): string {
        const vnOffsetMs = 7 * 60 * 60 * 1000;
        const vnNow = new Date(Date.now() + vnOffsetMs);
        const yyyy = vnNow.getUTCFullYear();
        const mm = String(vnNow.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(vnNow.getUTCDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    }

    private getCookieIdentifier(req: any): string | undefined {
        if (req.cookies && req.cookies.tv_user) {
            const id = req.cookies.tv_user.replace(/[^a-zA-Z0-9_\-]/g, '');
            return id || undefined;
        }
        return undefined;
    }

    private normalizeIp(rawIp: string): string {
        return String(rawIp || '')
            .trim()
            .replace(/^::ffff:/, '')
            .replace(/^\[|\]$/g, '')
            .replace(/[^a-zA-Z0-9_.:\-]/g, '') || 'anon';
    }

    private isPrivateIp(ip: string): boolean {
        const v = this.normalizeIp(ip);
        if (!v || v === 'anon') return true;
        if (v === '::1' || v === 'localhost' || v === '127.0.0.1') return true;
        if (v.startsWith('fe80:')) return true;
        if (v.startsWith('fc') || v.startsWith('fd')) return true;
        const m = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!m) return false;
        const a = Number(m[1]);
        const b = Number(m[2]);
        if ([a, b, Number(m[3]), Number(m[4])].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
        if (a === 10) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 127) return true;
        if (a === 169 && b === 254) return true;
        return false;
    }

    private pickClientIpFromForwardedFor(xForwardedFor: string): string | undefined {
        const parts = String(xForwardedFor || '')
            .split(',')
            .map((p) => this.normalizeIp(p))
            .filter((p) => p && p !== 'anon');
        if (parts.length === 0) return undefined;
        for (const ip of parts) {
            if (!this.isPrivateIp(ip)) return ip;
        }
        return parts[0];
    }

    private getIpIdentifier(req: any): string {
        const headers = req?.headers || {};
        
        // Danh sách các headers có thể chứa IP thực
        const candidates: string[] = [];

        // 1. Cloudflare / CDN headers (thường tin cậy nhất nếu dùng CDN)
        const cfIp = headers['cf-connecting-ip'] || headers['true-client-ip'];
        if (typeof cfIp === 'string') candidates.push(cfIp);

        // 2. X-Forwarded-For (Standard)
        const xff = headers['x-forwarded-for'];
        if (typeof xff === 'string') {
            xff.split(',').forEach(ip => candidates.push(ip.trim()));
        } else if (Array.isArray(xff)) {
            xff.forEach(ip => candidates.push(String(ip).trim()));
        }

        // 3. X-Real-IP (Nginx)
        const xRealIp = headers['x-real-ip'];
        if (typeof xRealIp === 'string') candidates.push(xRealIp.trim());

        // 4. Direct socket IP
        const remoteAddr = req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip;
        if (remoteAddr) candidates.push(String(remoteAddr).trim());

        // Logic lọc: Tìm IP Public đầu tiên
        for (const ip of candidates) {
            const normalized = this.normalizeIp(ip);
            // Bỏ qua nếu là IP private hoặc invalid
            if (normalized && normalized !== 'anon' && !this.isPrivateIp(normalized)) {
                return normalized;
            }
        }

        // Fallback: Nếu không tìm thấy Public IP, trả về Private IP hợp lệ đầu tiên (tránh localhost nếu có thể)
        // Ưu tiên các IP không phải là 127.0.0.1 hay ::1
        for (const ip of candidates) {
            const normalized = this.normalizeIp(ip);
            if (normalized && normalized !== 'anon' && !normalized.startsWith('127.') && normalized !== '::1') {
                return normalized;
            }
        }

        // Last resort
        return 'anon';
    }

    private getKeys(req: any): string[] {
        const date = this.getTodayVnYYYYMMDD();
        const keys: string[] = [];

        if (this.mode === 'cookie' || this.mode === 'both') {
            const cookieId = this.getCookieIdentifier(req);
            if (cookieId) keys.push(`cookie:${cookieId}_${date}`);
        }

        if (this.mode === 'ip' || this.mode === 'both') {
            const ipId = this.getIpIdentifier(req);
            keys.push(`ip:${ipId}_${date}`);
        }

        if (keys.length === 0) {
            keys.push(`anon:anon_${date}`);
        }

        return keys;
    }

    private readStore(): Record<string, number> {
        try {
            const contents = fs.readFileSync(this.storeFile, 'utf-8');
            const data = JSON.parse(contents);
            if (!data || typeof data !== 'object') {
                return {};
            }
            
            // Cleanup old entries (older than today)
            const today = this.getTodayVnYYYYMMDD();
            const cleaned: Record<string, number> = {};
            let hasOldEntries = false;
            
            for (const [key, value] of Object.entries(data)) {
                // Key format: {id}_{YYYYMMDD}
                const parts = key.split('_');
                if (parts.length >= 2) {
                    const datePart = parts[parts.length - 1]; // Last part is date
                    // Keep only today's entries
                    if (datePart === today) {
                        cleaned[key] = value as number;
                    } else {
                        hasOldEntries = true;
                    }
                } else {
                    // Keep malformed keys for safety
                    cleaned[key] = value as number;
                }
            }
            
            // Write cleaned data if there were old entries
            if (hasOldEntries) {
                this.writeStore(cleaned);
            }
            
            return cleaned;
        } catch (error) {
            return {};
        }
    }

    private writeStore(data: Record<string, number>): boolean {
        try {
            fs.writeFileSync(this.storeFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            return false;
        }
    }

    public getCount(req: any): number {
        const data = this.readStore();
        const keys = this.getKeys(req);
        let max = 0;
        for (const key of keys) {
            const value = data[key] || 0;
            if (value > max) max = value;
        }
        return max;
    }

    public increment(req: any): number {
        const data = this.readStore();
        const keys = this.getKeys(req);
        let max = 0;
        for (const key of keys) {
            const count = (data[key] || 0) + 1;
            data[key] = count;
            if (count > max) max = count;
        }
        this.writeStore(data);
        return max;
    }

    public allowed(req: any): boolean {
        return this.getCount(req) < this.limitPerDay;
    }

    public ensureCookie(req: any, res: any, days: number = 30): void {
        if (!req.cookies || !req.cookies.tv_user) {
            const token = require('crypto').randomBytes(10).toString('hex');
            res.cookie('tv_user', token, {
                maxAge: days * 24 * 60 * 60 * 1000,
                httpOnly: true,
                secure: false,
                sameSite: 'lax'
            });
            if (!req.cookies) req.cookies = {};
            req.cookies.tv_user = token;
        }
    }
}

