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
     * Client cập nhật vị trí và hướng nhìn.
     * data: { x: number, y: number, facing: number }
     * Server chỉ broadcast lại qua state patch — client khác sẽ nhận qua schema sync.
     */
    static handleMove(room, client, data) {
        const player = room.state.players.get(client.sessionId);
        if (!player) return;
        if (room.state.status !== 'playing') return;

        if (typeof data?.x       === 'number') player.x      = data.x;
        if (typeof data?.y       === 'number') player.y      = data.y;
        if (typeof data?.facing  === 'number') player.facing = data.facing;
    }
}

module.exports = GameHandler;
