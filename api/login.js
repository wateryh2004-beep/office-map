import { kv } from '@vercel/kv';
import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    // 获取动作指令：如果是 'check' 就是查岗，否则就是默认的登录
    const action = req.query.action || (req.body && req.body.action);

    try {
        // ==========================================
        // 功能 1：查岗逻辑 (Check Session)
        // ==========================================
        if (action === 'check') {
            const { username, token } = req.body;
            if (!username || !token) return res.status(400).json({ status: 'invalid' });
            
            // 从 Vercel KV 里查出该用户当前合法的 Token
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
            const users = XLSX.utils.sheet_to_json(sheet);

            const matchedUser = users.find(u => 
                String(u['姓名']) === String(name) && 
                String(u['工号']) === String(id) && 
                String(u['手机号']) === String(phone)
            );

            if (matchedUser) {
                // 生成唯一的 Token (房卡)
                const sessionToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
                
                // 将 Token 存入 Vercel KV，有效期 24 小时 (86400秒)
                await kv.set(`session_${name}`, sessionToken, { ex: 86400 });

                return res.status(200).json({ 
                    status: 'success', 
                    data: { name: matchedUser['姓名'], role: matchedUser['权限'] || 'viewer' },
                    token: sessionToken 
                });
            } else {
                return res.status(401).json({ status: 'fail', message: '信息不匹配' });
            }
        }
    } catch (e) {
        console.error(e);
        return res.status(500).json({ status: 'error', message: '服务器验证失败' });
    }
}
