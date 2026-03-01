const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { text, user } = req.body;
    
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep';
    const REPO = 'office-map';
    const PATH = 'notice.json';

    try {
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
        res.status(200).json({ status: 'success' });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
}
