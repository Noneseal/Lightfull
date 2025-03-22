const WebSocket = require("ws");

// 建立 WebSocket 伺服器
const wss = new WebSocket.Server({ port: 8080 });
console.log("WebSocket 伺服器啟動，監聽 ws://localhost:8080");

// 存储所有连接的客户端，使用Map以便存储额外信息
const clients = new Map();

// 分配唯一ID给客户端
let nextClientId = 1;

wss.on("connection", (ws, req) => {
    // 为新连接分配一个唯一ID
    const clientId = nextClientId++;
    
    // 初始时设置为未知类型
    const clientInfo = {
        id: clientId,
        type: "unknown", // 默认未知类型
        ip: req.socket.remoteAddress
    };
    
    // 将新连接的客户端添加到Map中
    clients.set(ws, clientInfo);
    
    console.log(`新客戶端連接 (ID: ${clientId}, IP: ${clientInfo.ip})`);

    // 处理接收到的消息
    ws.on("message", (data) => {
        const message = data.toString();
        console.log(`收到來自客戶端 ${clientId} 的數據: ${message}`);
        
        // 检查是否是客户端类型注册消息
        if (message.startsWith("register:")) {
            const clientType = message.substring(9); // 提取register:后面的客户端类型
            if (clientType === "web" || clientType === "unity") {
                clientInfo.type = clientType;
                console.log(`客戶端 ${clientId} 已註冊為 ${clientType} 類型`);
                
                // 发送确认消息给客户端
                ws.send(`registered:${clientType}:${clientId}`);
                
                // 广播新客户端连接的消息
                broadcastSystemMessage(`${clientType}-client-connected:${clientId}`);
            }
        } 
        // 如果是普通消息，则广播给所有其他客户端
        else {
            // 构建带有源信息的消息
            const sourceType = clientInfo.type;
            const enrichedMessage = JSON.stringify({
                source: sourceType,
                sourceId: clientId,
                data: message
            });
            
            // 广播消息
            broadcast(enrichedMessage, ws);
        }
    });

    // 处理连接关闭
    ws.on("close", () => {
        console.log(`客戶端 ${clientId} (${clientInfo.type}) 已斷開連接`);
        
        // 广播断开连接的消息
        if (clientInfo.type !== "unknown") {
            broadcastSystemMessage(`${clientInfo.type}-client-disconnected:${clientId}`);
        }
        
        // 从Map中移除断开连接的客户端
        clients.delete(ws);
    });

    // 发送欢迎消息，要求客户端注册类型
    ws.send("welcome:请发送 register:web 或 register:unity 以注册客户端类型");
});

// 广播消息给除发送者外的所有客户端
function broadcast(message, sender) {
    clients.forEach((clientInfo, client) => {
        // 检查客户端是否仍然连接，且不是发送者
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// 广播系统消息给所有客户端
function broadcastSystemMessage(message) {
    const systemMessage = JSON.stringify({
        source: "system",
        data: message
    });
    
    clients.forEach((clientInfo, client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(systemMessage);
        }
    });
}

// 可选：定期清理功能
setInterval(() => {
    clients.forEach((info, client) => {
        if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
            clients.delete(client);
            console.log(`已清理已斷開的客戶端 ${info.id}`);
        }
    });
}, 60000); // 每60秒清理一次