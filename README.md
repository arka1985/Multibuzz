# ⚡ Multibuzz - Real-Time Quiz Buzzer System

> **Sub-second precision quiz buzzer system for trivia competitions, game shows, and classrooms. 100% serverless and ready to host for free via GitHub Pages.**

---

## 🎯 Features

- **⏱️ True Millisecond Sequence Tracking**:
  - Automatically records and ranks participants down to the millisecond (`0.001s`).
  - Displays reaction time elapsed from when buzzers unlocked (e.g. `0.342s`).
  - Calculates the exact millisecond delta relative to the leader (e.g. `Leader`, `+0.045s (+45ms)`).
  - Uses an NTP-style continuous clock offset synchronization algorithm to cancel out network latency and Wi-Fi jitter.
- **👑 Quizmaster / Host Console (`host.html`)**:
  - One-touch **Unlock / Lock Buzzers** (with **Spacebar** keyboard shortcut).
  - Reset & Next Question (`R` shortcut) and Clear Buzzes (`C` shortcut).
  - Live ranking table showing #1 Gold 🥇, #2 Silver 🥈, #3 Bronze 🥉.
  - Interactive scoring: Award points (`+10`, `-5`) directly from the buzz list.
  - Live Scoreboard & Connected Participants roster with latency/ping indicators.
  - Built-in **"Test Practice"** bot simulator to test the board with realistic millisecond contestant taps.
- **🔔 Tactile Participant Buzzer (`play.html`)**:
  - Giant 3D tactile buzzer button with physical press animations and responsive feedback.
  - **Zero touch delay**: Uses `pointerdown` and viewport touch-action optimization to eliminate the 300ms mobile browser touch lag.
  - Haptic vibration on tap (`navigator.vibrate`) on supported mobile devices.
  - Custom team color selection and nickname persistence.
- **📱 Instant QR Code & Room Sharing**:
  - Host automatically displays a high-resolution QR code. Participants simply point their smartphone camera to join instantly without downloading an app.
- **🎵 Zero-Dependency Web Audio**:
  - Synthesizes retro/game-show buzzers, unlock bells, major victory chords, and wrong-answer buzzes using the browser's native Web Audio API. No external MP3 files to load or fail!
- **🌐 100% Serverless GitHub Pages Compatible**:
  - Pure client-side WebRTC DataChannels (PeerJS).
  - Also features an automatic `BroadcastChannel` fallback for same-device / split-screen multi-tab offline testing.

---

## 🚀 How to Host on GitHub Pages (Step-by-Step)

Hosting Multibuzz on GitHub is free, takes under 2 minutes, and requires no servers or databases.

### Method 1: Using GitHub Web Interface (No Command Line Needed)

1. **Create a GitHub Repository**:
   - Go to [GitHub.com](https://github.com) and click **New Repository**.
   - Name it `multibuzz` (or any name you prefer).
   - Set it to **Public** and click **Create repository**.
2. **Upload the Files**:
   - Click **Add file** > **Upload files**.
   - Drag and drop all files from this folder (`index.html`, `host.html`, `play.html`, `css/`, `js/`, `.github/`, `README.md`).
   - Click **Commit changes**.
3. **Enable GitHub Pages**:
   - In your repository, click the **Settings** tab.
   - On the left sidebar, click **Pages** (under "Code and automation").
   - Under **Build and deployment**:
     - **Source**: Select **GitHub Actions** (the included `.github/workflows/deploy.yml` will automatically build and publish it).
     - *Alternative:* Select **Deploy from a branch**, choose `main` branch and `/ (root)` folder, then click **Save**.
4. **Done!**
   - In about 1 minute, GitHub will give you your live URL:
     ```
     https://<your-username>.github.io/multibuzz/
     ```
   - Open that URL on your laptop to host, or scan the QR code from any mobile device to participate!

---

### Method 2: Using Git CLI

```bash
# 1. Initialize git in the Multibuzz folder
git init -b main

# 2. Add all files and commit
git add .
git commit -m "Initial Multibuzz quiz buzzer release"

# 3. Add your remote repository
git remote add origin https://github.com/<your-username>/multibuzz.git

# 4. Push to GitHub
git push -u origin main
```

Then go to **Settings** > **Pages** in GitHub and enable GitHub Pages.

---

## 🎮 How to Run a Quiz

```
           +---------------------------------------+
           |           HOST LAPTOP                 |
           |  (Connected to Projector / Big Screen)|
           +-------------------+-------------------+
                               |
                   WebRTC / Peer-to-Peer
                               |
          +--------------------+--------------------+
          |                                         |
+---------v---------+                     +---------v---------+
|  Participant 1    |                     |  Participant 2    |
|  (Team Einstein)  |                     |  (Brainiacs)      |
|  Time: 0.312s     |                     |  Time: 0.358s     |
|  Diff: Leader 🥇  |                     |  Diff: +46ms 🥈   |
+-------------------+                     +-------------------+
```

1. **Host opens `host.html`**:
   - A unique 6-character room code (e.g., `7X9K2P`) is generated.
   - Click the **QR Code** button (📱) to project the QR code on a screen or TV.
2. **Contestants join on `play.html`**:
   - Contestants scan the QR code with their phone camera, enter their team name, and select a color.
   - The buzzer initially shows **LOCKED** (dimmed).
3. **Host asks a question**:
   - When the host finishes reading the question, they hit **Spacebar** (or click **Unlock Buzzers**).
   - Buzzers illuminate on all phones with a chime.
4. **Participants buzz**:
   - The first team to buzz gets #1 🥇 with reaction time displayed (e.g. `0.285s`).
   - Teams buzzing milliseconds later are registered in exact physical tap order (e.g. `#2: +0.038s (+38ms)`).
   - Host awards points (`+10` or `-5`).
   - Host presses **R** (or clicks **Next Question**) to clear the buzzers and start Question 2!

---

## ⌨️ Host Keyboard Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| <kbd>Space</kbd> | **Toggle Buzzer** | Instantly unlocks or locks the buzzer |
| <kbd>R</kbd> | **Next Question** | Clears buzzes and advances question counter |
| <kbd>C</kbd> | **Clear Board** | Clears the buzz list for a re-buzz |

---

## 🔬 How the Millisecond Synchronization Works

In competitive quizzing, participants often buzz within 20 to 80 milliseconds of each other. Normal web apps that record time when packets reach the server are unfair to players with higher network ping.

Multibuzz solves this with **calibrated NTP clock synchronization**:

1. **Clock Calibration**: Upon connecting, the participant's device performs ping-pong synchronization cycles with the host to measure the Round-Trip Time ($RTT$) and compute the exact clock offset:
   $$\Delta_{offset} = \left( T_{host\_receive} + \frac{RTT}{2} \right) - T_{client\_local}$$
2. **True Tap Timestamping**: When the host unlocks the buzzers at $T_{unlock}$, the participant's buzzer activates. When the button is touched, the participant captures:
   $$T_{tap} = T_{client\_now} + \Delta_{offset}$$
   $$\text{Elapsed Time} = T_{tap} - T_{unlock}$$
3. **Accurate Sorting**: Even if cellular data delays Player B's transmission by 100ms, the host parses $T_{tap}$ and ranks Player B ahead of Player A if Player B physically tapped the screen first.

---

## 📂 Project Structure

```
multibuzz/
├── index.html              # Landing page (Role selector, Quick join, Feature guide)
├── host.html               # Quizmaster console (Projector view, controls, live rankings)
├── play.html               # Participant buzzer (Mobile-optimized tactile 3D buzzer)
├── css/
│   └── styles.css          # Glassmorphism UI, 3D button animations, and dark theme
├── js/
│   ├── audio.js            # Synthesized Web Audio API sound effects engine
│   ├── time-sync.js        # High-precision NTP clock offset calibration
│   ├── webrtc.js           # PeerJS WebRTC networking & BroadcastChannel fallback
│   ├── host.js             # Host quiz logic, scoring, and ranking sequence
│   └── player.js           # Participant state machine and latency-free touch handler
├── .github/
│   └── workflows/
│       └── deploy.yml      # Automated GitHub Pages deployment workflow
└── README.md               # Documentation and setup instructions
```

---

## 🛡️ License

MIT License. Free for schools, universities, pub quizzes, and trivia enthusiasts worldwide!
