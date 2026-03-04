const { kv } = require('@vercel/kv');
const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    const action = req.query.action;
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep';
    const REPO = 'office-map';
    const PATH = 'notice.json';

    // 💡 获取北京时间 (GMT+8)
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const today = beijingTime.toISOString().split('T')[0];
    const msgKey = `messages:${today}`;

    try {
        // ==========================================
        // 1. 公告逻辑 (Notice)
        // ==========================================
        if (action === 'get-notice') {
            try {
                const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: PATH, ref: 'main' });
                const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
                return res.status(200).json(JSON.parse(decoded));
            } catch (e) {
                return res.status(200).json({ text: "欢迎登录系统门户！" });
            }
        } 
        
        else if (action === 'update-notice' && req.method === 'POST') {
            const { text, user } = req.body;
            let sha = null;
            try {
                const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: PATH, ref: 'main' });
                sha = data.sha;
            } catch (e) {}
            await octokit.repos.createOrUpdateFileContents({
                owner: OWNER, repo: REPO, path: PATH,
                message: `Admin ${user} updated notice`,
                content: Buffer.from(JSON.stringify({ text })).toString('base64'),
                sha: sha, branch: 'main'
            });
            return res.status(200).json({ status: 'success' });
        }

        // ==========================================
        // 2. 留言墙逻辑 (Message Wall)
        // ==========================================
        if (action === 'get-messages') {
            let msgs = await kv.get(msgKey);
            // 🛡️ 强制容错：如果拿到的不是数组，立刻重置为空数组
            if (!Array.isArray(msgs)) msgs = [];
            return res.status(200).json(msgs);
        } 
        
        else if (action === 'post-message' && req.method === 'POST') {
            const { user, text } = req.body;
            if (!text) return res.status(400).json({ status: 'error', message: "内容为空" });

            // 🛡️ 关键修复：在写入前再次强制校验类型
            let currentMsgs = await kv.get(msgKey);
            if (!Array.isArray(currentMsgs)) currentMsgs = [];

            const newEntry = {
                user: user || "匿名用户",
                text: text,
                // 强制使用北京时间显示
                time: new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[1].substring(0, 5)
            };

            currentMsgs.push(newEntry);
            
            // 限制每天最多显示 50 条，防止 Vercel 接口超载
            if (currentMsgs.length > 50) currentMsgs = currentMsgs.slice(-50);

            await kv.set(msgKey, JSON.stringify(currentMsgs)); // 显式转为 JSON 字符串存储
            return res.status(200).json({ status: 'success' });
        }

        return res.status(400).json({ status: 'error', message: "无效的 Action" });

    } catch (e) {
        console.error("Portal API Error:", e.message);
        return res.status(500).json({ status: 'error', message: "服务器忙: " + e.message });
    }
}
