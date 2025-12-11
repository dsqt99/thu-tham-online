import * as fs from 'fs';
import * as path from 'path';

export class RateLimiter {
    private storeFile: string;
    private limitPerDay: number;

    constructor(storeFile?: string, limitPerDay: number = 3) {
        this.storeFile = storeFile || path.join(__dirname, '../storage/usage.json');
        this.limitPerDay = limitPerDay;

        const dir = path.dirname(this.storeFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (!fs.existsSync(this.storeFile)) {
            fs.writeFileSync(this.storeFile, JSON.stringify({}));
        }
    }

    private getIdentifier(req: any): string {
        if (req.cookies && req.cookies.tv_user) {
            const id = req.cookies.tv_user.replace(/[^a-zA-Z0-9_\-]/g, '');
            return id;
        } else {
            return req.ip || req.connection?.remoteAddress || 'anon';
        }
    }

    private getKey(req: any): string {
        const id = this.getIdentifier(req);
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        return `${id}_${date}`;
    }

    private readStore(): Record<string, number> {
        try {
            const contents = fs.readFileSync(this.storeFile, 'utf-8');
            const data = JSON.parse(contents);
            return data || {};
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
        const key = this.getKey(req);
        return data[key] || 0;
    }

    public increment(req: any): number {
        const data = this.readStore();
        const key = this.getKey(req);
        const count = (data[key] || 0) + 1;
        data[key] = count;
        this.writeStore(data);
        return count;
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

