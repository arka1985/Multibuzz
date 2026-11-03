/**
 * Multibuzz - Universal Real-Time Network Engine
 * Uses high-performance WebSocket MQTT with automatic multi-broker failover
 * and BroadcastChannel local fallback.
 * 
 * Works 100% across all mobile carriers, iOS Safari, Android Chrome,
 * behind Symmetric NATs, CGNAT, firewalls, and proxies.
 */

// Global Public WebSocket Brokers (Tier 1 Free Public MQTT WSS Brokers)
const BROKER_SERVERS = [
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://broker.emqx.io:8084/mqtt'
];

const TOPIC_PREFIX = 'mbz/v2/';

function generateRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Host Network Manager
 */
class HostNetwork {
    constructor(callbacks) {
        this.callbacks = Object.assign({
            onReady: () => {},
            onPlayerJoined: () => {},
            onPlayerLeft: () => {},
            onMessage: () => {},
            onError: () => {}
        }, callbacks);

        this.roomCode = null;
        this.mqttClient = null;
        this.currentBrokerIndex = 0;
        this.broadcastChannel = null;
        this.isReady = false;
    }

    init(customCode = null) {
        this.roomCode = (customCode || generateRoomCode()).toUpperCase().trim();
        this.initBroadcastChannel();
        this.connectBroker(0);
    }

    initBroadcastChannel() {
        try {
            if ('BroadcastChannel' in window) {
                this.broadcastChannel = new BroadcastChannel('bc-' + this.roomCode);
                this.broadcastChannel.onmessage = (event) => {
                    const data = event.data;
                    if (data && data.fromLocalTab) {
                        this.handleIncomingPacket(data.payload, (reply) => {
                            this.broadcastChannel.postMessage({
                                targetPlayerId: data.playerId,
                                payload: reply
                            });
                        });
                    }
                };
            }
        } catch (e) {
            console.warn('BroadcastChannel not supported:', e);
        }
    }

    connectBroker(index = 0) {
        if (typeof mqtt === 'undefined') {
            console.warn('MQTT.js not loaded, running in local BroadcastChannel mode.');
            this.callbacks.onReady(this.roomCode);
            return;
        }

        this.currentBrokerIndex = index % BROKER_SERVERS.length;
        const brokerUrl = BROKER_SERVERS[this.currentBrokerIndex];
        const clientId = 'mbz_host_' + this.roomCode + '_' + Math.random().toString(16).substr(2, 6);

        console.log(`[Host] Connecting to broker: ${brokerUrl} (${clientId})`);

        try {
            this.mqttClient = mqtt.connect(brokerUrl, {
                clientId: clientId,
                clean: true,
                connectTimeout: 5000,
                reconnectPeriod: 3000,
                keepalive: 30
            });

            const connectTimeout = setTimeout(() => {
                if (!this.isReady && index + 1 < BROKER_SERVERS.length) {
                    console.warn(`[Host] Broker ${brokerUrl} timed out. Trying backup broker...`);
                    try { this.mqttClient.end(true); } catch (e) {}
                    this.connectBroker(index + 1);
                }
            }, 4500);

            this.mqttClient.on('connect', () => {
                clearTimeout(connectTimeout);
                console.log('[Host] MQTT Connected successfully to broker');
                this.isReady = true;

                // Subscribe to incoming messages from participants
                const hostTopic = `${TOPIC_PREFIX}${this.roomCode}/host`;
                this.mqttClient.subscribe(hostTopic, { qos: 0 }, (err) => {
                    if (err) console.error('[Host] Subscribe error:', err);
                    else console.log(`[Host] Subscribed to ${hostTopic}`);
                });

                this.callbacks.onReady(this.roomCode);

                // Publish initial room presence heartbeat
                this.publishTo(`${TOPIC_PREFIX}${this.roomCode}/all`, {
                    type: 'ROOM_ANNOUNCE',
                    roomCode: this.roomCode,
                    time: Date.now()
                });
            });

            this.mqttClient.on('message', (topic, payload) => {
                try {
                    const data = JSON.parse(payload.toString());
                    this.handleIncomingPacket(data, (reply) => {
                        if (data.playerId) {
                            this.sendTo(data.playerId, reply);
                        }
                    });
                } catch (e) {
                    console.warn('[Host] Invalid packet received:', e);
                }
            });

            this.mqttClient.on('error', (err) => {
                console.warn('[Host] MQTT error:', err);
            });

            this.mqttClient.on('offline', () => {
                console.warn('[Host] MQTT connection offline');
            });
        } catch (err) {
            console.error('[Host] Failed to initialize MQTT:', err);
            this.callbacks.onReady(this.roomCode);
        }
    }

    handleIncomingPacket(data, replyFn) {
        if (!data || !data.type) return;

        // Instant Time Synchronization Pong
        if (data.type === 'TIME_PING') {
            replyFn({
                type: 'TIME_PONG',
                t0: data.t0,
                hostTime: Date.now()
            });
            return;
        }

        if (data.type === 'JOIN') {
            const playerId = data.playerId || 'player_' + Math.random().toString(36).substr(2, 6);
            this.callbacks.onPlayerJoined(playerId, data);
            replyFn({
                type: 'JOIN_ACK',
                roomCode: this.roomCode,
                timestamp: Date.now()
            });
            return;
        }

        this.callbacks.onMessage(data.playerId, data);
    }

    // Broadcast message to all connected participants
    broadcast(message) {
        const topic = `${TOPIC_PREFIX}${this.roomCode}/all`;
        this.publishTo(topic, message);

        // Also broadcast locally
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    broadcast: true,
                    payload: message
                });
            } catch (e) {}
        }
    }

    // Send targeted message to one participant
    sendTo(playerId, message) {
        const topic = `${TOPIC_PREFIX}${this.roomCode}/p/${playerId}`;
        this.publishTo(topic, message);

        // Also send locally if same-device tab
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    targetPlayerId: playerId,
                    payload: message
                });
            } catch (e) {}
        }
    }

    publishTo(topic, data) {
        if (this.mqttClient && this.mqttClient.connected) {
            try {
                this.mqttClient.publish(topic, JSON.stringify(data), { qos: 0 });
            } catch (e) {
                console.warn('[Host] Publish error:', e);
            }
        }
    }

    destroy() {
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
        if (this.mqttClient) {
            this.mqttClient.end(true);
        }
    }
}

/**
 * Participant Network Manager
 */
class ParticipantNetwork {
    constructor(callbacks) {
        this.callbacks = Object.assign({
            onConnected: () => {},
            onDisconnected: () => {},
            onMessage: () => {},
            onError: () => {}
        }, callbacks);

        this.roomCode = null;
        this.playerData = null;
        this.localId = 'p_' + Math.random().toString(36).substring(2, 9);
        this.mqttClient = null;
        this.currentBrokerIndex = 0;
        this.broadcastChannel = null;
        this.isConnected = false;
        this.timeSync = new TimeSyncClient((msg) => this.send(msg));
        this.joinRetryTimer = null;
        this.failoverTimer = null;
    }

    connect(roomCode, playerData) {
        this.roomCode = roomCode.toUpperCase().trim();
        this.playerData = playerData;

        // Start local tab channel
        this.initBroadcastChannel();

        // Connect to MQTT Broker
        this.connectBroker(0);
    }

    initBroadcastChannel() {
        try {
            if ('BroadcastChannel' in window) {
                this.broadcastChannel = new BroadcastChannel('bc-' + this.roomCode);
                this.broadcastChannel.onmessage = (event) => {
                    const data = event.data;
                    if (data && (data.broadcast || data.targetPlayerId === this.localId)) {
                        this.handleIncomingData(data.payload);
                    }
                };
            }
        } catch (e) {
            console.warn('BroadcastChannel error:', e);
        }
    }

    connectBroker(index = 0) {
        if (typeof mqtt === 'undefined') {
            console.warn('[Player] MQTT.js not loaded, trying local fallback.');
            this.sendLocalJoin();
            return;
        }

        this.currentBrokerIndex = index % BROKER_SERVERS.length;
        const brokerUrl = BROKER_SERVERS[this.currentBrokerIndex];
        const clientId = 'mbz_client_' + this.localId + '_' + Math.random().toString(16).substr(2, 5);

        console.log(`[Player] Connecting to broker: ${brokerUrl} (${clientId})`);

        try {
            if (this.mqttClient) {
                try { this.mqttClient.end(true); } catch (e) {}
            }

            this.mqttClient = mqtt.connect(brokerUrl, {
                clientId: clientId,
                clean: true,
                connectTimeout: 4000,
                reconnectPeriod: 2500,
                keepalive: 30
            });

            clearTimeout(this.failoverTimer);
            this.failoverTimer = setTimeout(() => {
                if (!this.isConnected && index + 1 < BROKER_SERVERS.length) {
                    console.warn(`[Player] Primary broker slow, failing over to backup broker...`);
                    this.connectBroker(index + 1);
                }
            }, 4000);

            this.mqttClient.on('connect', () => {
                console.log('[Player] Connected to MQTT broker!');

                const allTopic = `${TOPIC_PREFIX}${this.roomCode}/all`;
                const privateTopic = `${TOPIC_PREFIX}${this.roomCode}/p/${this.localId}`;

                // Subscribe to broadcasts and private player replies
                this.mqttClient.subscribe([allTopic, privateTopic], { qos: 0 }, (err) => {
                    if (err) {
                        console.warn('[Player] Subscription error:', err);
                    } else {
                        console.log(`[Player] Subscribed to ${allTopic} & ${privateTopic}`);
                        // Send initial JOIN packet
                        this.sendJoinPacket();
                    }
                });
            });

            this.mqttClient.on('message', (topic, payload) => {
                try {
                    const data = JSON.parse(payload.toString());
                    this.handleIncomingData(data);
                } catch (e) {
                    console.warn('[Player] Error parsing packet:', e);
                }
            });

            this.mqttClient.on('error', (err) => {
                console.warn('[Player] MQTT Client error:', err);
            });

            this.mqttClient.on('close', () => {
                if (this.isConnected) {
                    this.callbacks.onDisconnected();
                }
            });
        } catch (err) {
            console.error('[Player] MQTT connect failed:', err);
            this.sendLocalJoin();
        }
    }

    sendJoinPacket() {
        const joinPayload = {
            type: 'JOIN',
            playerId: this.localId,
            name: this.playerData.name,
            color: this.playerData.color,
            time: Date.now()
        };

        // Send via MQTT
        this.publishToHost(joinPayload);

        // Also broadcast locally
        this.sendLocalJoin();

        // Retry join every 1.5 seconds if not acknowledged yet
        clearInterval(this.joinRetryTimer);
        let retries = 0;
        this.joinRetryTimer = setInterval(() => {
            if (this.isConnected || retries > 10) {
                clearInterval(this.joinRetryTimer);
                if (!this.isConnected && retries > 10) {
                    this.callbacks.onError(new Error('Room not found or Host offline'));
                }
                return;
            }
            retries++;
            console.log(`[Player] Retrying JOIN (${retries})...`);
            this.publishToHost(joinPayload);
        }, 1500);
    }

    sendLocalJoin() {
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    fromLocalTab: true,
                    playerId: this.localId,
                    payload: {
                        type: 'JOIN',
                        playerId: this.localId,
                        name: this.playerData.name,
                        color: this.playerData.color
                    }
                });
            } catch (e) {}
        }
    }

    publishToHost(data) {
        if (this.mqttClient && this.mqttClient.connected) {
            const hostTopic = `${TOPIC_PREFIX}${this.roomCode}/host`;
            try {
                this.mqttClient.publish(hostTopic, JSON.stringify(data), { qos: 0 });
            } catch (e) {
                console.warn('[Player] Publish error:', e);
            }
        }
    }

    send(message) {
        message.playerId = this.localId;
        this.publishToHost(message);

        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    fromLocalTab: true,
                    playerId: this.localId,
                    payload: message
                });
            } catch (e) {}
        }
    }

    handleIncomingData(data) {
        if (!data) return;

        // When host acknowledges JOIN or broadcasts initial state, we are officially connected!
        if (data.type === 'JOIN_ACK' || data.type === 'ROOM_STATE' || data.type === 'ROOM_ANNOUNCE') {
            if (!this.isConnected) {
                this.isConnected = true;
                clearInterval(this.joinRetryTimer);
                clearTimeout(this.failoverTimer);
                this.timeSync.start();
                this.callbacks.onConnected();
            }
            if (data.type === 'ROOM_STATE') {
                this.callbacks.onMessage(data);
            }
            return;
        }

        // Time synchronization
        if (data.type === 'TIME_PONG') {
            this.timeSync.handlePong(data);
            return;
        }

        this.callbacks.onMessage(data);
    }

    buzz(unlockTimestamp) {
        if (!this.isConnected) return null;

        const syncedNow = this.timeSync.getSyncedHostTime();
        const elapsedMs = Math.max(0, syncedNow - unlockTimestamp);

        const payload = {
            type: 'BUZZ',
            playerId: this.localId,
            name: this.playerData.name,
            color: this.playerData.color,
            pressTime: syncedNow,
            elapsedMs: elapsedMs,
            rtt: this.timeSync.rtt
        };

        this.send(payload);
        return payload;
    }

    destroy() {
        clearInterval(this.joinRetryTimer);
        clearTimeout(this.failoverTimer);
        this.timeSync.stop();
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
        if (this.mqttClient) {
            this.mqttClient.end(true);
        }
    }
}

window.HostNetwork = HostNetwork;
window.ParticipantNetwork = ParticipantNetwork;
