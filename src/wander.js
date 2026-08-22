// 🚶 Spark & Astro Autonomous Multi-Monitor Wandering Engine (Desktop Pet Mode)

const { screen } = require('electron');

class WanderEngine {
  constructor(mainWindow, sparkServer) {
    this.mainWindow = mainWindow;
    this.sparkServer = sparkServer;
    this.enabled = true; // Enabled by default
    this.isPausedByAgent = false;
    this.isUserDragging = false;
    
    this.currentPos = { x: 0, y: 0 };
    this.targetPos = { x: 0, y: 0 };
    this.state = 'IDLE'; // 'IDLE', 'WALKING', 'PAUSED'
    this.facing = 'right';
    
    this.moveInterval = null;
    this.idleTimer = null;
    
    this.speed = 1.6; // Pixels per step for smooth walking/floating
  }

  start() {
    if (!this.mainWindow) return;
    const [x, y] = this.mainWindow.getPosition();
    this.currentPos = { x, y };

    this.scheduleNextWalk(3000); // Start first walk after 3 seconds
    this.startMoveLoop();
  }

  stop() {
    if (this.moveInterval) clearInterval(this.moveInterval);
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  toggle(enabled) {
    this.enabled = enabled !== undefined ? enabled : !this.enabled;
    console.log(`🚶 Wander Mode: ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
    if (this.enabled) {
      if (this.state === 'IDLE') {
        this.scheduleNextWalk(2000);
      }
    } else {
      this.state = 'IDLE';
      if (this.idleTimer) clearTimeout(this.idleTimer);
    }
    return this.enabled;
  }

  pauseForAgent() {
    this.isPausedByAgent = true;
    this.state = 'PAUSED';
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  resumeAfterAgent(delayMs = 4000) {
    this.isPausedByAgent = false;
    if (this.enabled) {
      this.scheduleNextWalk(delayMs);
    }
  }

  scheduleNextWalk(delayMs) {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (!this.enabled || this.isPausedByAgent) return;

    this.idleTimer = setTimeout(() => {
      if (this.enabled && !this.isPausedByAgent && this.state !== 'WALKING') {
        this.pickNewTarget();
      }
    }, delayMs);
  }

  pickNewTarget() {
    if (!this.mainWindow || this.mainWindow.isDestroyed() || !this.enabled || this.isPausedByAgent) return;

    const displays = screen.getAllDisplays();
    if (displays.length === 0) return;

    // Pick a random display (enables cross-monitor walking between Monitor 1 and Monitor 2!)
    const targetDisplay = displays[Math.floor(Math.random() * displays.length)];
    const workArea = targetDisplay.workArea;

    const [winW, winH] = this.mainWindow.getSize();

    // Pick a destination on the target monitor
    // 70% of the time, walk near the bottom edge (dock/floor), 30% float higher
    const isFloating = Math.random() < 0.35;

    const minX = workArea.x + 30;
    const maxX = workArea.x + workArea.width - winW - 30;
    const targetX = Math.round(minX + Math.random() * Math.max(0, maxX - minX));

    let targetY;
    if (isFloating) {
      const minY = workArea.y + 60;
      const maxY = workArea.y + workArea.height - winH - 120;
      targetY = Math.round(minY + Math.random() * Math.max(0, maxY - minY));
    } else {
      targetY = Math.round(workArea.y + workArea.height - winH - 30);
    }

    const [curX, curY] = this.mainWindow.getPosition();
    this.currentPos = { x: curX, y: curY };
    this.targetPos = { x: targetX, y: targetY };

    // Determine facing direction (left or right)
    const newFacing = targetX < curX ? 'left' : 'right';
    if (newFacing !== this.facing) {
      this.facing = newFacing;
      this.notifyFacingDirection(this.facing);
    }

    this.state = 'WALKING';
  }

  startMoveLoop() {
    if (this.moveInterval) clearInterval(this.moveInterval);

    // 40 ticks per second (25ms interval) for buttery smooth motion
    this.moveInterval = setInterval(() => {
      if (!this.enabled || this.isPausedByAgent || this.state !== 'WALKING' || !this.mainWindow || this.mainWindow.isDestroyed()) {
        return;
      }

      const dx = this.targetPos.x - this.currentPos.x;
      const dy = this.targetPos.y - this.currentPos.y;
      const dist = Math.hypot(dx, dy);

      if (dist < this.speed + 1) {
        // Destination reached!
        this.currentPos.x = this.targetPos.x;
        this.currentPos.y = this.targetPos.y;
        this.mainWindow.setPosition(Math.round(this.currentPos.x), Math.round(this.currentPos.y));
        this.state = 'IDLE';

        // Rest at destination for 6 to 16 seconds before walking again
        const restTime = 6000 + Math.random() * 10000;
        this.scheduleNextWalk(restTime);
        return;
      }

      // Step towards destination
      const stepX = (dx / dist) * this.speed;
      const stepY = (dy / dist) * this.speed;

      this.currentPos.x += stepX;
      this.currentPos.y += stepY;

      this.mainWindow.setPosition(Math.round(this.currentPos.x), Math.round(this.currentPos.y));
    }, 25);
  }

  notifyFacingDirection(direction) {
    if (this.sparkServer) {
      this.sparkServer.broadcast({ type: 'facing_changed', direction });
    }
  }
}

module.exports = WanderEngine;
