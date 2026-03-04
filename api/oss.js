const OSS = require('ali-oss');
const crypto = require('crypto');

export default async function handler(req, res) {
    const action = req.query.action;

    try {
        // ★ 优化1：拦截环境变量丢失导致的底层闪崩
        if (!process.env.OSS_AK || !process.env.OSS_SK) {
            return res.status(500).json({ status: 'error', message: 'Vercel 环境变量 OSS_AK 或 OSS_SK 丢失，请检查 Vercel 项目设置！' });
        }

        // ★ 优化2：将客户端初始化移入内部，并设置 7 秒超时限制（防 Vercel 10s 强杀）
        const client = new OSS({
            region: 'oss-cn-shanghai', // 确保与你阿里云后台一致
            accessKeyId: process.env.OSS_AK,
            accessKeySecret: process.env.OSS_SK,
            bucket: 'colliers-reports',
            timeout: 7000 
        });

        // ==========================================
        // 1. 获取直传签名 (Browser Direct Upload)
        // ==========================================
        if (action === 'get-signature') {
            const date = new Date();
            date.setHours(date.getHours() + 1); // 1小时后过期
            const policy = {
                expiration: date.toISOString(),
                conditions: [
                    ["content-length-range", 0, 104857600], // 限制100MB
                    ["starts-with", "$key", ""] // 允许上传到任何路径
                ]
            };

            const base64Policy = Buffer.from(JSON.stringify(policy)).toString('base64');
            const signature = crypto
                .createHmac('sha1', process.env.OSS_SK)
                .update(base64Policy)
                .digest('base64');

            return res.status(200).json({
                status: 'success',
                accessid: process.env.OSS_AK,
                host: `https://${client.options.bucket}.${client.options.region}.aliyuncs.com`,
                policy: base64Policy,
                signature: signature,
                expire: Math.floor(date.getTime() / 1000)
            });
        }

        // ==========================================
        // 2. 获取目录列表 (Directory Drill-down)
        // ==========================================
        else if (action === 'get-list') {
            const prefix = req.query.prefix || ''; // 当前所在的文件夹路径
            
            // 使用 delimiter 实现“文件夹”效果
            const result = await client.list({
                prefix: prefix,
                delimiter: '/',
                'max-keys': 1000
            });

            // 解析文件夹
            const folders = (result.prefixes || []).map(p => ({
                name: p,
                type: 'folder'
            }));

            // 解析文件
            const files = (result.objects || [])
                .filter(o => o.name !== prefix) // 排除目录自身
                .map(o => {
                    const url = client.signatureUrl(o.name, { expires: 3600 });
                    return {
                        name: o.name,
                        shortName: o.name.replace(prefix, ''), 
                        size: (o.size / 1024 / 1024).toFixed(2) + ' MB',
                        lastModified: o.lastModified,
                        type: 'file',
                        url: url
                    };
                });

            return res.status(200).json({ 
                status: 'success', 
                currentPath: prefix,
                data: [...folders, ...files] 
            });
        }

        // ==========================================
        // 3. 删除文件 (Delete)
        // ==========================================
        else if (action === 'delete') {
            const fileKey = req.query.file;
            if (!fileKey) return res.status(400).json({ message: "Missing file key" });
            
            await client.delete(fileKey);
            return res.status(200).json({ status: 'success' });
        }

        // ==========================================
        // 4. 移动/重命名 (Move/Rename)
        // ==========================================
        else if (action === 'move' && req.method === 'POST') {
            const { oldKey, newKey } = req.body;
            if (!oldKey || !newKey) return res.status(400).json({ message: "Keys missing" });

            await client.copy(newKey, oldKey);
            await client.delete(oldKey);
            
            return res.status(200).json({ status: 'success' });
        }

        return res.status(400).json({ message: "Invalid action" });

    } catch (e) {
        console.error("OSS API Error:", e.message);
        // ★ 优化3：确保即使报错也是返回标准的 JSON 格式，绝不崩溃
        return res.status(500).json({ status: 'error', message: e.message || 'OSS接口网络超时或遇到内部错误' });
    }
}
