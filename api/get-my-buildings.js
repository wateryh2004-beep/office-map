import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

// 辅助提取器：智能匹配表头，并且强制去除所有首尾空格
const getExcelValue = (row, possibleKeys) => {
    const rowKeys = Object.keys(row);
    for (let pk of possibleKeys) {
        const exactMatch = rowKeys.find(rk => rk.trim() === pk);
        if (exactMatch && row[exactMatch] !== undefined) {
            return String(row[exactMatch]).trim(); // 强制 trim，消除暗坑
        }
    }
    return '';
};

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
        // 1. 获取前端传来的用户名，并强制转为小写去空格，消除大小写差异
        const rawUserName = req.query.user;
        if (!rawUserName) return res.status(400).json({ status: 'fail', message: '未指定用户' });
        const targetUser = String(rawUserName).trim().toLowerCase();

        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const repoConfig = { owner: 'wateryh2004-beep', repo: 'office-map' };

        // 2. 读取任务分配表
        let assignData = [];
        try {
            assignData = await fetchExcelFromGithub(octokit, repoConfig.owner, repoConfig.repo, 'assignments.xlsx');
        } catch (err) {
            return res.status(500).json({ status: 'error', message: '系统找不到分配表 assignments.xlsx，请管理员先上传。' });
        }

        // 3. 过滤出该用户负责的楼宇名称 (容错：全部转大写比对，防止拼写不一致)
        const myAssignedBuildings = assignData
            .filter(item => {
                const owner = getExcelValue(item, ['负责人名称', '负责人', 'User', 'USER', '姓名']);
                // 转小写比对：就算 Excel 里写的是 "alex zhu "，前端传的是 "Alex Zhu"，也能匹配上
                return owner.toLowerCase() === targetUser;
            })
            .map(item => {
                const bName = getExcelValue(item, ['写字楼名称', '名称', 'Project Name CN', '项目名称']);
                return bName.toUpperCase(); // 转大写存入数组
            })
            .filter(name => name !== '');

        if (myAssignedBuildings.length === 0) {
            return res.status(200).json({ status: 'success', data: [] });
        }

        // 4. 读取核心底表
        const allData = await fetchExcelFromGithub(octokit, repoConfig.owner, repoConfig.repo, 'data.xlsx');

        // 5. 终极匹配：将底表的楼宇名称转大写后，看看是否在负责名单中
        const myData = allData.filter(item => {
            const buildingName = getExcelValue(item, ['写字楼名称', 'Project Name CN', 'name']).toUpperCase();
            return myAssignedBuildings.includes(buildingName);
        });

        return res.status(200).json({ status: 'success', data: myData });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ status: 'error', message: e.message || '服务器内部错误' });
    }
}
