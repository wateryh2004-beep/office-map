import { kv } from '@vercel/kv';
import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

// 辅助提取器
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
        // 1. 读取基础白名单
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const response = await octokit.repos.getContent({
            owner: 'wateryh2004-beep', // 确保与您的仓库名一致
            repo: 'office-map',
            path: 'users.xlsx',
            ref: 'main'
        });
        const buffer = Buffer.from(response.data.content, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const users = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

        // ==========================================
        // ★ 新增功能：一键导出所有用户的最新密码表
        // ==========================================
        if (action === 'export-latest') {
            const updatedUsers = [];
            for (let u of users) {
                const uEmail = getExcelValue(u, ['邮箱（即姓名）', '邮箱', 'name']);
                const uPhone = getExcelValue(u, ['手机号', '手机', 'id']);
                const defaultPwd = getExcelValue(u, ['内部号码（COS+手机后四位）', '内部号码', 'COS']) || '123456';
                
                let currentPwd = defaultPwd;
                let isModified = '未修改(使用默认)';
                
                // 检查 KV 数据库里是否有用户自己改过的密码
                if (hasKV && uEmail && uPhone) {
                    const pwdKey = `pwd_${uEmail}_${uPhone}`;
                    const kvPwd = await kv.get(pwdKey);
                    if (kvPwd) {
                        currentPwd = String(kvPwd);
                        isModified = '✅ 用户已修改';
                    }
                }
                
                // 组合新的 Excel 行数据
                const newUser = { 
                    ...u, 
                    '最新生效登录密码': currentPwd, 
                    '密码修改状态': isModified 
                };
                updatedUsers.push(newUser);
            }

            // 生成新的 Excel 并在内存中转为 Base64 发给前端
            const newSheet = XLSX.utils.json_to_sheet(updatedUsers);
            const newWorkbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(newWorkbook, newSheet, "最新账号名单");
            const base64Excel = XLSX.write(newWorkbook, { type: 'base64', bookType: 'xlsx' });
            
            return res.status(200).json({ status: 'success', data: base64Excel });
        }

        // ==========================================
        // 原有功能：查询或重置单个用户的密码
        // ==========================================
        const email = req.body?.email;
        const phone = req.body?.phone;
        
        if (!email || !phone) {
            return res.status(400).json({ status: 'fail', message: '必须提供邮箱和手机号' });
        }

        const matchedUser = users.find(u => {
            const uEmail = getExcelValue(u, ['邮箱（即姓名）', '邮箱', 'name']);
            const uPhone = getExcelValue(u, ['手机号', '手机', 'id']);
            return uEmail === email && uPhone === phone;
        });

        if (!matchedUser) {
            return res.status(404).json({ status: 'fail', message: '在 users.xlsx 白名单中找不到该邮箱和手机号，请核对。' });
        }

        const defaultPwd = getExcelValue(matchedUser, ['内部号码（COS+手机后四位）', '内部号码', 'COS']) || '123456';
        const pwdKey = `pwd_${email}_${phone}`;

        if (action === 'query') {
            if (!hasKV) return res.status(200).json({ status: 'success', password: defaultPwd + ' (未连接KV数据库，系统仅使用此默认密码)' });
            
            let currentPwd = await kv.get(pwdKey);
            if (!currentPwd) return res.status(200).json({ status: 'success', password: defaultPwd + ' (用户未修改过，当前为初始密码)' });
            
            return res.status(200).json({ status: 'success', password: currentPwd });
        } 
        else if (action === 'reset') {
            if (!hasKV) return res.status(400).json({ status: 'fail', message: 'KV 数据库未连接，无法执行重置操作' });
            
            await kv.del(pwdKey);
            await kv.del(`session_${email}`); // 踢下线
            return res.status(200).json({ status: 'success', password: defaultPwd });
        } 
        else {
            return res.status(400).json({ status: 'fail', message: '未知的操作类型' });
        }

    } catch (e) {
        console.error("Admin Pwd Error:", e.message);
        return res.status(500).json({ status: 'error', message: '服务器读取数据失败' });
    }
}
