'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');

const log = message => {
    console.log(`${new Date().toLocaleString()}: ${message}`);
};

class Server {
    start(port, isSecure) {
        let httpServer = null;

        this.connections = {};

        if (isSecure) {
            httpServer = https.createServer({
                cert: fs.readFileSync('./cert/cert.pem'),
                key: fs.readFileSync('./cert/key.pem'),
            });
        } else {
            httpServer = http.createServer();
        }

        httpServer.listen(port);

        const webSocketServer = new WebSocket.Server({server: httpServer});

        webSocketServer.on('connection', this.onConnection.bind(this));
    }

    onConnection(webSocket, req) {
        log(req.url);

        const [, roomId, userId] = req.url;

        if (!this.connections[roomId]) {
            this.connections[roomId] = {};
        }

        const roomConnections = this.connections[roomId];

        if (roomConnections[userId]) {
            roomConnections[userId].close();
        }

        for (const targetUserConnection of Object.values(roomConnections)) {
            targetUserConnection.send(JSON.stringify({
                event: 'newParticipant',
                data: {
                    userId,
                },
            }));
        }

        const userConnection = roomConnections[userId] = webSocket;

        const eventHandlers = {
            message: this.onMessage.bind(this, roomId, userId, userConnection),
        };

        userConnection.on('message', eventHandlers.message);
        userConnection.once('close', this.onClose.bind(this, roomId, userId, userConnection, eventHandlers));
    }

    onMessage(roomId, userId, userConnection, message) {
        const msg = JSON.parse(message);
        const targetUserId = msg.data.userId;
        const targetUserConnection = this.connections[roomId][targetUserId];

        switch (msg.event) {
            case 'offer':
                targetUserConnection.send(JSON.stringify({
                    event: 'offer',
                    data: {
                        userId,
                        offer: msg.data.offer,
                    },
                }));
                break;

            case 'answer':
                targetUserConnection.send(JSON.stringify({
                    event: 'answer',
                    data: {
                        userId,
                        answer: msg.data.answer,
                    },
                }));
                break;
        }
    }

    onClose(roomId, userId, userConnection, eventHandlers) {
        Object.entries(([eventName, eventHandler]) => {
            userConnection.off('message', eventHandlers.message);
        });

        this.connections[roomId][userId] = null;
    }
}

module.exports = Server;
