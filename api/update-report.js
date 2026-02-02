const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { content, user } = req.body; // content 是 base64 字符串
    
    if (!content) return res.status(400).json({ status: 'fail', message: '文件内容为空' });

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep'; // 请确保这里是你的 GitHub 用户名
    const REPO = 'office-map';        // 请确保这里是你的仓库名
    const FILE_PATH = 'sample_report.pdf'; // ★★★ 目标文件名 ★★★
    const BRANCH = 'main';

    try {
        // 1. 获取原文件的 SHA (覆盖必须提供)
        let sha = null;
        try {
            const { data } = await octokit.repos.getContent({
                owner: OWNER, repo: REPO, path: FILE_PATH, ref: BRANCH
            });
            sha = data.sha;
        } catch (e) {
            // 文件不存在则新建
        }

        // 2. 执行覆盖操作
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: FILE_PATH,
            message: `feat: Admin ${user} updated market report PDF`, // Commit 信息
            content: content,
            sha: sha,
            branch: BRANCH,
            committer: { name: "Admin Bot", email: "bot@vercel.app" }
        });

        return res.status(200).json({ status: 'success' });

    } catch (error) {
        console.error("Update Report Error:", error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
}
