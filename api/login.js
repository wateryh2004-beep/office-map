const XLSX = require('xlsx');
const path = require('path');

export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. 获取前端传来的用户输入
        const { name, id, phone } = req.body;

        if (!name || !id || !phone) {
            return res.status(400).json({ status: 'fail', message: '信息填写不完整' });
        }

        // 2. 读取服务器上的用户表
        const filePath = path.join(process.cwd(), 'users.xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const users = XLSX.utils.sheet_to_json(sheet);

        // 3. 核心逻辑：比对信息
        // 必须 姓名、工号、手机号 全部匹配
        const user = users.find(u => 
            String(u.name).trim() === name.trim() &&
            String(u.id).trim() === id.trim() &&
            String(u.phone).trim() === phone.trim()
        );

        if (user) {
            // 4. 匹配成功，返回用户信息（不含密码，仅返回角色）
            return res.status(200).json({ 
                status: 'success', 
                data: {
                    name: user.name,
                    role: user.role || 'viewer' // 默认为普通用户
                }
            });
        } else {
            // 5. 匹配失败
            return res.status(401).json({ status: 'fail', message: '认证失败：信息不匹配或无权限' });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 'error', message: '服务器内部错误' });
    }
}
