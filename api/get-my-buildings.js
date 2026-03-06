import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

// 辅助提取器，防止表头空格或轻微改名导致匹配失败
const getExcelValue = (row, possibleKeys) => {
    const rowKeys = Object.keys(row);
    for (let pk of possibleKeys) {
        const exactMatch = rowKeys.find(rk => rk.trim() === pk);
        if (exactMatch && row[exactMatch] !== undefined) {
            return String(row[exactMatch]).trim();
        }
    }
    return '';
};

// 辅助函数：从 GitHub 拉取文件并解析
async function fetchExcelFromGithub(octokit, owner, repo, path) {
    try {
        const response = await octokit.repos.getContent({ owner, repo, path, ref: 'main' });
        const buffer = Buffer.from(response.data.content, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    } catch (e) {
        throw new Error(`无法从 GitHub 读取文件: ${path}`);
    }
}

export default async function handler(req, res) {
    try {
        const userName = req.query.user;
        if (!userName) return res.status(400).json({ status: 'fail', message: '未指定用户' });

        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const repoConfig = { owner: 'wateryh2004-beep', repo: 'office-map' }; // 替换为你的库

        // ==========================================
        // 步骤 1：动态读取新增的“任务分配表” (assignments.xlsx)
        // ==========================================
        let assignData = [];
        try {
            assignData = await fetchExcelFromGithub(octokit, repoConfig.owner, repoConfig.repo, 'assignments.xlsx');
        } catch (err) {
            return res.status(500).json({ status: 'error', message: '系统找不到分配表 assignments.xlsx，请管理员先上传。' });
        }

        // ==========================================
        // 步骤 2：过滤出该用户负责的所有【写字楼名称】
        // ==========================================
        const myAssignedBuildings = assignData
            .filter(item => {
                const owner = getExcelValue(item, ['负责人名称', '负责人', 'User', 'USER', '姓名']);
                return owner && owner === String(userName).trim();
            })
            .map(item => {
                return getExcelValue(item, ['写字楼名称', '名称', 'Project Name CN', '项目名称']);
            })
            .filter(name => name !== '');

        // 如果分配表里没有他的名字，直接返回空数组，前端会显示“无负责项目”
        if (myAssignedBuildings.length === 0) {
            return res.status(200).json({ status: 'success', data: [] });
        }

        // ==========================================
        // 步骤 3：动态读取“核心底表” (data.xlsx)
        // ==========================================
        const allData = await fetchExcelFromGithub(octokit, repoConfig.owner, repoConfig.repo, 'data.xlsx');

        // ==========================================
        // 步骤 4：终极匹配
        // ==========================================
        const myData = allData.filter(item => {
            const buildingName = getExcelValue(item, ['写字楼名称', 'Project Name CN', 'name']);
            return myAssignedBuildings.includes(buildingName);
        });

        // 步骤 5：返回给前端
        return res.status(200).json({ status: 'success', data: myData });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ status: 'error', message: e.message || '服务器内部错误' });
    }
}
