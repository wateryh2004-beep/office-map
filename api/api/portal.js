import { kv } from '@vercel/kv';
import { Octokit } from "@octokit/rest";

export default async function handler(req, res) {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep';
    const REPO = 'office-map';
    const PATH = 'notice.json';
    const action = req.query.action;

    try {
        // ==========================================
        // 1. 公告逻辑 (Notice Logic)
        // ==========================================
        if (action === 'get-notice') {
            try {
                const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: PATH, ref: 'main' });
                const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
                return res.status(200).json(JSON.parse(decoded));
            } catch (e) {
                return res.status(200).json({ text: "欢迎使用高力国际办公楼市场监测系统！" });
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
                message: `feat: Admin ${user} updated notice`,
                content: Buffer.from(JSON.stringify({ text })).toString('base64'),
                sha: sha, branch: 'main',
                committer: { name: "Admin", email: "bot@vercel.app" }
            });
            return res.status(200).json({ status: 'success' });
        }

        // ==========================================
        // 2. 留言墙逻辑 (Message Wall Logic)
        // ==========================================
        const today = new Date().toISOString().split('T')[0];
        const msgKey = `messages:${today}`;

        if (action === 'get-messages') {
            const msgs = await kv.get(msgKey) || [];
            return res.status(200).json(msgs);
        } 
        
        else if (action === 'post-message' && req.method === 'POST') {
            const { user, text } = req.body;
            if (!text) return res.status(400).json({ message: "内容不能为空" });

            const msgs = await kv.get(msgKey) || [];
            msgs.push({
                user,
                text,
                time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            });
            await kv.set(msgKey, msgs);
            return res.status(200).json({ status: 'success' });
        }

        return res.status(400).json({ message: "Invalid Action" });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
}
