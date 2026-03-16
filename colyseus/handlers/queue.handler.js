const { QueueEntry } = require('../schema/MatchmakingState');
const { removePlayerFromParty, removeFromQueue, updateCounts } = require('../utils/matchmaking.utils');
const MatchHandler = require('./match.handler');

class QueueHandler {

    static handleJoinQueue(room, client) {
        const player = room.state.players.get(client.sessionId);
        if (!player) return;

        // Rời party nếu đang có
        removePlayerFromParty(room, client.sessionId);

        // Kiểm tra đã trong queue chưa
        const alreadyInQueue = room.state.queue.some(e => e.sessionId === client.sessionId);
        if (alreadyInQueue) {
            client.send("queueError", { message: "Bạn đã trong hàng đợi" });
            return;
        }

        const entry = new QueueEntry();
        entry.sessionId = client.sessionId;
        entry.username = player.username;
        entry.joinedAt = Date.now();

        room.state.queue.push(entry);
        player.status = "queue";
        player.partyId = "";
        updateCounts(room);

        client.send("queueJoined", {
            position: room.state.queue.length,
            estimatedWait: room.state.queue.length * 5,
        });

        console.log(`🎯 ${player.username} vào hàng đợi. Vị trí: ${room.state.queue.length}`);
    }

    static handleLeaveQueue(room, client) {
        removeFromQueue(room, client.sessionId);

        const player = room.state.players.get(client.sessionId);
        if (player && player.status === "queue") {
            player.status = "idle";
        }

        client.send("queueLeft", {});
        console.log(`❌ ${client.sessionId} rời hàng đợi`);
    }

    // Gọi bởi timer mỗi 5 giây
    static processMatchmaking(room) {
        if (room.state.queue.length < 2) return;

        console.log(`🔍 Xử lý matchmaking: ${room.state.queue.length} người đợi`);

        const entry1 = room.state.queue[0];
        const entry2 = room.state.queue[1];

        const player1 = room.state.players.get(entry1.sessionId);
        const player2 = room.state.players.get(entry2.sessionId);

        if (!player1 || !player2) return;

        // Xoá khỏi queue
        room.state.queue.splice(0, 2);
        updateCounts(room);

        // Bắt đầu countdown 15s
        MatchHandler.createPendingMatch(room, [
            { sessionId: player1.sessionId, username: player1.username },
            { sessionId: player2.sessionId, username: player2.username },
        ], false, null);
    }
}

module.exports = QueueHandler;
