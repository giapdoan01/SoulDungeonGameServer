// GameRoom.js
// Phòng game thực sự — mỗi trận tạo 1 instance.
// Client join bằng roomId nhận từ matchStart,
// truyền mmSessionId (sessionId trong MatchmakingRoom) để validate.
const { Room } = require('colyseus');
const { GameState, PlayerGameState } = require('../schema/GameState');
const GameHandler = require('../handlers/game.handler');
const LoggerService = require('../../services/logger.service');

class GameRoom extends Room {

    // ─────────────────────────────────────────────────────────────
    onCreate(options) {
        LoggerService.room('CREATED', this.roomId);

        // Số client tối đa = số player trong trận
        this.maxClients  = options.players?.length || 2;
        this.autoDispose = true;

        // Khởi tạo state
        const state   = new GameState();
        state.matchId = options.matchId || this.roomId;
        state.status  = "waiting";
        this.setState(state);

        // Map: mmSessionId → username (dùng để validate khi join)
        // mmSessionId = sessionId của player trong MatchmakingRoom
        this._allowedPlayers = new Map();
        (options.players || []).forEach(p => {
            this._allowedPlayers.set(p.sessionId, p.username || "Player");
        });

        this._isPartyMatch = options.isPartyMatch || false;

        // Đăng ký message handlers
        this.onMessage("setCharacter", (client, data) => GameHandler.handleSetCharacter(this, client, data));
        this.onMessage("move",         (client, data) => GameHandler.handleMove(this, client, data));

        LoggerService.success(`GameRoom sẵn sàng | matchId: ${state.matchId} | slots: ${this._allowedPlayers.size}`);
    }

    // ─────────────────────────────────────────────────────────────
    onJoin(client, options) {
        // options.mmSessionId = sessionId từ MatchmakingRoom (truyền từ Unity khi JoinById)
        const mmSessionId = options?.mmSessionId;
        const username    = mmSessionId ? this._allowedPlayers.get(mmSessionId) : null;

        if (!username) {
            LoggerService.warning(`[GameRoom] Từ chối: ${client.sessionId} (mmSessionId: ${mmSessionId})`);
            throw new Error("NOT_AUTHORIZED");
        }

        // Tạo player state dùng GameRoom sessionId (client.sessionId) làm key
        const player            = new PlayerGameState();
        player.sessionId        = client.sessionId;
        player.username         = username;
        player.characterIndex   = 0;
        player.x                = 0;
        player.y                = 0;
        player.facing           = 0;
        player.isReady          = false;

        this.state.players.set(client.sessionId, player);

        LoggerService.player('JOINED', client.sessionId, username);

        // Báo cho client này biết đã vào phòng thành công
        client.send("gameReady", {
            matchId:   this.state.matchId,
            sessionId: client.sessionId,  // GameRoom sessionId (dùng để identify bản thân trong state)
        });

        // Nếu đủ người → chờ setCharacter rồi mới allReady
        // (logic allReady nằm trong game.handler.js)
        LoggerService.info(`[GameRoom] ${this.state.players.size}/${this._allowedPlayers.size} players joined`);
    }

    // ─────────────────────────────────────────────────────────────
    onLeave(client, consented) {
        if (this.state.players.has(client.sessionId)) {
            const player = this.state.players.get(client.sessionId);
            this.state.players.delete(client.sessionId);
            this.broadcast("playerLeft", {
                sessionId: client.sessionId,
                username:  player?.username || ""
            });
            LoggerService.player('LEFT', client.sessionId, player?.username || "");
        }

        // Nếu phòng trống → tự dispose (autoDispose=true sẽ handle)
    }

    // ─────────────────────────────────────────────────────────────
    onDispose() {
        LoggerService.room('DISPOSED', this.roomId);
    }
}

module.exports = GameRoom;
