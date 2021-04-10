'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const WebSocket = require('ws');

const log = message => {
    console.log(`${new Date().toLocaleString()}: ${message}`);
};

class Server {
    start(port, isSecure) {
        let httpServer = null;

        this.connections = {};

        const expressServer = express();
        expressServer.use(express.static('public'));

        if (isSecure) {
            httpServer = https.createServer(
                {
                    cert: fs.readFileSync('./cert/cert.pem'),
                    key: fs.readFileSync('./cert/key.pem'),
                },
                expressServer,
            );
        } else {
            httpServer = http.createServer(expressServer);
        }

        const webSocketServer = new WebSocket.Server({noServer: true});

        httpServer.on('upgrade', function upgrade(request, socket, head) {
            webSocketServer.handleUpgrade(request, socket, head, function done(webSocket) {
                webSocketServer.emit('connection', webSocket, request);
            });
        });

        webSocketServer.on('connection', this.onConnection.bind(this));

        httpServer.listen(port);
    }

    onConnection(webSocket, req) {
        log(`Joined: ${req.url}`);

        const ping = () => {
            setTimeout(function timeout() {
                if (webSocket.readyState === WebSocket.OPEN) {
                    webSocket.send(JSON.stringify({event: 'ping'}));
                    ping();
                }
            }, 15000);
        };

        ping();

        const [, roomId, userId] = req.url.split('/');

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
        let msg = null;
        try {
            msg = JSON.parse(message);
        } catch (error) {
            log('Message: parse error');
        }

        log(`Message: ${msg.event}`);

        const targetUserId = msg.data.userId;
        const targetUserConnection = this.connections[roomId][targetUserId];

        if (!targetUserConnection) {
            log(`No target connection: /${roomId}/${targetUserId}`);
            return;
        }

        log(`Target connection: /${roomId}/${targetUserId}`);

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
        log(`Left: /${roomId}/${userId}`);

        for (const [eventName, eventHandler] of Object.entries(eventHandlers)) {
            userConnection.off(eventName, eventHandler);
        };

        delete this.connections[roomId][userId];
    }
}

module.exports = Server;
