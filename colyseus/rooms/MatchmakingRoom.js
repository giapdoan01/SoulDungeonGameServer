const { Room } = require('colyseus');
const { MatchmakingState, MmPlayer } = require('../schema/MatchmakingState');
const QueueHandler = require('../handlers/queue.handler');
const PartyHandler = require('../handlers/party.handler');
const MatchHandler = require('../handlers/match.handler');
const { updateCounts } = require('../utils/matchmaking.utils');

class MatchmakingRoom extends Room {

    onCreate(options) {
        console.log("🎮 MatchmakingRoom tạo:", this.roomId);

        this.setState(new MatchmakingState());
        this.maxClients = 100;

        // Map lưu các trận đang đếm ngược (không cần sync xuống client qua schema)
        this.pendingMatches = new Map();

        this._registerMessageHandlers();

        // Timer ghép trận mỗi 5 giây
        this._matchmakingTimer = setInterval(() => {
            QueueHandler.processMatchmaking(this);
        }, 5000);

        // Timer dọn party cũ mỗi 60 giây
        this._cleanupTimer = setInterval(() => {
            PartyHandler.cleanupOldParties(this);
        }, 60000);

        console.log("✅ MatchmakingRoom sẵn sàng");
    }

    onJoin(client, options) {
        console.log(`\n👤 Player join: ${client.sessionId} | username: ${options?.username || 'Guest'}`);

        const player = new MmPlayer();
        player.sessionId = client.sessionId;
        player.username = options?.username || "Guest";
        player.status = "idle";
        player.partyId = "";

        this.state.players.set(client.sessionId, player);
        updateCounts(this);

        client.send("welcome", {
            message: `Chào mừng ${player.username}!`,
            sessionId: client.sessionId,
        });

        console.log(`✅ Tổng online: ${this.state.onlineCount}`);
    }

    onLeave(client, _consented) {
        console.log(`👋 Player rời: ${client.sessionId}`);

        // Nếu đang trong pending match → huỷ match
        MatchHandler.handlePlayerDisconnect(this, client.sessionId);

        // Dọn khỏi queue và party
        const { removePlayerFromParty, removeFromQueue } = require('../utils/matchmaking.utils');
        removePlayerFromParty(this, client.sessionId);
        removeFromQueue(this, client.sessionId);

        this.state.players.delete(client.sessionId);
        updateCounts(this);
    }

    onDispose() {
        console.log("🛑 MatchmakingRoom dispose");
        clearInterval(this._matchmakingTimer);
        clearInterval(this._cleanupTimer);

        // Dọn tất cả pending match timeouts
        this.pendingMatches.forEach(match => clearTimeout(match.timeoutRef));
        this.pendingMatches.clear();
    }

    // ======================== PRIVATE ========================

    _registerMessageHandlers() {
        // --- Queue ---
        this.onMessage("joinQueue",  (client)       => QueueHandler.handleJoinQueue(this, client));
        this.onMessage("leaveQueue", (client)       => QueueHandler.handleLeaveQueue(this, client));

        // --- Party ---
        this.onMessage("createParty",      (client, data) => PartyHandler.handleCreateParty(this, client, data));
        this.onMessage("joinPartyByCode",  (client, data) => PartyHandler.handleJoinPartyByCode(this, client, data));
        this.onMessage("leaveParty",       (client)       => PartyHandler.handleLeaveParty(this, client));
        this.onMessage("kickPlayer",       (client, data) => PartyHandler.handleKickPlayer(this, client, data));
        this.onMessage("startPartyMatch",  (client)       => PartyHandler.handleStartPartyMatch(this, client));

        // --- Match countdown ---
        this.onMessage("cancelMatch", (client) => MatchHandler.handleCancelMatch(this, client));
    }
}

module.exports = MatchmakingRoom;
