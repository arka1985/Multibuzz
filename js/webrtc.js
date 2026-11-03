/**
 * Multibuzz - WebRTC & Peer Networking Layer
 * Connects Host and Participants seamlessly over WebRTC DataChannels using PeerJS,
 * with automatic BroadcastChannel fallback for same-device / offline multi-tab testing.
 */

const PEER_PREFIX = 'multibuzz-';

// Generate a random 6-character clean room code (omitting ambiguous characters like 0/O, 1/I)
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
        this.peer = null;
        this.connections = new Map(); // peerId -> DataConnection
        this.broadcastChannel = null;
    }

    init(customCode = null) {
        this.roomCode = (customCode || generateRoomCode()).toUpperCase().trim();
        const fullPeerId = PEER_PREFIX + this.roomCode;

        // Initialize BroadcastChannel for offline/same-device zero-latency fallback
        try {
            if ('BroadcastChannel' in window) {
                this.broadcastChannel = new BroadcastChannel('bc-' + fullPeerId);
                this.broadcastChannel.onmessage = (event) => {
                    const data = event.data;
                    if (data && data.fromLocalTab) {
                        this.handleIncomingData('local-tab-' + data.playerId, data.payload, (reply) => {
                            this.broadcastChannel.postMessage({
                                targetPlayerId: data.playerId,
                                payload: reply
                            });
                        });
                    }
                };
            }
        } catch (e) {
            console.warn('BroadcastChannel not supported or blocked:', e);
        }

        // Initialize PeerJS
        if (typeof Peer !== 'undefined') {
            try {
                this.peer = new Peer(fullPeerId, {
                    debug: 1,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            { urls: 'stun:stun2.l.google.com:19302' }
                        ]
                    }
                });

                this.peer.on('open', (id) => {
                    console.log('Host peer open with ID:', id);
                    this.callbacks.onReady(this.roomCode);
                });

                this.peer.on('connection', (conn) => {
                    this.setupConnection(conn);
                });

                this.peer.on('error', (err) => {
                    console.warn('PeerJS Host error:', err);
                    if (err.type === 'unavailable-id') {
                        // If ID is taken, generate another one
                        this.init();
                    } else {
                        this.callbacks.onError(err);
                    }
                });
            } catch (err) {
                console.error('Failed to initialize PeerJS:', err);
                this.callbacks.onReady(this.roomCode);
            }
        } else {
            console.warn('PeerJS library not loaded. Falling back to local mode.');
            this.callbacks.onReady(this.roomCode);
        }
    }

    setupConnection(conn) {
        conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            console.log('Participant connected:', conn.peer);
        });

        conn.on('data', (data) => {
            this.handleIncomingData(conn.peer, data, (reply) => {
                try {
                    conn.send(reply);
                } catch (e) {
                    console.error('Failed to send reply to peer:', e);
                }
            });
        });

        conn.on('close', () => {
            this.connections.delete(conn.peer);
            this.callbacks.onPlayerLeft(conn.peer);
        });

        conn.on('error', (err) => {
            console.warn('Connection error with peer:', conn.peer, err);
            this.connections.delete(conn.peer);
            this.callbacks.onPlayerLeft(conn.peer);
        });
    }

    handleIncomingData(senderId, data, replyFn) {
        // Handle NTP Time synchronization ping instantly
        if (data && data.type === 'TIME_PING') {
            replyFn(TimeSyncHost.createPong(data));
            return;
        }

        if (data && data.type === 'JOIN') {
            this.callbacks.onPlayerJoined(senderId, data);
            replyFn({
                type: 'JOIN_ACK',
                roomCode: this.roomCode,
                timestamp: Date.now()
            });
            return;
        }

        this.callbacks.onMessage(senderId, data);
    }

    // Broadcast message to all connected participants
    broadcast(message) {
        // Send via WebRTC connections
        this.connections.forEach((conn) => {
            if (conn.open) {
                try {
                    conn.send(message);
                } catch (e) {
                    console.warn('Failed to broadcast to peer:', conn.peer, e);
                }
            }
        });

        // Broadcast via BroadcastChannel
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    broadcast: true,
                    payload: message
                });
            } catch (e) {
                console.warn('Failed to broadcast to BroadcastChannel:', e);
            }
        }
    }

    // Send to a single participant
    sendTo(peerId, message) {
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
            try {
                conn.send(message);
            } catch (e) {
                console.warn('Failed to send to peer:', peerId, e);
            }
        } else if (this.broadcastChannel && peerId.startsWith('local-tab-')) {
            const rawId = peerId.replace('local-tab-', '');
            this.broadcastChannel.postMessage({
                targetPlayerId: rawId,
                payload: message
            });
        }
    }

    destroy() {
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
        if (this.peer) {
            this.peer.destroy();
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
        this.peer = null;
        this.conn = null;
        this.localId = 'p_' + Math.random().toString(36).substring(2, 9);
        this.broadcastChannel = null;
        this.isConnected = false;
        this.timeSync = new TimeSyncClient((msg) => this.send(msg));
    }

    connect(roomCode, playerData) {
        this.roomCode = roomCode.toUpperCase().trim();
        const targetHostPeerId = PEER_PREFIX + this.roomCode;
        this.playerData = playerData;

        // Try BroadcastChannel for local / same-browser tab support
        try {
            if ('BroadcastChannel' in window) {
                this.broadcastChannel = new BroadcastChannel('bc-' + targetHostPeerId);
                this.broadcastChannel.onmessage = (event) => {
                    const data = event.data;
                    if (data && data.broadcast) {
                        this.handleIncomingData(data.payload);
                    } else if (data && data.targetPlayerId === this.localId) {
                        this.handleIncomingData(data.payload);
                    }
                };
            }
        } catch (e) {
            console.warn('BroadcastChannel error:', e);
        }

        // Initialize PeerJS
        if (typeof Peer !== 'undefined') {
            try {
                this.peer = new Peer(null, {
                    debug: 1,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            { urls: 'stun:stun2.l.google.com:19302' }
                        ]
                    }
                });

                this.peer.on('open', (id) => {
                    console.log('Participant client peer ready:', id);
                    this.conn = this.peer.connect(targetHostPeerId, {
                        reliable: true
                    });

                    this.conn.on('open', () => {
                        this.isConnected = true;
                        this.timeSync.start();
                        // Send initial join message
                        this.send({
                            type: 'JOIN',
                            playerId: this.localId,
                            name: this.playerData.name,
                            color: this.playerData.color
                        });
                        this.callbacks.onConnected();
                    });

                    this.conn.on('data', (data) => {
                        this.handleIncomingData(data);
                    });

                    this.conn.on('close', () => {
                        this.isConnected = false;
                        this.timeSync.stop();
                        this.callbacks.onDisconnected();
                    });

                    this.conn.on('error', (err) => {
                        console.warn('Connection error with host:', err);
                        this.callbacks.onError(err);
                    });
                });

                this.peer.on('error', (err) => {
                    console.warn('Peer error in client:', err);
                    // If WebRTC fails, try broadcast channel fallback if on same device
                    if (this.broadcastChannel) {
                        this.sendLocalJoin();
                    } else {
                        this.callbacks.onError(err);
                    }
                });
            } catch (err) {
                console.warn('PeerJS init failed, trying broadcast channel:', err);
                this.sendLocalJoin();
            }
        } else {
            this.sendLocalJoin();
        }
    }

    sendLocalJoin() {
        if (this.broadcastChannel) {
            this.isConnected = true;
            this.timeSync.start();
            this.send({
                type: 'JOIN',
                playerId: this.localId,
                name: this.playerData.name,
                color: this.playerData.color
            });
            this.callbacks.onConnected();
        }
    }

    send(message) {
        if (this.conn && this.conn.open) {
            try {
                this.conn.send(message);
            } catch (e) {
                console.warn('Failed to send over WebRTC:', e);
            }
        }
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    fromLocalTab: true,
                    playerId: this.localId,
                    payload: message
                });
            } catch (e) {
                console.warn('Failed to send over BroadcastChannel:', e);
            }
        }
    }

    handleIncomingData(data) {
        if (!data) return;

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
        this.timeSync.stop();
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
        if (this.conn) {
            this.conn.close();
        }
        if (this.peer) {
            this.peer.destroy();
        }
    }
}

window.HostNetwork = HostNetwork;
window.ParticipantNetwork = ParticipantNetwork;
