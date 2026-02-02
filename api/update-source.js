const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { content, user } = req.body; // content 是 base64 字符串
    
    if (!content) return res.status(400).json({ status: 'fail', message: '文件内容为空' });

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep'; 
    const REPO = 'office-map';        
    const FILE_PATH = 'data.xlsx';
    const BRANCH = 'main';

    try {
        // 1. 先获取原文件的 SHA (覆盖文件必须提供 SHA)
        let sha = null;
        try {
            const { data } = await octokit.repos.getContent({
                owner: OWNER, repo: REPO, path: FILE_PATH, ref: BRANCH
            });
            sha = data.sha;
        } catch (e) {
            // 如果文件不存在（虽然不太可能），sha 保持 null
        }

        // 2. 执行覆盖操作
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: FILE_PATH,
            message: `feat: Admin ${user} updated source data.xlsx`, // Commit 信息
            content: content,
            sha: sha, // 关键：有 sha 才是更新，没 sha 是新建
            branch: BRANCH,
            committer: { name: "Admin Bot", email: "bot@vercel.app" }
        });

        return res.status(200).json({ status: 'success' });

    } catch (error) {
        console.error("Update Source Error:", error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
}
