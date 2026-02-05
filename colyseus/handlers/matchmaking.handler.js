// colyseus/handlers/matchmaking.handler.js
const LoggerService = require('../../services/logger.service');

class MatchmakingHandler {
    
    static handleQueueJoin(room, client) {
        const player = room.state.players.get(client.sessionId);
        if (!player) {
            LoggerService.warning('Player not found:', client.sessionId);
            return;
        }

        // Check if already in queue
        if (room.state.queue.has(client.sessionId)) {
            LoggerService.warning(`${player.username} already in queue`);
            client.send("error", { message: "Already in queue" });
            return;
        }

        // Add to queue
        const { QueueEntry } = require('../schema/MatchmakingState');
        const queueEntry = new QueueEntry();
        queueEntry.sessionId = client.sessionId;
        queueEntry.joinedAt = Date.now();
        queueEntry.mmr = player.level * 100;

        room.state.queue.set(client.sessionId, queueEntry);
        player.status = "queue";
        room.updateStats();

        const position = room.state.queue.size;
        LoggerService.player('QUEUE_JOIN', client.sessionId, player.username, `Position: ${position}`);

        // Send confirmation
        client.send("queue:joined", {
            position: position,
            estimatedWait: position * 5
        });
    }

    static handleQueueLeave(room, client) {
        const player = room.state.players.get(client.sessionId);
        if (!player) return;

        if (!room.state.queue.has(client.sessionId)) {
            LoggerService.warning(`${player.username} not in queue`);
            return;
        }

        room.state.queue.delete(client.sessionId);
        player.status = "idle";
        room.updateStats();

        LoggerService.player('QUEUE_LEAVE', client.sessionId, player.username);

        client.send("queue:left", { reason: "manual" });
    }

    static handlePing(room, client, data) {
        const player = room.state.players.get(client.sessionId);
        if (player) {
            player.lastPingMs = Date.now();
            client.send("pong", { 
                timestamp: Date.now(),
                clientTime: data?.timestamp 
            });
        }
    }
}

module.exports = MatchmakingHandler;
