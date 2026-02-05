// config/config.js
require('dotenv').config();

module.exports = {
    port: parseInt(process.env.PORT) || 3001,
    env: process.env.NODE_ENV || 'development',
    maxPlayers: parseInt(process.env.MAX_PLAYERS) || 100,
    roomName: process.env.ROOM_NAME || 'matchmaking',
    gameRoomName: process.env.GAME_ROOM_NAME || 'game_room'
};
