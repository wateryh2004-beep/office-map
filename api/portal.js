const { kv } = require('@vercel/kv');
const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    const action = req.query.action;
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep';
    const REPO = 'office-map';
    const PATH = 'notice.json';

    // 强制使用北京时间
    const beijingTime = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
    const today = beijingTime.toISOString().split('T')[0];
    const msgKey = `messages:${today}`;

    try {
        // --- 1. 公告逻辑 (保持不变) ---
        if (action === 'get-notice') {
            try {
                const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: PATH, ref: 'main' });
                return res.status(200).json(JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')));
            } catch (e) {
                return res.status(200).json({ text: "欢迎登录系统门户！" });
            }
        }

        // --- 2. 留言墙逻辑 (加入自愈重构) ---
        if (action === 'get-messages') {
            // 💡 自愈逻辑：先查一下这个 Key 是什么类型的
            const type = await kv.type(msgKey);
            
            // 如果它不是列表（比如是旧的字符串），直接删掉重建
            if (type !== 'list' && type !== 'none') {
                console.warn(`检测到非法类型 ${type}，正在重置 Key: ${msgKey}`);
                await kv.del(msgKey);
                return res.status(200).json([]);
            }

            const msgs = await kv.lrange(msgKey, 0, -1) || [];
            const parsedMsgs = msgs.map(m => typeof m === 'string' ? JSON.parse(m) : m);
            return res.status(200).json(parsedMsgs);
        } 
        
        else if (action === 'post-message' && req.method === 'POST') {
            const { user, text } = req.body;
            if (!text) return res.status(400).json({ status: 'error', message: "内容为空" });

            // 💡 自愈逻辑：写入前再次检查类型，防止 WRONGTYPE 报错
            const type = await kv.type(msgKey);
            if (type !== 'list' && type !== 'none') {
                await kv.del(msgKey);
            }

            const newEntry = {
                user: user || "匿名",
                text: text,
                time: beijingTime.toISOString().split('T')[1].substring(0, 5)
            };

            // 使用原子操作推入列表
            await kv.rpush(msgKey, JSON.stringify(newEntry));
            await kv.expire(msgKey, 172800); // 48小时过期

            return res.status(200).json({ status: 'success' });
        }

        return res.status(400).json({ status: 'error', message: "Invalid Action" });

    } catch (e) {
        console.error("Portal API Error:", e.message);
        // ★ 将真实的 Redis 报错发回前端，方便我们定位 ★
        return res.status(500).json({ status: 'error', message: "Redis报错: " + e.message });
    }
}
