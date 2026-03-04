const { kv } = require('@vercel/kv');
const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    const action = req.query.action;
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep';
    const REPO = 'office-map';
    const PATH = 'notice.json';

    // 强制使用北京时间计算 Key
    const beijingTime = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
    const today = beijingTime.toISOString().split('T')[0];
    const msgKey = `messages:${today}`;

    try {
        // --- 1. 公告逻辑 (保持不变) ---
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

        // --- 2. 留言墙逻辑 (重构为原子操作) ---
        if (action === 'get-messages') {
            // 获取从 0 到 -1 (即所有) 的列表项
            const msgs = await kv.lrange(msgKey, 0, -1) || [];
            // 如果存入时是字符串对象，解析它
            const parsedMsgs = msgs.map(m => typeof m === 'string' ? JSON.parse(m) : m);
            return res.status(200).json(parsedMsgs);
        } 
        
        else if (action === 'post-message' && req.method === 'POST') {
            const { user, text } = req.body;
            if (!text) return res.status(400).json({ status: 'error', message: "内容不能为空" });

            const newEntry = {
                user: user || "匿名",
                text: text,
                time: beijingTime.toISOString().split('T')[1].substring(0, 5)
            };

            // 🚀 原子操作：将新消息推入 Redis List 末尾
            // 并设置过期时间为 48 小时，自动清理旧数据节省空间
            await kv.rpush(msgKey, JSON.stringify(newEntry));
            await kv.expire(msgKey, 172800); 

            return res.status(200).json({ status: 'success' });
        }

        return res.status(400).json({ status: 'error', message: "Invalid Action" });

    } catch (e) {
        console.error("Portal API Error:", e.message);
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
