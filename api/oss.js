import OSS from 'ali-oss';

export default async function handler(req, res) {
    // 1. 获取请求类型 (支持 GET 的 query 和 POST 的 body)
    const action = req.query.action || (req.body && req.body.action);

    if (!action) {
        return res.status(400).json({ status: 'error', message: '缺少 action 参数' });
    }

    try {
        // 2. 初始化阿里云 OSS 客户端 (使用你之前在 Vercel 填好的环境变量)
        const client = new OSS({
            region: process.env.ALIYUN_OSS_REGION,
            accessKeyId: process.env.ALIYUN_OSS_AK,
            accessKeySecret: process.env.ALIYUN_OSS_SK,
            bucket: process.env.ALIYUN_OSS_BUCKET,
        });

        // ==========================================
        // 功能 1：签发直传通行证 (用于 admin.html 上传)
        // ==========================================
        if (action === 'get-signature') {
            // 设置通行证的过期时间为 10 分钟后
            const date = new Date();
            date.setMinutes(date.getMinutes() + 10);
            
            const policy = {
                expiration: date.toISOString(),
                conditions: [
                    ["content-length-range", 0, 104857600] // 限制文件最大 100MB
                ]
            };

            // 计算签名
            const formData = client.calculatePostSignature(policy);
            
            // 拼接出你的 OSS 专属外网直传地址
            const host = `https://${process.env.ALIYUN_OSS_BUCKET}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com`;

            return res.status(200).json({
                status: 'success',
                host: host,
                policy: formData.policy,
                OSSAccessKeyId: formData.OSSAccessKeyId,
                signature: formData.Signature
            });
        }

        // ==========================================
        // 功能 2：获取带有安全下载链接的文件列表 (用于 reports.html)
        // ==========================================
        else if (action === 'get-list') {
            // 从 OSS 拉取最多 1000 个文件的基础信息
            const result = await client.list({ 'max-keys': 1000 });
            const files = result.objects || [];

            // 遍历文件，为每个文件生成一个 10 分钟后自动过期的临时下载链接
            const data = files.map(file => {
                // client.signatureUrl 会生成带有时效性的安全 URL
                const url = client.signatureUrl(file.name, { expires: 600 }); 
                
                return {
                    name: file.name,
                    size: (file.size / 1024 / 1024).toFixed(2) + ' MB', // 转换为 MB
                    lastModified: file.lastModified,
                    downloadUrl: url
                };
            });

            // 按照上传时间倒序排列 (最新的在最上面)
            data.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

            return res.status(200).json({ status: 'success', data: data });
        }

        // ==========================================
        // 功能 3：删除指定文件 (用于 admin.html 管理)
        // ==========================================
        else if (action === 'delete') {
            const fileName = req.query.file || (req.body && req.body.file);
            if (!fileName) throw new Error("缺少文件名");
            
            await client.delete(fileName);
            return res.status(200).json({ status: 'success', message: '删除成功' });
        }

        // 未知操作
        else {
            return res.status(400).json({ status: 'error', message: '未知的 action' });
        }

    } catch (e) {
        console.error("OSS API Error:", e);
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
