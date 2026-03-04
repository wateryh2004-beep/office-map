import { kv } from '@vercel/kv';
import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const action = req.query.action || (req.body && req.body.action);

    // 检查是否有 KV 环境变量
    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

    try {
        if (action === 'check') {
            const { username, token } = req.body;
            if (!username || !token) return res.status(400).json({ status: 'invalid' });
            
            // 如果 KV 没连上，直接放行，不强制踢人
            if (!hasKV) {
                return res.status(200).json({ status: 'valid' });
            }
            
            const activeToken = await kv.get(`session_${username}`);
            if (activeToken === token) {
                return res.status(200).json({ status: 'valid' });
            } else {
                return res.status(200).json({ status: 'invalid' });
            }
        } 
        else {
            const { name, id, phone } = req.body;
            if (!name || !id || !phone) return res.status(400).json({ status: 'fail', message: '参数缺失' });

            if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN 丢失");

            const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
            const response = await octokit.repos.getContent({
                owner: 'wateryh2004-beep', 
                repo: 'office-map',
                path: 'users.xlsx',
                ref: 'main'
            });

            const buffer = Buffer.from(response.data.content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const users = XLSX.utils.sheet_to_json(sheet, { defval: "" });

            const matchedUser = users.find(u => {
                const uName = u.name ? String(u.name).trim() : '';
                const uId = u.id ? String(u.id).trim() : '';
                const uPhone = u.phone ? String(u.phone).trim() : '';
                return uName === name && uId === id && uPhone === phone;
            });

            if (matchedUser) {
                const sessionToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
                
                // 如果 KV 连上了，就存入房卡；如果没连上，就跳过这一步，绝不报错！
                if (hasKV) {
                    try {
                        await kv.set(`session_${name}`, sessionToken, { ex: 86400 });
                    } catch (kvErr) {
                        console.error("KV 写入失败，但不影响登录", kvErr);
                    }
                }

                return res.status(200).json({ 
                    status: 'success', 
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
