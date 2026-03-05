import { kv } from '@vercel/kv';
import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

// 辅助提取器，智能匹配 Excel 表头
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
        if (action === 'check') {
            const { username, token } = req.body;
            if (!username || !token) return res.status(400).json({ status: 'invalid' });
            if (!hasKV) return res.status(200).json({ status: 'valid' });
            
            const activeToken = await kv.get(`session_${username}`);
            if (activeToken === token) return res.status(200).json({ status: 'valid' });
            return res.status(200).json({ status: 'invalid' });
        } 
        
        else if (action === 'change-pwd') {
            const { name, id, oldPwd, newPwd } = req.body; 
            if (!name || !id || !oldPwd || !newPwd) return res.status(400).json({ status: 'fail', message: '参数缺失' });
            if (!hasKV) throw new Error("KV 数据库未连接");

            const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
            const response = await octokit.repos.getContent({ owner: 'wateryh2004-beep', repo: 'office-map', path: 'users.xlsx', ref: 'main' });
            const buffer = Buffer.from(response.data.content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const users = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
            
            const matchedUser = users.find(u => {
                const uEmail = getExcelValue(u, ['邮箱（即姓名）', '邮箱', 'name']);
                const uPhone = getExcelValue(u, ['手机号', '手机', 'id']);
                return uEmail === name && uPhone === id;
            });
            if (!matchedUser) return res.status(401).json({ status: 'fail', message: '查无此人' });

            const defaultPwd = getExcelValue(matchedUser, ['内部号码（COS+手机后四位）', '内部号码', 'COS']) || '123456';
            const pwdKey = `pwd_${name}_${id}`;
            let currentPwd = await kv.get(pwdKey);
            if (!currentPwd) currentPwd = defaultPwd; 

            if (String(currentPwd) !== String(oldPwd)) return res.status(401).json({ status: 'fail', message: '原密码错误' });

            await kv.set(pwdKey, String(newPwd));
            await kv.del(`session_${name}`);
            return res.status(200).json({ status: 'success', message: '密码修改成功，请重新登录' });
        }

        else {
            const { name, id, phone, password } = req.body; 
            const loginPhone = phone || id; 

            if (!name || !loginPhone || !password) return res.status(400).json({ status: 'fail', message: '请填写完整信息' });

            const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
            const response = await octokit.repos.getContent({ owner: 'wateryh2004-beep', repo: 'office-map', path: 'users.xlsx', ref: 'main' });
            const buffer = Buffer.from(response.data.content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const users = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

            const matchedUser = users.find(u => {
                const uEmail = getExcelValue(u, ['邮箱（即姓名）', '邮箱', 'name']);
                const uPhone = getExcelValue(u, ['手机号', '手机', 'id']);
                return uEmail === name && uPhone === loginPhone;
            });

            if (matchedUser) {
                const defaultPwd = getExcelValue(matchedUser, ['内部号码（COS+手机后四位）', '内部号码', 'COS']) || '123456';
                const userRole = getExcelValue(matchedUser, ['Role', 'role']) || 'viewer';
                
                // ★ 新增：提取 Full Name，如果找不到则降级使用中文名或邮箱
                const userFullName = getExcelValue(matchedUser, ['Full Name', 'Full Name (First/Middle/Last)', 'Full Name\n(First/Middle/Last)', '中文名']) || name;
                
                let isValid = false;
                if (hasKV) {
                    const pwdKey = `pwd_${name}_${loginPhone}`;
                    let realPwd = await kv.get(pwdKey);
                    if (!realPwd) realPwd = defaultPwd; 
                    if (String(password) === String(realPwd)) isValid = true;
                } else {
                    if (String(password) === defaultPwd) isValid = true;
                }

                if (isValid) {
                    const sessionToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
                    if (hasKV) await kv.set(`session_${name}`, sessionToken, { ex: 86400 });
                    
                    return res.status(200).json({ 
                        status: 'success', 
                        // ★ 新增：把 fullName 传给前端
                        data: { name: name, role: userRole, fullName: userFullName },
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
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
