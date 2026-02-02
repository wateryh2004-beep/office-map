const XLSX = require('xlsx');
const { Octokit } = require("@octokit/rest"); // 必须在 package.json 只有安装了这个库

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { user, data } = req.body;
    if (!user || !data || data.length === 0) {
        return res.status(400).json({ status: 'fail', message: '数据为空' });
    }

    try {
        // 1. 将 JSON 数据转换为 Excel Buffer
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "QuarterlyUpdate");
        // write 得到的是二进制 Buffer
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // 2. 准备上传到 GitHub
        // 文件名：姓名-日期-时间.xlsx
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = `updates/${user}-${dateStr}.xlsx`; // 存放在 updates 文件夹下

        // 初始化 GitHub 客户端
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN // 必须在 Vercel 环境变量里配置
        });

        // 获取仓库信息 (需要你手动填一下你的仓库名)
        const OWNER = 'wateryh2004-beep'; // ★★★ 你的 GitHub 用户名 ★★★
        const REPO = 'beep';              // ★★★ 你的仓库名 ★★★
        const BRANCH = 'main';            // 分支名，通常是 main 或 master

        // 3. 检查文件是否存在（为了获取 sha，如果是更新的话）
        let sha = null;
        try {
            const { data: existingFile } = await octokit.repos.getContent({
                owner: OWNER,
                repo: REPO,
                path: filename,
                ref: BRANCH,
            });
            sha = existingFile.sha; // 如果文件已存在，拿到 sha 才能覆盖
        } catch (e) {
            // 文件不存在，这是正常的，说明是第一次上传
        }

        // 4. 上传文件 (Create or Update)
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: filename,
            message: `feat: ${user} quarterly update`, // Commit message
            content: excelBuffer.toString('base64'), // 必须转为 base64
            sha: sha, // 如果是新建，sha 为 null；如果是覆盖，sha 必须有值
            branch: BRANCH,
            committer: {
                name: "Vercel Bot",
                email: "bot@vercel.app"
            }
        });

        return res.status(200).json({ status: 'success', filename: filename });

    } catch (error) {
        console.error("GitHub Upload Error:", error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
}
