/**
 * Multibuzz - Quizmaster / Host Application Logic
 */

class QuizHost {
    constructor() {
        this.roomCode = null;
        this.network = null;
        this.buzzerState = 'LOCKED'; // 'LOCKED' | 'UNLOCKED'
        this.unlockTimestamp = null;
        this.questionNumber = 1;
        this.buzzes = []; // Array of { playerId, name, color, pressTime, elapsedMs, rtt }
        this.participants = new Map(); // playerId -> { name, color, score, rtt, joinedAt }
        this.timerInterval = null;
        this.qrCodeInstance = null;

        this.initDOMElements();
        this.bindEvents();
        this.initNetwork();
    }

    initDOMElements() {
        this.dom = {
            roomCodeDisplay: document.getElementById('room-code-display'),
            statusBadge: document.getElementById('status-badge'),
            statusText: document.getElementById('status-text'),
            timerDisplay: document.getElementById('timer-display'),
            btnToggleBuzzer: document.getElementById('btn-toggle-buzzer'),
            btnResetRound: document.getElementById('btn-reset-round'),
            btnClearBuzzes: document.getElementById('btn-clear-buzzes'),
            btnSoundToggle: document.getElementById('btn-sound-toggle'),
            btnSimulateBuzz: document.getElementById('btn-simulate-buzz'),
            buzzListContainer: document.getElementById('buzz-list-container'),
            emptyState: document.getElementById('empty-state'),
            participantCount: document.getElementById('participant-count'),
            questionNumberDisplay: document.getElementById('question-number'),
            qrModal: document.getElementById('qr-modal'),
            qrContainer: document.getElementById('qrcode'),
            qrLinkInput: document.getElementById('qr-link-input'),
            btnShowQR: document.getElementById('btn-show-qr'),
            btnCloseQR: document.getElementById('btn-close-qr'),
            btnCopyLink: document.getElementById('btn-copy-link'),
            scoreboardModal: document.getElementById('scoreboard-modal'),
            scoreboardTable: document.getElementById('scoreboard-table-body'),
            btnShowScoreboard: document.getElementById('btn-show-scoreboard'),
            btnCloseScoreboard: document.getElementById('btn-close-scoreboard'),
            participantsModal: document.getElementById('participants-modal'),
            participantsList: document.getElementById('participants-list-body'),
            btnShowParticipants: document.getElementById('btn-show-participants'),
            btnCloseParticipants: document.getElementById('btn-close-participants'),
            aboutModal: document.getElementById('about-modal'),
            btnShowAbout: document.getElementById('btn-show-about'),
            btnCloseAbout: document.getElementById('btn-close-about')
        };
    }

    bindEvents() {
        // Toggle Buzzer (Lock / Unlock)
        this.dom.btnToggleBuzzer.addEventListener('click', () => this.toggleBuzzer());

        // Reset Round / Next Question
        this.dom.btnResetRound.addEventListener('click', () => this.nextRound());

        // Clear buzzes only
        this.dom.btnClearBuzzes.addEventListener('click', () => this.clearBuzzes());

        // Sound toggle
        this.dom.btnSoundToggle.addEventListener('click', () => {
            const enabled = window.soundEngine.toggleSound();
            this.updateSoundButtonUI(enabled);
        });

        // Simulated Buzzes for quick practice/testing
        if (this.dom.btnSimulateBuzz) {
            this.dom.btnSimulateBuzz.addEventListener('click', () => this.simulateContestants());
        }

        // Modals
        this.dom.btnShowQR.addEventListener('click', () => this.showQRModal());
        this.dom.btnCloseQR.addEventListener('click', () => this.hideQRModal());
        this.dom.btnCopyLink.addEventListener('click', () => this.copyInviteLink());

        this.dom.btnShowScoreboard.addEventListener('click', () => this.showScoreboard());
        this.dom.btnCloseScoreboard.addEventListener('click', () => this.hideScoreboard());

        this.dom.btnShowParticipants.addEventListener('click', () => this.showParticipants());
        this.dom.btnCloseParticipants.addEventListener('click', () => this.hideParticipants());

        if (this.dom.btnShowAbout && this.dom.aboutModal) {
            this.dom.btnShowAbout.addEventListener('click', () => {
                this.dom.aboutModal.style.display = 'flex';
            });
            this.dom.btnCloseAbout.addEventListener('click', () => {
                this.dom.aboutModal.style.display = 'none';
            });
        }

        // Keyboard Shortcuts
        // Space = Toggle Buzzer
        // R = Reset / Next Question
        // C = Clear Buzzes
        window.addEventListener('keydown', (e) => {
            // Ignore if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.code === 'Space') {
                e.preventDefault();
                this.toggleBuzzer();
            } else if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                this.nextRound();
            } else if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                this.clearBuzzes();
            }
        });

        // Initialize sound button state
        this.updateSoundButtonUI(window.soundEngine.enabled);
    }

    updateSoundButtonUI(enabled) {
        this.dom.btnSoundToggle.innerHTML = enabled ? 'Sound ON' : 'Sound OFF';
        this.dom.btnSoundToggle.className = enabled 
            ? 'btn btn-outline' 
            : 'btn btn-outline text-muted';
    }

    initNetwork() {
        // Read optional room code from URL query param ?room=ABC123
        const urlParams = new URLSearchParams(window.location.search);
        const requestedRoom = urlParams.get('room');

        this.network = new HostNetwork({
            onReady: (code) => {
                this.roomCode = code;
                this.dom.roomCodeDisplay.innerText = code;
                this.setupQRCode();
            },
            onPlayerJoined: (peerId, data) => {
                this.handlePlayerJoined(peerId, data);
            },
            onPlayerLeft: (peerId) => {
                this.handlePlayerLeft(peerId);
            },
            onMessage: (peerId, data) => {
                this.handleParticipantMessage(peerId, data);
            },
            onError: (err) => {
                console.warn('Network issue:', err);
            }
        });

        this.network.init(requestedRoom);
    }

    handlePlayerJoined(peerId, data) {
        const playerId = data.playerId || peerId;
        const existing = this.participants.get(playerId) || {};

        this.participants.set(playerId, {
            id: playerId,
            peerId: peerId,
            name: data.name || 'Anonymous',
            color: data.color || '#6366f1',
            score: existing.score || 0,
            rtt: 0,
            joinedAt: Date.now()
        });

        this.updateParticipantCountUI();

        // Send current room state to newly joined player
        this.network.sendTo(peerId, {
            type: 'ROOM_STATE',
            state: this.buzzerState,
            unlockTime: this.unlockTimestamp,
            questionNumber: this.questionNumber
        });
    }

    handlePlayerLeft(peerId) {
        // Find player with matching peerId
        for (const [id, player] of this.participants.entries()) {
            if (player.peerId === peerId) {
                // Keep player score in roster but note disconnection
                player.disconnected = true;
                break;
            }
        }
        this.updateParticipantCountUI();
    }

    updateParticipantCountUI() {
        const activeCount = Array.from(this.participants.values()).filter(p => !p.disconnected).length;
        this.dom.participantCount.innerText = activeCount;
    }

    handleParticipantMessage(peerId, data) {
        if (!data) return;

        if (data.type === 'BUZZ') {
            this.handleIncomingBuzz(data);
        }
    }

    handleIncomingBuzz(data) {
        // Only accept buzz if buzzer was unlocked
        if (this.buzzerState !== 'UNLOCKED') return;

        // Check if player already buzzed in this round
        const alreadyBuzzed = this.buzzes.some(b => b.playerId === data.playerId);
        if (alreadyBuzzed) return;

        // Compute elapsed time relative to host unlock timestamp
        const pressTime = data.pressTime || Date.now();
        const elapsedMs = Math.max(0, pressTime - (this.unlockTimestamp || pressTime));

        const buzzRecord = {
            playerId: data.playerId,
            name: data.name || 'Participant',
            color: data.color || '#6366f1',
            pressTime: pressTime,
            elapsedMs: elapsedMs,
            rtt: data.rtt || 0
        };

        const isFirstBuzz = this.buzzes.length === 0;

        this.buzzes.push(buzzRecord);

        // Sort all buzzes strictly by calibrated pressTime ascending
        this.buzzes.sort((a, b) => a.pressTime - b.pressTime);

        // Sound effect
        if (isFirstBuzz) {
            window.soundEngine.playFirstBuzz();
        } else {
            window.soundEngine.playBuzzer();
        }

        // Render buzz sequence
        this.renderBuzzList();

        // Broadcast the buzz ranking to all participants so their phones update with their position
        this.broadcastBuzzUpdate();
    }

    broadcastBuzzUpdate() {
        this.network.broadcast({
            type: 'BUZZ_UPDATE',
            buzzes: this.buzzes.map((b, index) => ({
                playerId: b.playerId,
                rank: index + 1,
                elapsedMs: b.elapsedMs
            }))
        });
    }

    toggleBuzzer() {
        if (this.buzzerState === 'LOCKED') {
            this.unlockBuzzer();
        } else {
            this.lockBuzzer();
        }
    }

    unlockBuzzer() {
        this.buzzerState = 'UNLOCKED';
        this.unlockTimestamp = Date.now();

        // Update UI
        this.dom.statusBadge.className = 'badge-live';
        this.dom.statusBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
        this.dom.statusBadge.style.color = '#34d399';
        this.dom.statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        this.dom.statusBadge.innerText = 'OPEN';
        if (this.dom.statusText) this.dom.statusText.innerText = '';
        this.dom.btnToggleBuzzer.innerHTML = 'Lock (Space)';
        this.dom.btnToggleBuzzer.className = 'btn btn-danger btn-lg';

        // Play unlock chime
        window.soundEngine.playUnlock();

        // Start live millisecond timer
        this.startTimer();

        // Broadcast to all participants
        this.network.broadcast({
            type: 'BUZZER_STATE',
            state: 'UNLOCKED',
            unlockTime: this.unlockTimestamp
        });
    }

    lockBuzzer() {
        this.buzzerState = 'LOCKED';

        // Stop live timer
        this.stopTimer();

        // Update UI
        this.dom.statusBadge.className = 'badge-live';
        this.dom.statusBadge.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        this.dom.statusBadge.style.color = '#f87171';
        this.dom.statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        this.dom.statusBadge.innerText = 'LOCKED';
        if (this.dom.statusText) this.dom.statusText.innerText = '';
        this.dom.btnToggleBuzzer.innerHTML = 'Unlock (Space)';
        this.dom.btnToggleBuzzer.className = 'btn btn-success btn-lg';

        // Play lock sound
        window.soundEngine.playLock();

        // Broadcast to all participants
        this.network.broadcast({
            type: 'BUZZER_STATE',
            state: 'LOCKED'
        });
    }

    startTimer() {
        this.stopTimer();
        const startTime = this.unlockTimestamp;
        this.timerInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = Math.max(0, now - startTime);
            this.dom.timerDisplay.innerText = this.formatSecondsMilliseconds(elapsed);
        }, 33); // ~30 fps update
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    formatSecondsMilliseconds(ms) {
        const totalSec = ms / 1000;
        return totalSec.toFixed(3) + 's';
    }

    clearBuzzes() {
        this.buzzes = [];
        this.renderBuzzList();
        this.network.broadcast({
            type: 'BUZZ_CLEAR'
        });
    }

    nextRound() {
        this.lockBuzzer();
        this.clearBuzzes();
        this.questionNumber++;
        this.dom.questionNumberDisplay.innerText = this.questionNumber;
        this.dom.timerDisplay.innerText = '0.000s';
    }

    renderBuzzList() {
        if (this.buzzes.length === 0) {
            this.dom.emptyState.style.display = 'flex';
            this.dom.buzzListContainer.innerHTML = '';
            this.dom.buzzListContainer.appendChild(this.dom.emptyState);
            return;
        }

        this.dom.emptyState.style.display = 'none';
        this.dom.buzzListContainer.innerHTML = '';

        const firstBuzzTime = this.buzzes[0].pressTime;

        this.buzzes.forEach((buzz, index) => {
            const rank = index + 1;
            const diffMs = buzz.pressTime - firstBuzzTime;
            
            const card = document.createElement('div');
            card.className = `buzz-card ${rank <= 3 ? `rank-${rank}` : ''}`;

            const rankIcon = rank;

            const formattedTime = this.formatSecondsMilliseconds(buzz.elapsedMs);
            const deltaText = rank === 1 
                ? 'Leader' 
                : `+${(diffMs / 1000).toFixed(3)}s (+${diffMs}ms)`;

            card.innerHTML = `
                <div class="rank-badge">${rankIcon}</div>
                <div class="team-info">
                    <div class="team-name" style="border-left: 4px solid ${buzz.color}; padding-left: 8px;">
                        ${this.escapeHtml(buzz.name)}
                    </div>
                </div>
                <div class="time-pill mono-timer">
                    <div>${formattedTime}</div>
                    <div class="time-delta ${rank === 1 ? 'leader' : ''}">${deltaText}</div>
                </div>
                <div class="buzz-actions" style="display: flex; gap: 6px;">
                    <button class="btn btn-outline btn-icon" style="font-weight: 700; font-size: 0.8rem;" title="+10 pts" onclick="quizHost.awardPoints('${buzz.playerId}', 10)">
                        +10
                    </button>
                    <button class="btn btn-outline btn-icon" style="font-weight: 700; font-size: 0.8rem;" title="-5 pts" onclick="quizHost.awardPoints('${buzz.playerId}', -5)">
                        -5
                    </button>
                </div>
            `;

            this.dom.buzzListContainer.appendChild(card);
        });
    }

    awardPoints(playerId, points) {
        const participant = this.participants.get(playerId);
        if (participant) {
            participant.score = (participant.score || 0) + points;
            if (points > 0) {
                window.soundEngine.playCorrect();
            } else {
                window.soundEngine.playWrong();
            }
            this.showToast(`${participant.name}: ${points > 0 ? '+' + points : points} pts (Total: ${participant.score})`);
        }
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #1e293b;
            color: #f8fafc;
            border: 1px solid rgba(255,255,255,0.2);
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            padding: 12px 20px;
            border-radius: 10px;
            font-weight: 600;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        toast.innerText = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    setupQRCode() {
        const playerUrl = this.getPlayerUrl();
        this.dom.qrLinkInput.value = playerUrl;

        // Render QR Code using qrcode.js if available
        if (typeof QRCode !== 'undefined' && this.dom.qrContainer) {
            this.dom.qrContainer.innerHTML = '';
            this.qrCodeInstance = new QRCode(this.dom.qrContainer, {
                text: playerUrl,
                width: 210,
                height: 210,
                colorDark: "#0f172a",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    }

    getPlayerUrl() {
        const origin = window.location.origin;
        let pathname = window.location.pathname;
        if (pathname.endsWith('host.html')) {
            pathname = pathname.replace('host.html', 'play.html');
        } else if (pathname.endsWith('/')) {
            pathname = pathname + 'play.html';
        } else {
            pathname = pathname.substring(0, pathname.lastIndexOf('/') + 1) + 'play.html';
        }
        return `${origin}${pathname}?room=${this.roomCode}`;
    }

    showQRModal() {
        this.setupQRCode();
        this.dom.qrModal.style.display = 'flex';
    }

    hideQRModal() {
        this.dom.qrModal.style.display = 'none';
    }

    copyInviteLink() {
        const url = this.getPlayerUrl();
        navigator.clipboard.writeText(url).then(() => {
            this.showToast('Copied player invite link to clipboard!');
        }).catch(() => {
            this.showToast('Failed to copy. Please copy manually.');
        });
    }

    showScoreboard() {
        this.dom.scoreboardTable.innerHTML = '';
        const sorted = Array.from(this.participants.values())
            .sort((a, b) => (b.score || 0) - (a.score || 0));

        if (sorted.length === 0) {
            this.dom.scoreboardTable.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color: var(--text-dim);">No participants joined yet</td></tr>`;
        } else {
            sorted.forEach((p, idx) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--border-color)';
                tr.innerHTML = `
                    <td style="padding: 12px; font-weight: 700;">#${idx + 1}</td>
                    <td style="padding: 12px; color: ${p.color}; font-weight: 600;">${this.escapeHtml(p.name)}</td>
                    <td style="padding: 12px; text-align: right; font-weight: 800; font-size: 1.1rem; color: #38bdf8;">${p.score || 0}</td>
                `;
                this.dom.scoreboardTable.appendChild(tr);
            });
        }
        this.dom.scoreboardModal.style.display = 'flex';
    }

    hideScoreboard() {
        this.dom.scoreboardModal.style.display = 'none';
    }

    showParticipants() {
        this.dom.participantsList.innerHTML = '';
        const list = Array.from(this.participants.values());

        if (list.length === 0) {
            this.dom.participantsList.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color: var(--text-dim);">No participants connected</td></tr>`;
        } else {
            list.forEach(p => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--border-color)';
                tr.innerHTML = `
                    <td style="padding: 12px; font-weight: 600; color: ${p.color};">${this.escapeHtml(p.name)}</td>
                    <td style="padding: 12px; font-size: 0.85rem; color: ${p.disconnected ? '#ef4444' : '#10b981'};">
                        ${p.disconnected ? '● Disconnected' : '● Connected'}
                    </td>
                    <td style="padding: 12px; text-align: right;">
                        <button class="btn btn-outline btn-icon" style="height:30px; width:30px;" onclick="quizHost.kickPlayer('${p.id}')">&times;</button>
                    </td>
                `;
                this.dom.participantsList.appendChild(tr);
            });
        }
        this.dom.participantsModal.style.display = 'flex';
    }

    hideParticipants() {
        this.dom.participantsModal.style.display = 'none';
    }

    kickPlayer(playerId) {
        this.participants.delete(playerId);
        this.buzzes = this.buzzes.filter(b => b.playerId !== playerId);
        this.renderBuzzList();
        this.updateParticipantCountUI();
        this.showParticipants();
    }

    simulateContestants() {
        if (this.buzzerState !== 'UNLOCKED') {
            this.unlockBuzzer();
        }

        const simulatedTeams = [
            { name: "Team Einstein", color: "#38bdf8" },
            { name: "Quiz Wizards", color: "#f59e0b" },
            { name: "Brainiacs", color: "#10b981" },
            { name: "Turbo Thinkers", color: "#ec4899" }
        ];

        // Ensure contestants exist in participants roster
        simulatedTeams.forEach((t, i) => {
            const simId = 'sim_' + (i + 1);
            if (!this.participants.has(simId)) {
                this.participants.set(simId, {
                    id: simId,
                    name: t.name,
                    color: t.color,
                    score: 0,
                    rtt: Math.floor(15 + Math.random() * 25)
                });
            }
        });
        this.updateParticipantCountUI();

        // Realistic reaction times in milliseconds (between 250ms and 950ms)
        const times = [
            Math.floor(280 + Math.random() * 60),
            Math.floor(360 + Math.random() * 80),
            Math.floor(490 + Math.random() * 120),
            Math.floor(750 + Math.random() * 180)
        ].sort((a, b) => a - b);

        times.forEach((offsetMs, idx) => {
            setTimeout(() => {
                const simId = 'sim_' + (idx + 1);
                const team = simulatedTeams[idx];
                this.handleIncomingBuzz({
                    playerId: simId,
                    name: team.name,
                    color: team.color,
                    pressTime: this.unlockTimestamp + offsetMs,
                    elapsedMs: offsetMs,
                    rtt: 20
                });
            }, offsetMs);
        });
    }

    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.quizHost = new QuizHost();
});
