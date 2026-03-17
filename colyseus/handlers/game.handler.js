// game.handler.js — Xử lý messages từ client trong GameRoom
const LoggerService = require('../../services/logger.service');

class GameHandler {

    /**
     * Client chọn character trước khi vào trận.
     * data: { characterIndex: number }
     */
    static handleSetCharacter(room, client, data) {
        const player = room.state.players.get(client.sessionId);
        if (!player) return;

        const idx = typeof data?.characterIndex === 'number' ? data.characterIndex : 0;
        player.characterIndex = idx;
        player.isReady = true;

        LoggerService.info(`[GameRoom] ${player.username} chọn character #${idx}`);

        // Kiểm tra tất cả player đã ready chưa
        const allReady = [...room.state.players.values()].every(p => p.isReady);
        if (allReady && room.state.status === 'waiting') {
            room.state.status = 'playing';
            room.broadcast("allReady", { matchId: room.state.matchId });
            LoggerService.success(`[GameRoom] Tất cả ready — bắt đầu trận: ${room.state.matchId}`);
        }
    }

    /**
     * Client gửi vị trí + hướng nhìn.
     * data: { x: number, y: number, facing: number }
     *
     * Luồng:
     *   1. Validate player tồn tại và trận đang chạy
     *   2. Lưu vào state  → dùng khi có late joiner cần đọc vị trí ban đầu
     *   3. broadcast "playerMoved" đến tất cả client KHÁC (except người gửi)
     *      → client nhận message này để lerp remote character
     */
    static handleMove(room, client, data) {
        const player = room.state.players.get(client.sessionId);
        if (!player) return;
        if (room.state.status !== 'playing') return;

        // Validate kiểu dữ liệu
        const x      = typeof data?.x      === 'number' ? data.x      : player.x;
        const y      = typeof data?.y      === 'number' ? data.y      : player.y;
        const facing = typeof data?.facing === 'number' ? data.facing : player.facing;
        // speed: client gui len 0 (dung) hoac 1 (di chuyen) — server chi relay lai, khong tinh toan
        const speed  = typeof data?.speed  === 'number' ? data.speed  : 0;

        // Lưu vào state (late joiner reference)
        player.x      = x;
        player.y      = y;
        player.facing = facing;

        // Broadcast đến client KHÁC — không gửi lại cho chính người gửi
        room.broadcast("playerMoved", {
            sessionId: client.sessionId,
            x,
            y,
            facing,
            speed,   // [ANIMATION SYNC] relay speed de remote client biet chay anim nao
        }, { except: client });
    }
}

module.exports = GameHandler;
