import { kv } from '@vercel/kv';
import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const action = req.query.action || (req.body && req.body.action);

    try {
        // ==========================================
        // 功能 1：查岗逻辑 (Check Session)
        // ==========================================
        if (action === 'check') {
            const { username, token } = req.body;
            if (!username || !token) return res.status(400).json({ status: 'invalid' });
            
            if (!process.env.KV_REST_API_URL) {
                throw new Error("Vercel KV 未连接");
            }
            
            const activeToken = await kv.get(`session_${username}`);
            if (activeToken === token) {
                return res.status(200).json({ status: 'valid' });
            } else {
                return res.status(200).json({ status: 'invalid' });
            }
        } 
        
        // ==========================================
        // 功能 2：登录并发放房卡逻辑 (Login)
        // ==========================================
        else {
            const { name, id, phone } = req.body;
            if (!name || !id || !phone) return res.status(400).json({ status: 'fail', message: '参数缺失' });

            if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN 丢失");

            const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
            const response = await octokit.repos.getContent({
                owner: 'wateryh2004-beep', // 你的 GitHub 用户名
                repo: 'office-map',
                path: 'users.xlsx',
                ref: 'main'
            });

            const buffer = Buffer.from(response.data.content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            
            const users = XLSX.utils.sheet_to_json(sheet, { defval: "" });

            // 🌟 核心修复：使用你真实的英文表头 (name, id, phone)
            const matchedUser = users.find(u => {
                const uName = u.name ? String(u.name).trim() : '';
                const uId = u.id ? String(u.id).trim() : '';
                const uPhone = u.phone ? String(u.phone).trim() : '';

                return uName === name && uId === id && uPhone === phone;
            });

            if (matchedUser) {
                const sessionToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
                await kv.set(`session_${name}`, sessionToken, { ex: 86400 });

                return res.status(200).json({ 
                    status: 'success', 
                    // 同样使用真实的英文 role 表头
                    data: { name: matchedUser.name, role: matchedUser.role || 'viewer' },
                    token: sessionToken 
                });
            } else {
                return res.status(401).json({ status: 'fail', message: '姓名、工号或手机号不匹配' });
            }
        }
    } catch (e) {
        console.error("Login API Error:", e.message);
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
