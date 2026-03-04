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

            const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
            const { data } = await octokit.repos.getContent({
                owner: 'wateryh2004-beep', // 你的 GitHub 用户名
                repo: 'office-map',
                path: 'users.xlsx',
                ref: 'main'
            });

            const buffer = Buffer.from(data.content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            
            // 加入 defval 防止空单元格报错
            const users = XLSX.utils.sheet_to_json(sheet, { defval: "" });

            // 🌟 终极容错匹配逻辑
            const matchedUser = users.find(u => {
                // 安全提取 Excel 数据：强行转为字符串，并强行剔除首尾所有不可见空格
                const uName = u['姓名'] ? String(u['姓名']).trim() : '';
                const uId = u['工号'] ? String(u['工号']).trim() : '';
                const uPhone = u['手机号'] ? String(u['手机号']).trim() : '';

                return uName === name && uId === id && uPhone === phone;
            });

            if (matchedUser) {
                const sessionToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
                await kv.set(`session_${name}`, sessionToken, { ex: 86400 });

                return res.status(200).json({ 
                    status: 'success', 
                    data: { name: matchedUser['姓名'], role: matchedUser['权限'] || 'viewer' },
                    token: sessionToken 
                });
            } else {
                // 🕵️‍♂️ 如果还是不匹配，把真实收到的数据打印到 Vercel 日志里
                console.log("【前端传来的数据】:", { name, id, phone });
                console.log("【Excel解析的第一条数据示例】:", users[0]);
                
                return res.status(401).json({ status: 'fail', message: '姓名、工号或手机号不匹配' });
            }
        }
    } catch (e) {
        console.error("Login API Error:", e.message);
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
