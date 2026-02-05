// index.js
const { createServer } = require('http');
const { Server } = require('colyseus');
const { monitor } = require('@colyseus/monitor');
const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const MatchmakingRoom = require('./colyseus/rooms/MatchmakingRoom');
const GameRoom = require('./colyseus/rooms/GameRoom');
const LoggerService = require('./services/logger.service');

require('dotenv').config();

/**
 * Start Server
 */
async function startServer() {
    try {
        // 1. Create Express app
        const app = express();
        
        // Middleware
        app.use(cors());
        app.use(express.json());

        // 2. Create HTTP server
        const httpServer = createServer(app);

        // 3. Create Colyseus server
        const gameServer = new Server({
            server: httpServer,
            express: app
        });

        LoggerService.success('Colyseus server created');

        // 4. Register Colyseus rooms
        gameServer.define(config.roomName, MatchmakingRoom);
        LoggerService.success(`Room "${config.roomName}" registered`);

        gameServer.define(config.gameRoomName, GameRoom);
        LoggerService.success(`Room "${config.gameRoomName}" registered`);

        // 5. Colyseus monitor
        app.use('/monitor', monitor());
        LoggerService.success('Monitor enabled at /monitor');

        // 6. Health check endpoint
        app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                uptime: process.uptime(),
                timestamp: Date.now(),
                environment: config.env,
                totalRooms: gameServer.rooms.size,
                port: config.port
            });
        });

        // 7. Root endpoint
        app.get('/', (req, res) => {
            res.json({
                message: '🎮 SoulDungeon Game Server',
                version: '1.0.0',
                status: 'running',
                endpoints: {
                    health: '/health',
                    monitor: '/monitor',
                    websocket: req.protocol === 'https' 
                        ? 'wss://' + req.get('host') 
                        : 'ws://' + req.get('host')
                }
            });
        });

        // 8. Listen on port
        const port = config.port;
        const host = '0.0.0.0';
        
        httpServer.listen(port, host, () => {
            const isProduction = config.env === 'production';
            
            console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🎮 SOULDUNGEON GAME SERVER                         ║
║                                                       ║
║   Environment: ${config.env.padEnd(36)}║
║   Port: ${port.toString().padEnd(42)}║
║   Host: ${host.padEnd(42)}║
║                                                       ║`);

            if (!isProduction) {
                console.log(`║   🌐 HTTP: http://localhost:${port}${' '.repeat(26)}║
║   📊 Monitor: http://localhost:${port}/monitor${' '.repeat(18)}║
║   🎮 WebSocket: ws://localhost:${port}${' '.repeat(22)}║`);
            }

            console.log(`║                                                       ║
║   📡 Room: "${config.roomName}" (max ${config.maxPlayers} players)${' '.repeat(10)}║
║   🎯 Game Room: "${config.gameRoomName}" (on-demand)${' '.repeat(15)}║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
            `);

            LoggerService.success(`✅ Server is listening on ${host}:${port}`);
            LoggerService.success('✅ Server is ready!');
        });

        // 9. Error handling for server
        httpServer.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                LoggerService.error(`❌ Port ${port} is already in use`);
            } else {
                LoggerService.error('❌ Server error:', error.message);
            }
            process.exit(1);
        });

        // 10. Graceful shutdown
        process.on('SIGTERM', async () => {
            LoggerService.warning('⚠️  SIGTERM received, shutting down gracefully...');
            await gameServer.gracefullyShutdown();
            httpServer.close(() => {
                LoggerService.success('✅ Server closed');
                process.exit(0);
            });
        });

        process.on('SIGINT', async () => {
            LoggerService.warning('⚠️  SIGINT received, shutting down gracefully...');
            await gameServer.gracefullyShutdown();
            httpServer.close(() => {
                LoggerService.success('✅ Server closed');
                process.exit(0);
            });
        });

        // 11. Unhandled errors
        process.on('unhandledRejection', (reason, promise) => {
            LoggerService.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
        });

        process.on('uncaughtException', (error) => {
            LoggerService.error('❌ Uncaught Exception:', error);
            process.exit(1);
        });

    } catch (error) {
        LoggerService.error('❌ Failed to start server:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Start server
startServer();
