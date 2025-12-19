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

    private getIpIdentifier(req: any): string {
        const rawIp = req.ip || req.connection?.remoteAddress || 'anon';
        const normalized = String(rawIp).replace(/^::ffff:/, '');
        return normalized.replace(/[^a-zA-Z0-9_.:\-]/g, '') || 'anon';
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

