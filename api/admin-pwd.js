import { kv } from '@vercel/kv';
import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

// 辅助提取器，与 login.js 保持容错一致
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

    const action = req.query.action;
    const { email, phone } = req.body;
    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

    if (!email || !phone) {
        return res.status(400).json({ status: 'fail', message: '必须提供邮箱和手机号' });
    }

    try {
        // 1. 读取白名单获取用户基础信息
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

        // 匹配用户
        const matchedUser = users.find(u => {
            const uEmail = getExcelValue(u, ['邮箱（即姓名）', '邮箱', 'name']);
            const uPhone = getExcelValue(u, ['手机号', '手机', 'id']);
            return uEmail === email && uPhone === phone;
        });

        if (!matchedUser) {
            return res.status(404).json({ status: 'fail', message: '在 users.xlsx 白名单中找不到该邮箱和手机号的组合，请核对。' });
        }

        // 获取他的原始内部号码（默认密码）
        const defaultPwd = getExcelValue(matchedUser, ['内部号码（COS+手机后四位）', '内部号码', 'COS']) || '123456';
        const pwdKey = `pwd_${email}_${phone}`;

        // ============================
        // 动作1：查询当前密码
        // ============================
        if (action === 'query') {
            if (!hasKV) {
                return res.status(200).json({ status: 'success', password: defaultPwd + ' (未连接KV数据库，系统仅使用此默认密码)' });
            }
            
            let currentPwd = await kv.get(pwdKey);
            if (!currentPwd) {
                return res.status(200).json({ status: 'success', password: defaultPwd + ' (用户未修改过，当前为初始密码)' });
            }
            return res.status(200).json({ status: 'success', password: currentPwd });
        }
        
        // ============================
        // 动作2：重置为默认密码
        // ============================
        else if (action === 'reset') {
            if (!hasKV) {
                return res.status(400).json({ status: 'fail', message: 'KV 数据库未连接，无法执行重置操作' });
            }
            
            // 直接在 KV 中删除该用户的自定义密码记录
            await kv.del(pwdKey);
            // 同时踢他下线
            await kv.del(`session_${email}`);
            
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
