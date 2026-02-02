const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    // 简单的并发锁（虽然GitHub API不能完美防并发，但对于低频使用足够了）
    const { user, action, details, time } = req.body;
    const LOG_PATH = 'logs/history.json';
    
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep'; // ★★★ 改成你的用户名 ★★★
    const REPO = 'office-map';        // ★★★ 改成你的仓库名 ★★★
    const BRANCH = 'main';

    try {
        // 1. 获取旧日志
        let sha = null;
        let content = [];
        try {
            const { data } = await octokit.repos.getContent({
                owner: OWNER, repo: REPO, path: LOG_PATH, ref: BRANCH
            });
            sha = data.sha;
            // GitHub返回的是base64，需要解码
            const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
            content = JSON.parse(decoded);
        } catch (e) {
            // 文件不存在或解析失败，就从空数组开始
        }

        // 2. 追加新日志 (最新的在最前)
        content.unshift({ user, action, details, time });
        
        // 限制日志条数，防止文件无限大 (比如只存最近1000条)
        if (content.length > 1000) content = content.slice(0, 1000);

        // 3. 保存回 GitHub
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER, repo: REPO, path: LOG_PATH,
            message: `log: ${user} searched`,
            content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
            sha: sha,
            branch: BRANCH,
            committer: { name: "Log Bot", email: "bot@vercel.app" }
        });

        return res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error("Log Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
