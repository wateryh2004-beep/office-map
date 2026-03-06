const XLSX = require('xlsx');
const path = require('path');

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

export default function handler(req, res) {
    try {
        const userName = req.query.user;
        if (!userName) return res.status(400).json({ status: 'fail', message: '未指定用户' });

        // ==========================================
        // 步骤 1：读取新增的“任务分配表” (assignments.xlsx)
        // ==========================================
        const assignPath = path.join(process.cwd(), 'assignments.xlsx');
        let assignData = [];
        try {
            const assignWorkbook = XLSX.readFile(assignPath);
            const assignSheet = assignWorkbook.Sheets[assignWorkbook.SheetNames[0]];
            assignData = XLSX.utils.sheet_to_json(assignSheet, { defval: "" });
        } catch (err) {
            // 如果文件还没上传，友好提示
            return res.status(500).json({ status: 'error', message: '系统找不到分配表 assignments.xlsx，请管理员先上传。' });
        }

        // ==========================================
        // 步骤 2：过滤出该用户负责的所有【写字楼名称】
        // ==========================================
        const myAssignedBuildings = assignData
            .filter(item => {
                // 智能匹配负责人列名
                const owner = getExcelValue(item, ['负责人名称', '负责人', 'User', 'USER']);
                return owner && owner === String(userName).trim();
            })
            .map(item => {
                // 提取楼宇名称
                return getExcelValue(item, ['写字楼名称', '名称', 'Project Name CN']);
            })
            .filter(name => name !== ''); // 过滤掉空名字

        // 如果分配表里没有他的名字，直接返回空数组
        if (myAssignedBuildings.length === 0) {
            return res.status(200).json({ status: 'success', data: [] });
        }

        // ==========================================
        // 步骤 3：读取“核心底表” (data.xlsx)
        // ==========================================
        const dataPath = path.join(process.cwd(), 'data.xlsx');
        const workbook = XLSX.readFile(dataPath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const allData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        // ==========================================
        // 步骤 4：终极匹配 (拿分配表里的名字去底表里捞数据)
        // ==========================================
        const myData = allData.filter(item => {
            const buildingName = getExcelValue(item, ['写字楼名称', 'Project Name CN', 'name']);
            // 判断这栋楼的名字，是否在当前用户的分配名单里
            return myAssignedBuildings.includes(buildingName);
        });

        // 步骤 5：返回给前端
        return res.status(200).json({ status: 'success', data: myData });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ status: 'error', message: '服务器读取数据失败: ' + e.message });
    }
}
