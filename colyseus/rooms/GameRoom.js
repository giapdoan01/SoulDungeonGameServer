// colyseus/rooms/GameRoom.js
const { Room } = require('colyseus');
const LoggerService = require('../../services/logger.service');

class GameRoom extends Room {
    
    onCreate(options) {
        LoggerService.room('CREATED', this.roomId);
        
        this.maxClients = options.maxPlayers || 2;
        this.autoDispose = true; // Dispose when empty
        
        
        LoggerService.success('GameRoom ready');
    }

    onJoin(client, options) {
        LoggerService.player('JOINED', client.sessionId, options.username || 'Player');
        // TODO: Add player to game
    }

    onLeave(client, consented) {
        LoggerService.player('LEFT', client.sessionId, 'Player');
        // TODO: Handle player leaving
    }

    onDispose() {
        LoggerService.room('DISPOSED', this.roomId);
    }
}

module.exports = GameRoom;
