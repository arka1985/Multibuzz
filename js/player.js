/**
 * Multibuzz - Participant / Player Buzzer Application Logic
 */

class QuizPlayer {
    constructor() {
        this.roomCode = null;
        this.playerName = '';
        this.playerColor = '#6366f1';
        this.network = null;
        this.buzzerState = 'LOCKED'; // 'LOCKED' | 'UNLOCKED'
        this.hasBuzzed = false;
        this.unlockTimestamp = null;
        this.myBuzzResult = null;

        this.initDOMElements();
        this.bindEvents();
        this.checkUrlParams();
    }

    initDOMElements() {
        this.dom = {
            joinScreen: document.getElementById('join-screen'),
            buzzerScreen: document.getElementById('buzzer-screen'),
            inputRoomCode: document.getElementById('input-room-code'),
            inputPlayerName: document.getElementById('input-player-name'),
            colorOptions: document.querySelectorAll('.color-choice'),
            btnJoin: document.getElementById('btn-join-room'),
            
            // Buzzer Screen UI
            headerRoomCode: document.getElementById('header-room-code'),
            headerPlayerName: document.getElementById('header-player-name'),
            buzzerHousing: document.getElementById('buzzer-housing'),
            buzzerButton: document.getElementById('buzzer-button'),
            buzzerStatusText: document.getElementById('buzzer-status-text'),
            buzzerResultCard: document.getElementById('buzzer-result-card'),
            resultRankBadge: document.getElementById('result-rank-badge'),
            resultTimeText: document.getElementById('result-time-text'),
            connectionStatus: document.getElementById('connection-status'),
            btnSoundToggle: document.getElementById('btn-sound-toggle')
        };
    }

    bindEvents() {
        // Color picker
        this.dom.colorOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                this.dom.colorOptions.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                this.playerColor = opt.getAttribute('data-color');
            });
        });

        // Join button
        this.dom.btnJoin.addEventListener('click', () => this.handleJoinSubmit());
        this.dom.inputPlayerName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleJoinSubmit();
        });

        // Sound toggle
        this.dom.btnSoundToggle.addEventListener('click', () => {
            const enabled = window.soundEngine.toggleSound();
            this.dom.btnSoundToggle.innerHTML = enabled ? '🔊 Sound ON' : '🔇 Muted';
        });

        // Ultra-low latency Buzzer Tap Listener
        // Listen to 'pointerdown' to bypass 300ms mobile touch delay
        const handleBuzzPress = (e) => {
            if (e.cancelable && e.type !== 'keydown') {
                e.preventDefault();
            }
            this.handleBuzz();
        };

        this.dom.buzzerButton.addEventListener('pointerdown', handleBuzzPress);

        // Also allow Spacebar or Enter on keyboard for laptop participants
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                this.handleBuzz();
            }
        });
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const room = urlParams.get('room');
        if (room) {
            this.dom.inputRoomCode.value = room.toUpperCase().trim();
            this.dom.inputPlayerName.focus();
        }

        // Restore saved player name
        const savedName = localStorage.getItem('multibuzz_player_name');
        if (savedName) {
            this.dom.inputPlayerName.value = savedName;
        }
    }

    handleJoinSubmit() {
        const roomCode = this.dom.inputRoomCode.value.trim().toUpperCase();
        const playerName = this.dom.inputPlayerName.value.trim() || 'Player ' + Math.floor(100 + Math.random() * 900);

        if (!roomCode) {
            alert('Please enter a 6-character room code from the host.');
            return;
        }

        this.roomCode = roomCode;
        this.playerName = playerName;
        localStorage.setItem('multibuzz_player_name', playerName);

        this.connectToRoom();
    }

    connectToRoom() {
        this.dom.btnJoin.disabled = true;
        this.dom.btnJoin.innerText = 'Connecting...';

        this.network = new ParticipantNetwork({
            onConnected: () => {
                console.log('Connected to host!');
                this.showBuzzerScreen();
            },
            onDisconnected: () => {
                this.dom.connectionStatus.innerText = '⚠️ Disconnected from host';
                this.dom.connectionStatus.style.color = '#ef4444';
            },
            onMessage: (msg) => {
                this.handleIncomingHostMessage(msg);
            },
            onError: (err) => {
                console.warn('Network error:', err);
                this.dom.btnJoin.disabled = false;
                this.dom.btnJoin.innerText = 'Join Quiz Room';
                alert('Could not connect to room ' + this.roomCode + '. Please ensure the Host is active!');
            }
        });

        this.network.connect(this.roomCode, {
            name: this.playerName,
            color: this.playerColor
        });
    }

    showBuzzerScreen() {
        this.dom.joinScreen.style.display = 'none';
        this.dom.buzzerScreen.style.display = 'flex';
        this.dom.headerRoomCode.innerText = this.roomCode;
        this.dom.headerPlayerName.innerText = this.playerName;
        this.dom.headerPlayerName.style.color = this.playerColor;

        this.setBuzzerState('LOCKED');
    }

    handleIncomingHostMessage(msg) {
        if (!msg) return;

        if (msg.type === 'BUZZER_STATE') {
            this.setBuzzerState(msg.state, msg.unlockTime);
        } else if (msg.type === 'ROOM_STATE') {
            this.setBuzzerState(msg.state, msg.unlockTime);
        } else if (msg.type === 'BUZZ_CLEAR') {
            this.resetBuzzerForRound();
        } else if (msg.type === 'BUZZ_UPDATE') {
            this.updateBuzzRankings(msg.buzzes);
        }
    }

    setBuzzerState(state, unlockTime = null) {
        this.buzzerState = state;

        if (state === 'UNLOCKED') {
            this.unlockTimestamp = unlockTime || Date.now();
            this.hasBuzzed = false;

            // UI changes for Unlocked state
            this.dom.buzzerHousing.className = 'buzzer-housing active-glow';
            this.dom.buzzerButton.className = 'buzzer-button state-ready';
            this.dom.buzzerStatusText.innerText = '⚡ BUZZ NOW!';
            this.dom.buzzerResultCard.style.display = 'none';

            window.soundEngine.playUnlock();
        } else {
            // LOCKED state
            this.dom.buzzerHousing.className = 'buzzer-housing locked-glow';
            this.dom.buzzerButton.className = 'buzzer-button state-locked';
            
            if (!this.hasBuzzed) {
                this.dom.buzzerStatusText.innerText = '🔒 LOCKED';
                this.dom.buzzerResultCard.style.display = 'none';
            }
        }
    }

    resetBuzzerForRound() {
        this.hasBuzzed = false;
        this.myBuzzResult = null;
        this.dom.buzzerResultCard.style.display = 'none';
        if (this.buzzerState === 'UNLOCKED') {
            this.setBuzzerState('UNLOCKED', this.unlockTimestamp);
        } else {
            this.setBuzzerState('LOCKED');
        }
    }

    handleBuzz() {
        // Guard: only allow buzz if buzzer is unlocked and player hasn't buzzed yet
        if (this.buzzerState !== 'UNLOCKED' || this.hasBuzzed) {
            // Subtle locked shake feedback
            this.dom.buzzerHousing.style.transform = 'scale(0.97)';
            setTimeout(() => this.dom.buzzerHousing.style.transform = 'scale(1)', 100);
            return;
        }

        this.hasBuzzed = true;

        // Physical feedback: Haptic vibration (mobile)
        if ('vibrate' in navigator) {
            try {
                navigator.vibrate([70, 30, 70]);
            } catch (e) {
                // Ignore vibration errors if restricted by browser
            }
        }

        // Audio feedback
        window.soundEngine.playBuzzer();

        // 3D depression effect
        this.dom.buzzerButton.className = 'buzzer-button state-buzzed pressed';
        setTimeout(() => {
            this.dom.buzzerButton.className = 'buzzer-button state-buzzed';
        }, 150);

        // Send buzz to host with calibrated timestamp
        const buzzData = this.network.buzz(this.unlockTimestamp);

        // Immediate optimistic UI feedback
        this.dom.buzzerStatusText.innerText = '🔔 BUZZED!';

        if (buzzData) {
            this.dom.buzzerResultCard.style.display = 'flex';
            this.dom.resultRankBadge.innerText = '...';
            this.dom.resultTimeText.innerText = (buzzData.elapsedMs / 1000).toFixed(3) + 's';
        }
    }

    updateBuzzRankings(buzzes) {
        if (!buzzes || !this.hasBuzzed) return;

        const myEntry = buzzes.find(b => b.playerId === this.network.localId);
        if (myEntry) {
            this.myBuzzResult = myEntry;
            this.dom.buzzerResultCard.style.display = 'flex';
            
            let rankEmoji = `#${myEntry.rank}`;
            if (myEntry.rank === 1) rankEmoji = '🥇 #1';
            else if (myEntry.rank === 2) rankEmoji = '🥈 #2';
            else if (myEntry.rank === 3) rankEmoji = '🥉 #3';

            this.dom.resultRankBadge.innerText = rankEmoji;
            this.dom.resultTimeText.innerText = (myEntry.elapsedMs / 1000).toFixed(3) + 's';

            if (myEntry.rank === 1) {
                this.dom.buzzerStatusText.innerText = '🥇 1st Place!';
                this.dom.buzzerResultCard.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(30, 41, 59, 0.9))';
                this.dom.buzzerResultCard.style.borderColor = 'rgba(245, 158, 11, 0.6)';
            } else {
                this.dom.buzzerStatusText.innerText = `#${myEntry.rank}`;
                this.dom.buzzerResultCard.style.background = 'rgba(30, 41, 59, 0.85)';
                this.dom.buzzerResultCard.style.borderColor = 'var(--border-bright)';
            }
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.quizPlayer = new QuizPlayer();
});
