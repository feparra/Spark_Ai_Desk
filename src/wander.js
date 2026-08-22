// 🚶 Spark & Astro Autonomous Multi-Monitor Wandering Engine (Robust & Safe)

const { screen } = require('electron');

class WanderEngine {
  constructor(mainWindow, sparkServer) {
    this.mainWindow = mainWindow;
    this.sparkServer = sparkServer;
    this.enabled = false; // Disabled by default for rock-solid 0% CPU/GPU performance
    this.isPausedByAgent = false;
    
    this.currentPos = { x: 0, y: 0 };
    this.targetPos = { x: 0, y: 0 };
    this.state = 'IDLE';
    this.facing = 'right';
    
    this.moveInterval = null;
    this.idleTimer = null;
    
    this.speed = 2.0;
  }

  start() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    try {
      const [x, y] = this.mainWindow.getPosition();
      this.currentPos = { x: Number(x) || 0, y: Number(y) || 0 };
    } catch (e) {
      this.currentPos = { x: 100, y: 100 };
    }

    if (this.enabled) {
      this.scheduleNextWalk(15000);
      this.startMoveLoop();
    }
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
        this.scheduleNextWalk(3000);
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

  resumeAfterAgent(delayMs = 5000) {
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

    try {
      const displays = screen.getAllDisplays();
      if (!displays || displays.length === 0) return;

      const targetDisplay = displays[Math.floor(Math.random() * displays.length)];
      const workArea = targetDisplay.workArea || { x: 0, y: 0, width: 1920, height: 1080 };

      const [winW, winH] = this.mainWindow.getSize();

      const minX = Math.round(workArea.x + 30);
      const maxX = Math.round(workArea.x + workArea.width - winW - 30);
      const targetX = Math.round(minX + Math.random() * Math.max(0, maxX - minX));

      const isFloating = Math.random() < 0.35;
      let targetY;
      if (isFloating) {
        const minY = Math.round(workArea.y + 60);
        const maxY = Math.round(workArea.y + workArea.height - winH - 120);
        targetY = Math.round(minY + Math.random() * Math.max(0, maxY - minY));
      } else {
        targetY = Math.round(workArea.y + workArea.height - winH - 30);
      }

      const [curX, curY] = this.mainWindow.getPosition();
      this.currentPos = { x: Number(curX) || 0, y: Number(curY) || 0 };
      this.targetPos = { x: Number(targetX) || curX, y: Number(targetY) || curY };

      const newFacing = this.targetPos.x < this.currentPos.x ? 'left' : 'right';
      if (newFacing !== this.facing) {
        this.facing = newFacing;
        this.notifyFacingDirection(this.facing);
      }

      this.state = 'WALKING';
    } catch (err) {
      console.error('Error picking target:', err);
      this.state = 'IDLE';
    }
  }

  startMoveLoop() {
    if (this.moveInterval) clearInterval(this.moveInterval);

    this.moveInterval = setInterval(() => {
      if (!this.enabled || this.isPausedByAgent || this.state !== 'WALKING' || !this.mainWindow || this.mainWindow.isDestroyed()) {
        return;
      }

      const dx = this.targetPos.x - this.currentPos.x;
      const dy = this.targetPos.y - this.currentPos.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= this.speed + 1 || isNaN(dist) || dist === 0) {
        this.currentPos.x = this.targetPos.x;
        this.currentPos.y = this.targetPos.y;
        this.safeSetPosition(this.currentPos.x, this.currentPos.y);
        this.state = 'IDLE';

        const restTime = 6000 + Math.random() * 10000;
        this.scheduleNextWalk(restTime);
        return;
      }

      const stepX = (dx / dist) * this.speed;
      const stepY = (dy / dist) * this.speed;

      if (!isNaN(stepX) && !isNaN(stepY)) {
        this.currentPos.x += stepX;
        this.currentPos.y += stepY;
        this.safeSetPosition(this.currentPos.x, this.currentPos.y);
      }
    }, 25);
  }

  safeSetPosition(x, y) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    const safeX = Math.round(Number(x));
    const safeY = Math.round(Number(y));
    if (!isNaN(safeX) && !isNaN(safeY)) {
      try {
        this.mainWindow.setPosition(safeX, safeY);
      } catch (err) {
        // Safe fallback
      }
    }
  }

  notifyFacingDirection(direction) {
    if (this.sparkServer) {
      this.sparkServer.broadcast({ type: 'facing_changed', direction });
    }
  }
}

module.exports = WanderEngine;
