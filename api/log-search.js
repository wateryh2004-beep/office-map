const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    const { user, action, details, time } = req.body;
    
    // ★★★ 核心修改 1：文件名自动带上年月 (例如 logs/2026-02.json) ★★★
    const currentMonth = new Date().toISOString().slice(0, 7); // 格式 "YYYY-MM"
    const LOG_PATH = `logs/${currentMonth}.json`;
    
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep'; // 请确认用户名
    const REPO = 'office-map';        // 请确认仓库名
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
            const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
            content = JSON.parse(decoded);
        } catch (e) {
            // 文件不存在，说明是这个月的第一条日志，新建空数组
        }

        // 2. 追加新日志 (最新的在最前)
        content.unshift({ user, action, details, time });
        
        // ★★★ 核心修改 2：删除了 slice(0,1000) 的限制，不再删除旧数据 ★★★

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
