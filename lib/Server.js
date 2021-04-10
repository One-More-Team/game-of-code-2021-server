'use strict';
const Stream = require('stream');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('uuid');
const SimplePeer = require('simple-peer');
const wrtc = require('wrtc');
const cors = require('cors');

const log = message => {
    console.log(`${new Date().toLocaleString()}: ${message}`);
};

class Server {
    start(port, isSecure) {
        this.log('...started...');

        this.emptyStream = new Stream.Readable();

        this.streams = {};

        const expressServer = express();
        expressServer.use(bodyParser.urlencoded({extended: true}));
        expressServer.use(bodyParser.json());
        expressServer.use(bodyParser.raw());
        expressServer.use(cors());
        expressServer.use(express.static('public'));

        let httpServer = null;

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

        httpServer.listen(port);

        expressServer.get('/ping', this.onPing.bind(this));
        // expressServer.get('/test', this.onTest.bind(this));
        expressServer.post('/offer', this.onOffer.bind(this));
    }

    onPing(req, res) {
        log(`Ping ${req.body}`);

        res.send('pong');
    }

    onTest(req, res) {
        const simplePeer1 = new SimplePeer({
            initiator: true,
            trickle: false,
            wrtc,
            stream: this.emptyStream,
        });

        simplePeer1.once('signal', data => {
            log(`Offer ${JSON.stringify(data)}`);

            const simplePeer2 = new SimplePeer({
                initiator: false,
                trickle: false,
                wrtc,
            });

            simplePeer2.once('signal', data => {
                log(`Answer ${JSON.stringify(data)}`);

                simplePeer1.signal(data);

                res.send('Success');
            });

            simplePeer2.signal(data);
        });
    }

    onOffer(req, res) {
        log(`Offer ${/* JSON.stringify(req.body) */''}`);

        const simplePeer = new SimplePeer({
            initiator: false,
            trickle: false,
            wrtc,
        });

        simplePeer.once('signal', data => {
            log(`Answer ${/* JSON.stringify(data) */''}`);

            const streamId = uuid.v4();

            const onStreamClose = this.onStreamClose.bind(this, streamId);

            simplePeer.once('connect', () => {
                log('Connect');
                simplePeer.send('Hello');
            });
            simplePeer.once('error', (error) => {
                log(error.message);
                onStreamClose();
            });

            simplePeer.once('stream', this.onStream.bind(this, simplePeer, streamId, onStreamClose));

            res.send(JSON.stringify(data));
        });

        simplePeer.signal(req.body);
    }

    onStream(simplePeer, streamId, onStreamClose, stream) {
        log(`Stream: ${streamId}`);
        this.streams[streamId] = stream;

        simplePeer.once('close', onStreamClose);
    }

    onStreamClose(streamId) {
        if (this.streams[streamId]) {
            delete this.streams[streamId];
        }
    }

    onBroadcast() {

    }

    log(message) {
        console.log(`${new Date().toLocaleString()}: ${message}`);
    }
}

module.exports = Server;
