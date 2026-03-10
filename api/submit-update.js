const XLSX = require('xlsx');
const { Octokit } = require("@octokit/rest");
const { kv } = require('@vercel/kv'); // [新增] 引入 KV 数据库用于存取云端草稿

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // [新增] 多解构出了 action 和 tab 参数，用于判断当前是在存草稿还是正式提交
    const { action, user, tab, data } = req.body;

    // =========================================================
    // 【新增功能区】逻辑分支 1：处理云端草稿 (存、取、清空)
    // =========================================================
    if (action === 'save-draft' || action === 'load-draft' || action === 'clear-draft') {
        if (!user || !tab) return res.status(400).json({ status: 'error', message: '缺少参数' });
        
        const key = `draft_${user}_${tab}`;
        const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
        if (!hasKV) return res.status(500).json({ status: 'error', message: '未连接 KV 数据库' });

        try {
            if (action === 'save-draft') {
                await kv.set(key, data);
                return res.status(200).json({ status: 'success' });
            } else if (action === 'load-draft') {
                const draftData = await kv.get(key);
                return res.status(200).json({ status: 'success', data: draftData || {} });
            } else if (action === 'clear-draft') {
                await kv.del(key);
                return res.status(200).json({ status: 'success' });
            }
        } catch (error) {
            return res.status(500).json({ status: 'error', message: error.message });
        }
        return; // 草稿逻辑执行完毕，直接返回，绝对不会影响下面的正式提交
    }


    // =========================================================
    // 【原始功能区】逻辑分支 2：原有的正式提交逻辑 (完全没有修改)
    // =========================================================
    
    // 检查是否配置了 GitHub Token (您的原代码)
    if (!process.env.GITHUB_TOKEN) {
        return res.status(500).json({ status: 'error', message: 'Vercel 环境变量 GITHUB_TOKEN 未配置' });
    }

    try {
        // 1. 生成 Excel 文件 (在内存中) (您的原代码)
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // 2. 准备上传
        // 文件名：updates/姓名-日期-时间戳.xlsx (您的原代码)
        const dateStr = new Date().toISOString().split('T')[0]; 
        const timestamp = new Date().getTime(); 
        const filename = `updates/${user}-${dateStr}-${timestamp}.xlsx`; 

        // 3. 初始化 GitHub 客户端 (您的原代码)
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });

        // ★★★ 请务必确认这里的用户名和仓库名是正确的 ★★★ (您的原代码)
        const OWNER = 'wateryh2004-beep'; // 你的 GitHub 用户名
        const REPO = 'office-map';              // 你的仓库名
        const BRANCH = 'main';            // 分支名

        // 4. 上传文件 (您的原代码)
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: filename,
            message: `feat: ${user} uploaded quarterly data`,
            content: excelBuffer.toString('base64'),
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
