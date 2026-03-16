const { matchMaker } = require('colyseus');
const { sendToClient, updateCounts } = require('../utils/matchmaking.utils');

const COUNTDOWN_SECONDS = 15;

/**
 * Quản lý vòng đời của một trận đấu:
 * 1. createPendingMatch  - Tạo pending match + bắt đầu countdown 15s
 * 2. handleCancelMatch   - Player chủ động huỷ trong 15s
 * 3. handlePlayerDisconnect - Player disconnect trong lúc countdown
 * 4. _launchGameRoom     - Sau 15s tạo GameRoom thật
 * 5. _cancelMatch        - Dừng countdown, thông báo huỷ, reset trạng thái
 *
 * pendingMatches map (lưu trên room instance):
 * {
 *   matchId: string,
 *   players: [{ sessionId, username }],
 *   isPartyMatch: boolean,
 *   partyId: string | null,
 *   timeoutRef: NodeJS.Timeout,
 *   startedAt: number,
 * }
 */
class MatchHandler {

    /**
     * Gọi sau khi tìm được match (từ queue hoặc party leader start).
     * Gửi matchFound → countdown 15s → launch GameRoom.
     */
    static createPendingMatch(room, players, isPartyMatch, partyId = null) {
        const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        const timeoutRef = setTimeout(() => {
            MatchHandler._launchGameRoom(room, matchId);
        }, COUNTDOWN_SECONDS * 1000);

        room.pendingMatches.set(matchId, {
            matchId,
            players,
            isPartyMatch,
            partyId,
            timeoutRef,
            startedAt: Date.now(),
        });

        // Cập nhật trạng thái player
        players.forEach(({ sessionId }) => {
            const player = room.state.players.get(sessionId);
            if (player) player.status = "matched";
        });
        updateCounts(room);

        // Gửi matchFound đến từng player kèm thông tin đối thủ
        players.forEach(({ sessionId }) => {
            const opponents = players.filter(p => p.sessionId !== sessionId);
            sendToClient(room, sessionId, "matchFound", {
                matchId,
                countdown: COUNTDOWN_SECONDS,
                players: players.map(p => ({ sessionId: p.sessionId, username: p.username })),
                opponents: opponents.map(p => ({ sessionId: p.sessionId, username: p.username })),
                isPartyMatch,
            });
        });

        console.log(`⏳ PendingMatch ${matchId} | ${COUNTDOWN_SECONDS}s countdown | Players: ${players.map(p => p.username).join(', ')}`);
    }

    /**
     * Player chủ động gửi "cancelMatch" trong lúc countdown.
     */
    static handleCancelMatch(room, client) {
        const match = MatchHandler._findMatchBySession(room, client.sessionId);
        if (!match) {
            client.send("cancelMatchResult", { success: false, reason: "NO_PENDING_MATCH" });
            return;
        }

        client.send("cancelMatchResult", { success: true });
        MatchHandler._cancelMatch(room, match.matchId, "PLAYER_CANCELLED", client.sessionId);
    }

    /**
     * Gọi từ onLeave nếu player đang ở trạng thái "matched".
     */
    static handlePlayerDisconnect(room, sessionId) {
        const match = MatchHandler._findMatchBySession(room, sessionId);
        if (!match) return;
        MatchHandler._cancelMatch(room, match.matchId, "PLAYER_DISCONNECTED", sessionId);
    }

    // ======================== INTERNAL ========================

    static async _launchGameRoom(room, matchId) {
        const match = room.pendingMatches.get(matchId);
        if (!match) return;

        room.pendingMatches.delete(matchId);
        clearTimeout(match.timeoutRef);

        console.log(`🚀 Launching GameRoom cho match ${matchId}`);

        try {
            // Tạo GameRoom mới qua matchMaker
            const gameRoom = await matchMaker.createRoom("game_room", {
                matchId,
                players: match.players,
                isPartyMatch: match.isPartyMatch,
            });

            // Gửi thông tin phòng đến từng player để join
            match.players.forEach(({ sessionId, username }) => {
                const player = room.state.players.get(sessionId);
                if (player) player.status = "in_game";

                sendToClient(room, sessionId, "matchStart", {
                    matchId,
                    roomId: gameRoom.roomId,
                    players: match.players,
                });
            });

            // Xoá party nếu là party match
            if (match.isPartyMatch && match.partyId) {
                room.state.parties.delete(match.partyId);
            }

            updateCounts(room);
            console.log(`✅ GameRoom ${gameRoom.roomId} tạo thành công cho match ${matchId}`);

        } catch (error) {
            console.error(`❌ Lỗi tạo GameRoom cho match ${matchId}:`, error);

            // Hoàn trả trạng thái idle khi có lỗi
            match.players.forEach(({ sessionId }) => {
                const player = room.state.players.get(sessionId);
                if (player) player.status = "idle";
                sendToClient(room, sessionId, "matchError", { reason: "SERVER_ERROR" });
            });
            updateCounts(room);
        }
    }

    static _cancelMatch(room, matchId, reason, cancellerSessionId = null) {
        const match = room.pendingMatches.get(matchId);
        if (!match) return;

        clearTimeout(match.timeoutRef);
        room.pendingMatches.delete(matchId);

        console.log(`❌ Match ${matchId} huỷ | Lý do: ${reason} | Bởi: ${cancellerSessionId || 'system'}`);

        // Reset trạng thái tất cả player về idle
        match.players.forEach(({ sessionId }) => {
            const player = room.state.players.get(sessionId);
            if (player) player.status = "idle";

            // Chỉ gửi thông báo cho những người KHÔNG phải người huỷ
            // (người huỷ đã nhận cancelMatchResult rồi)
            if (sessionId !== cancellerSessionId) {
                sendToClient(room, sessionId, "matchCancelled", {
                    reason,
                    cancelledBy: cancellerSessionId,
                });
            }
        });

        // Khôi phục party về "waiting" nếu là party match
        if (match.isPartyMatch && match.partyId) {
            const party = room.state.parties.get(match.partyId);
            if (party) party.status = "waiting";
        }

        updateCounts(room);
    }

    static _findMatchBySession(room, sessionId) {
        for (const [, match] of room.pendingMatches) {
            if (match.players.some(p => p.sessionId === sessionId)) {
                return match;
            }
        }
        return null;
    }
}

module.exports = MatchHandler;
