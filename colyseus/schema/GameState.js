// GameState.js — Schema cho GameRoom
// Field ordering phải cố định (Colyseus schema dùng index để decode)
//
// PlayerGameState : 0=sessionId, 1=username, 2=characterIndex, 3=x, 4=y, 5=facing, 6=isReady
// GameState       : 0=players, 1=matchId, 2=status
const { Schema, MapSchema, type } = require('@colyseus/schema');

// ==================== PlayerGameState ====================
class PlayerGameState extends Schema {
    constructor() {
        super();
        this.sessionId      = "";
        this.username       = "";
        this.characterIndex = 0;
        this.x              = 0;
        this.y              = 0;
        this.facing         = 0;   // góc độ (degrees), 0 = phải, 180 = trái
        this.isReady        = false;
    }
}
type("string") (PlayerGameState.prototype, "sessionId");
type("string") (PlayerGameState.prototype, "username");
type("int32")  (PlayerGameState.prototype, "characterIndex");
type("float32")(PlayerGameState.prototype, "x");
type("float32")(PlayerGameState.prototype, "y");
type("float32")(PlayerGameState.prototype, "facing");
type("boolean")(PlayerGameState.prototype, "isReady");

// ==================== GameState ====================
class GameState extends Schema {
    constructor() {
        super();
        this.players = new MapSchema();
        this.matchId = "";
        this.status  = "waiting"; // waiting | playing | ended
    }
}
type({ map: PlayerGameState })(GameState.prototype, "players");
type("string")(GameState.prototype, "matchId");
type("string")(GameState.prototype, "status");

module.exports = { GameState, PlayerGameState };
