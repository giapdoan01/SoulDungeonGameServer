// services/logger.service.js
class LoggerService {
    static info(message, ...args) {
        console.log('ℹ️ ', message, ...args);
    }

    static success(message, ...args) {
        console.log('✅', message, ...args);
    }

    static warning(message, ...args) {
        console.log('⚠️ ', message, ...args);
    }

    static error(message, ...args) {
        console.log('❌', message, ...args);
    }

    static room(action, roomId, ...args) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] 🎮 ROOM ${action}:`, roomId, ...args);
    }

    static player(action, sessionId, username, ...args) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] 👤 PLAYER ${action}:`, username, `(${sessionId})`, ...args);
    }
}

module.exports = LoggerService;
