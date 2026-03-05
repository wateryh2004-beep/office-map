import { kv } from '@vercel/kv';
import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

// 辅助函数：智能匹配 Excel 表头，防止因为多敲空格或改名导致读取失败
const getExcelValue = (row, possibleKeys) => {
    const rowKeys = Object.keys(row);
    for (let pk of possibleKeys) {
        const exactMatch = rowKeys.find(rk => rk.trim() === pk);
        if (exactMatch && row[exactMatch] !== undefined) {
            return String(row[exactMatch]).trim();
        }
    }
    return '';
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const action = req.query.action || (req.body && req.body.action);
    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

    try {
        // ==========================================
        // 功能 1：查岗逻辑 (Heartbeat)
        // ==========================================
        if (action === 'check') {
            const { username, token } = req.body;
            if (!username || !token) return res.status(400).json({ status: 'invalid' });
            if (!hasKV) return res.status(200).json({ status: 'valid' });
            
            const activeToken = await kv.get(`session_${username}`);
            if (activeToken === token) return res.status(200).json({ status: 'valid' });
            return res.status(200).json({ status: 'invalid' });
        } 
        
        // ==========================================
        // 功能 2：修改密码逻辑 (Change Password)
        // ==========================================
        else if (action === 'change-pwd') {
            const { name, id, oldPwd, newPwd } = req.body; // 这里的 id 实际上是前端传来的 手机号
            if (!name || !id || !oldPwd || !newPwd) return res.status(400).json({ status: 'fail', message: '参数缺失' });
            if (!hasKV) throw new Error("KV 数据库未连接，无法修改密码");

            // 1. 验证用户是否存在于 Excel 白名单
            const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
            const response = await octokit.repos.getContent({
                owner: 'wateryh2004-beep', // 您的 GitHub 用户名
                repo: 'office-map',
                path: 'users.xlsx',
                ref: 'main'
            });
            const buffer = Buffer.from(response.data.content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const users = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
            
            // 匹配：邮箱(即姓名) + 手机号
            const matchedUser = users.find(u => {
                const uEmail = getExcelValue(u, ['邮箱（即姓名）', '邮箱', 'name']);
                const uPhone = getExcelValue(u, ['手机号', '手机', 'id']);
                return uEmail === name && uPhone === id;
            });
            if (!matchedUser) return res.status(401).json({ status: 'fail', message: '查无此人，请核对邮箱和手机号' });

            // 获取该用户的默认初始密码 (内部号码)
            const defaultPwd = getExcelValue(matchedUser, ['内部号码（COS+手机后四位）', '内部号码', 'COS']) || '123456';

            // 2. 验证旧密码
            const pwdKey = `pwd_${name}_${id}`;
            let currentPwd = await kv.get(pwdKey);
            if (!currentPwd) currentPwd = defaultPwd; 

            if (String(currentPwd) !== String(oldPwd)) {
                return res.status(401).json({ status: 'fail', message: '原密码错误' });
            }

            // 3. 写入新密码
            await kv.set(pwdKey, String(newPwd));
            
            // 4. 改密成功后，主动清除其登录 Token（强制重新登录）
            await kv.del(`session_${name}`);

            return res.status(200).json({ status: 'success', message: '密码修改成功，请重新登录' });
        }

        // ==========================================
        // 功能 3：登录验证逻辑 (Login)
        // ==========================================
        else {
            const { name, id, phone, password } = req.body; 
            // 兼容处理：前端可能通过 id 或 phone 发送手机号
            const loginPhone = phone || id; 

            if (!name || !loginPhone || !password) return res.status(400).json({ status: 'fail', message: '请填写完整信息' });

            const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
            const response = await octokit.repos.getContent({
                owner: 'wateryh2004-beep',
                repo: 'office-map',
                path: 'users.xlsx',
                ref: 'main'
            });

            const buffer = Buffer.from(response.data.content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const users = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

            // 匹配：邮箱(即姓名) + 手机号
            const matchedUser = users.find(u => {
                const uEmail = getExcelValue(u, ['邮箱（即姓名）', '邮箱', 'name']);
                const uPhone = getExcelValue(u, ['手机号', '手机', 'id']);
                return uEmail === name && uPhone === loginPhone;
            });

            if (matchedUser) {
                // 获取初始密码
                const defaultPwd = getExcelValue(matchedUser, ['内部号码（COS+手机后四位）', '内部号码', 'COS']) || '123456';
                const userRole = getExcelValue(matchedUser, ['Role', 'role']) || 'viewer';
                
                // 核对密码逻辑
                let isValid = false;
                if (hasKV) {
                    const pwdKey = `pwd_${name}_${loginPhone}`;
                    let realPwd = await kv.get(pwdKey);
                    if (!realPwd) realPwd = defaultPwd; // 如果没有修改过，则比对内部号码
                    
                    if (String(password) === String(realPwd)) isValid = true;
                } else {
                    // 如果 KV 没连上，仅比对内部号码
                    if (String(password) === defaultPwd) isValid = true;
                }

                if (isValid) {
                    const sessionToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
                    if (hasKV) {
                        await kv.set(`session_${name}`, sessionToken, { ex: 86400 });
                    }
                    return res.status(200).json({ 
                        status: 'success', 
                        data: { name: name, role: userRole },
                        token: sessionToken 
                    });
                } else {
                    return res.status(401).json({ status: 'fail', message: '密码(内部号码)错误' });
                }
            } else {
                return res.status(401).json({ status: 'fail', message: '账号不存在或邮箱与手机号不匹配' });
            }
        }
    } catch (e) {
        console.error("API Error:", e.message);
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
