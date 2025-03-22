const WebSocket = require("ws");
const port = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: port });
console.log("WebSocket 伺服器啟動，監聽 ws://localhost:" + port);
const clients = new Map();
let nextClientId = 1;

wss.on("connection", (ws, req) => {
    // 為新連結分配一個唯一ID
    const clientId = nextClientId++;
    
    // 初始時設定為未知類型
    const clientInfo = {
        id: clientId,
        type: "unknown",
        ip: req.socket.remoteAddress
    };
    
    // 將新的客戶端添加到Map中
    clients.set(ws, clientInfo);
    
    console.log(`新客戶端連接 (ID: ${clientId}, IP: ${clientInfo.ip})`);

    // 處理接受到的訊息
    ws.on("message", (data) => {
        const message = data.toString();
        console.log(`收到來自客戶端 ${clientId} 的數據: ${message}`);
        
        // 檢查是否為客戶端
        if (message.startsWith("register:")) {
            const clientType = message.substring(9); // 提取register:後面的客戶端類型
            if (clientType === "web" || clientType === "unity") {
                clientInfo.type = clientType;
                console.log(`客戶端 ${clientId} 已註冊為 ${clientType} 類型`);
                
                // 確認發送消息給客戶端
                ws.send(`registered:${clientType}:${clientId}`);
                
                // 廣播新客戶端連線的消息
                broadcastSystemMessage(`${clientType}-client-connected:${clientId}`);
            }
        } 
        // 如果是普通消息，廣播給其他客戶端
        else {
            // 建構带有源信息的消息
            const sourceType = clientInfo.type;
            const enrichedMessage = JSON.stringify({
                source: sourceType,
                sourceId: clientId,
                data: message
            });
            
            // 廣包消息
            broadcast(enrichedMessage, ws);
        }
    });

    // 處裡連接關閉
    ws.on("close", () => {
        console.log(`客戶端 ${clientId} (${clientInfo.type}) 已斷開連接`);
        
        // 段開連接的消息
        if (clientInfo.type !== "unknown") {
            broadcastSystemMessage(`${clientInfo.type}-client-disconnected:${clientId}`);
        }
        
        // 從Map中移除段開连接的用戶端
        clients.delete(ws);
    });

    // 發送歡迎訊息，要求用戶端註冊類型
    ws.send("welcome:請發送 register:web 或 register:unity 註冊用戶端類型");
});

// 廣播给發送者外的所有用戶端
function broadcast(message, sender) {
    clients.forEach((clientInfo, client) => {
        // 檢查用戶端是否連接，且不是發送者
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// 廣播系统消息给所有用戶端
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

// 定期清理功能
setInterval(() => {
    clients.forEach((info, client) => {
        if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
            clients.delete(client);
            console.log(`已清理已斷開的客戶端 ${info.id}`);
        }
    });
}, 60000); // 每60秒清理一次