/**
 * Multibuzz - Millisecond Time Synchronization
 * Provides NTP-like clock synchronization between host and participants over WebRTC.
 * Ensures buzzer press sequence is ordered by true physical press time regardless of network jitter.
 */
class TimeSyncClient {
    constructor(sendFn) {
        this.sendFn = sendFn; // Function to send message to host
        this.offset = 0;      // Difference between host clock and client clock (hostTime = clientTime + offset)
        this.rtt = 0;         // Estimated round-trip time in milliseconds
        this.samples = [];    // Rolling window of clock samples
        this.isSynced = false;
        this.syncIntervalId = null;
    }

    start() {
        this.samples = [];
        this.isSynced = false;
        
        // Initial burst: 4 pings with 200ms spacing to establish an accurate baseline quickly
        let count = 0;
        const burstInterval = setInterval(() => {
            this.sendPing();
            count++;
            if (count >= 4) {
                clearInterval(burstInterval);
                // Continuous background calibration every 10 seconds
                this.syncIntervalId = setInterval(() => this.sendPing(), 10000);
            }
        }, 200);
    }

    stop() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
    }

    sendPing() {
        if (typeof this.sendFn === 'function') {
            const t0 = Date.now();
            this.sendFn({
                type: 'TIME_PING',
                t0: t0
            });
        }
    }

    handlePong(msg) {
        const t1 = Date.now();
        const t0 = msg.t0;
        const hostTime = msg.hostTime;

        if (!t0 || !hostTime) return;

        const roundTripTime = Math.max(0, t1 - t0);
        const oneWayDelay = roundTripTime / 2;
        // Estimated host time at the exact moment of pong receipt (t1)
        const estimatedHostTime = hostTime + oneWayDelay;
        const sampleOffset = estimatedHostTime - t1;

        this.samples.push({
            rtt: roundTripTime,
            offset: sampleOffset
        });

        // Keep last 8 samples
        if (this.samples.length > 8) {
            this.samples.shift();
        }

        // Pick the sample with the lowest RTT (least network queueing/jitter)
        const bestSample = this.samples.reduce((best, curr) => curr.rtt < best.rtt ? curr : best, this.samples[0]);
        this.offset = bestSample.offset;
        this.rtt = bestSample.rtt;
        this.isSynced = true;
    }

    // Get current time normalized to the host's clock
    getSyncedHostTime() {
        return Date.now() + this.offset;
    }

    // Calculate response time since the buzzer was unlocked
    calculateElapsedMs(hostUnlockTimestamp) {
        const nowInHostClock = this.getSyncedHostTime();
        return Math.max(0, nowInHostClock - hostUnlockTimestamp);
    }
}

// Host helper to respond to client ping requests
class TimeSyncHost {
    static createPong(pingMsg) {
        return {
            type: 'TIME_PONG',
            t0: pingMsg.t0,
            hostTime: Date.now()
        };
    }
}

window.TimeSyncClient = TimeSyncClient;
window.TimeSyncHost = TimeSyncHost;
