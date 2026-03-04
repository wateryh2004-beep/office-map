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
            
            // 💡 诊断拦截：检查 KV 数据库是否挂载
            if (!process.env.KV_REST_API_URL) {
                throw new Error("Vercel KV 数据库未连接！请去 Vercel 的 Storage 重新 Connect。");
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

            // 💡 诊断拦截：检查 GitHub Token
            if (!process.env.GITHUB_TOKEN) throw new Error("环境变量 GITHUB_TOKEN 丢失！");

            const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
            let data;
            
            // 💡 诊断拦截：检查能否读到 users.xlsx
            try {
                const response = await octokit.repos.getContent({
                    owner: 'wateryh2004-beep', // 你的 GitHub 用户名
                    repo: 'office-map',
                    path: 'users.xlsx',
                    ref: 'main'
                });
                data = response.data;
            } catch (githubErr) {
                throw new Error("无法读取 GitHub 中的 users.xlsx，请检查路径或 Token：" + githubErr.message);
            }

            const buffer = Buffer.from(data.content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const users = XLSX.utils.sheet_to_json(sheet);

            const matchedUser = users.find(u => 
                String(u['姓名']) === String(name) && 
                String(u['工号']) === String(id) && 
                String(u['手机号']) === String(phone)
            );

            if (matchedUser) {
                // 💡 诊断拦截：检查 KV 数据库是否挂载
                if (!process.env.KV_REST_API_URL) {
                    throw new Error("Vercel KV 数据库未连接！无法生成动态房卡。");
                }

                const sessionToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
                await kv.set(`session_${name}`, sessionToken, { ex: 86400 });

                return res.status(200).json({ 
                    status: 'success', 
                    data: { name: matchedUser['姓名'], role: matchedUser['权限'] || 'viewer' },
                    token: sessionToken 
                });
            } else {
                return res.status(401).json({ status: 'fail', message: '姓名、工号或手机号不匹配' });
            }
        }
    } catch (e) {
        console.error("Login API Error:", e.message);
        // ★★★ 核心改动：把真实的病因直接抛给前端显示 ★★★
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
