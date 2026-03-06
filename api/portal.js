import { kv } from '@vercel/kv';
import { Octokit } from "@octokit/rest";

// 异步静默功能：将聊天记录永久归档到 GitHub (按月分表)
async function saveChatToGitHub(msgObj, monthStr) {
    try {
        if (!process.env.GITHUB_TOKEN) return;
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const owner = 'wateryh2004-beep'; // 您的 GitHub 用户名
        const repo = 'office-map';
        const path = `logs/chat-${monthStr}.json`; // 比如 logs/chat-2026-03.json

        let chatHistory = [];
        let sha = null;
        
        // 尝试获取当月的历史聊天记录文件
        try {
            const { data } = await octokit.repos.getContent({ owner, repo, path, ref: 'main' });
            const content = Buffer.from(data.content, 'base64').toString('utf8');
            chatHistory = JSON.parse(content);
            sha = data.sha;
        } catch (e) {
            // 如果这个月是第一次有人发消息，文件不存在，直接跳过进入创建流程
        }

        // 把新消息塞进历史记录
        chatHistory.push(msgObj);

        // 写回 GitHub
        await octokit.repos.createOrUpdateFileContents({
            owner, repo, path,
            message: `💬 交流板归档: ${msgObj.user}`,
            content: Buffer.from(JSON.stringify(chatHistory, null, 2)).toString('base64'),
            sha: sha,
            branch: 'main'
        });
    } catch(e) {
        console.error("Chat Archive Error:", e.message);
    }
}

export default async function handler(req, res) {
    // 兼容通过 URL 参数或 Body 传递 action
    const action = req.query.action || (req.body && req.body.action);
    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

    // ★ 保留的原功能：如果未绑定 KV 数据库的降级处理
    if (!hasKV) {
        if (action === 'get-notice') {
            return res.status(200).json({ status: 'success', text: '欢迎使用高力国际办公楼市场数据终端！' });
        }
        if (action === 'get-messages') {
            return res.status(200).json([]);
        }
        return res.status(400).json({ status: 'fail', message: 'Vercel KV 数据库未连接，无法发布和保存动态数据。' });
    }

    try {
        // 计算精准的北京时间 (处理 Vercel 零时区问题)
        const d = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; // YYYY-MM-DD
        const monthStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; // YYYY-MM
        const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; // HH:mm

        // ==========================================
        // 1. 获取公告 (★ 原功能无损保留)
        // ==========================================
        if (action === 'get-notice') {
            const text = await kv.get('portal_notice') || '欢迎使用高力国际办公楼市场数据终端！';
            return res.status(200).json({ status: 'success', text });
        }
        
        // ==========================================
        // 2. 更新公告 (★ 原功能无损保留)
        // ==========================================
        else if (action === 'update-notice') {
            const { text } = req.body;
            if (!text) return res.status(400).json({ status: 'fail', message: '公告内容不能为空' });
            
            await kv.set('portal_notice', text);
            return res.status(200).json({ status: 'success' });
        }

        // ==========================================
        // 3. 获取留言板 (★ 升级：每日重置过滤)
        // ==========================================
        else if (action === 'get-messages') {
            const msgs = await kv.get('portal_messages') || [];
            
            // 核心逻辑：只挑选出 date 属性等于今天的记录，实现“每天清理”的视觉效果
            const todayMsgs = msgs.filter(m => m.date === dateStr);
            return res.status(200).json(todayMsgs);
        }

        // ==========================================
        // 4. 发送留言 (★ 升级：永久备份到 Github)
        // ==========================================
        else if (action === 'post-message') {
            const { user, text } = req.body;
            if (!user || !text) return res.status(400).json({ status: 'fail', message: '留言参数不完整' });

            let msgs = await kv.get('portal_messages') || [];
            
            // 构筑包含日期标识的完整消息体
            const newMsg = { 
                user, 
                text, 
                time: timeStr,  // 前端界面展示的时间
                date: dateStr,  // 用于后端按天过滤的标签
                fullTime: d.toISOString() // 用于 Github 留底的精确时间戳
            };
            
            msgs.push(newMsg);
            
            // 防撑爆机制：由于我们前端只展示当天的，为了防止一天之内超高频聊天，把保留上限放宽到 500 条
            if (msgs.length > 500) msgs = msgs.slice(msgs.length - 500);
            
            // 1. 存入高速 KV 供主页秒级读取
            await kv.set('portal_messages', msgs);

            // 2. 异步推送到 Github 作为永久历史档案 (不加 await，防止让前端转圈等待)
            saveChatToGitHub(newMsg, monthStr);

            return res.status(200).json({ status: 'success' });
        }

        // 都不匹配时返回
        return res.status(400).json({ status: 'fail', message: 'Invalid Action' });

    } catch (e) {
        console.error("Portal API Error:", e.message);
        return res.status(500).json({ status: 'error', message: '服务器内部读取错误' });
    }
}
