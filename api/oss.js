const OSS = require('ali-oss');
const crypto = require('crypto');

const client = new OSS({
    region: 'oss-cn-shanghai', // 确保与你阿里云后台一致
    accessKeyId: process.env.OSS_AK,
    accessKeySecret: process.env.OSS_SK,
    bucket: 'colliers-reports'
});

export default async function handler(req, res) {
    const action = req.query.action;

    try {
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

            // 解析文件夹：CommonPrefixes 里的内容就是该层级的子目录
            const folders = (result.prefixes || []).map(p => ({
                name: p,
                type: 'folder'
            }));

            // 解析文件：Objects 里的内容就是该层级下的文件
            const files = (result.objects || [])
                .filter(o => o.name !== prefix) // 排除目录自身
                .map(o => {
                    // 生成 1 小时有效的临时下载链接（防止 Bucket 私有时无法访问）
                    const url = client.signatureUrl(o.name, { expires: 3600 });
                    return {
                        name: o.name,
                        shortName: o.name.replace(prefix, ''), // 只显示文件名，不带路径
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

            // OSS 没有真正的移动，需要先 Copy 再 Delete
            await client.copy(newKey, oldKey);
            await client.delete(oldKey);
            
            return res.status(200).json({ status: 'success' });
        }

        return res.status(400).json({ message: "Invalid action" });

    } catch (e) {
        console.error("OSS API Error:", e.message);
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
