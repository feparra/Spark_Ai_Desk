// 📡 Spark AI - Agent Radar & Local Process / Port Sniffer
// Scans for active AI agents (Claude Code, Antigravity, OpenClaw, Hermes, Ollama, LM Studio)

const http = require('http');
const { exec } = require('child_process');

class AgentRadar {
  constructor(sparkServer, options = {}) {
    this.sparkServer = sparkServer;
    this.scanIntervalMs = options.scanIntervalMs || 12000; // Scan every 12 seconds for low CPU
    this.timer = null;
    this.knownAgents = new Set();
    this.activeAgents = new Set();
    this.hasWelcomed = new Set();
  }

  start() {
    this.scan();
    this.timer = setInterval(() => this.scan(), this.scanIntervalMs);
    console.log('📡 Agent Radar initialized and scanning...');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async scan() {
    const discovered = new Set();

    // 1. Check Live Connected Sessions first (last 60s)
    const now = Date.now();
    const liveConnected = [];
    if (this.sparkServer && this.sparkServer.activeSessions) {
      for (const [agentKey, sess] of this.sparkServer.activeSessions.entries()) {
        if (now - sess.lastSeen < 60000) {
          const capitalized = agentKey.charAt(0).toUpperCase() + agentKey.slice(1);
          liveConnected.push(capitalized);
          discovered.add(capitalized);
        }
      }
    }

    // 2. Scan Local AI Ports
    await Promise.all([
      this.checkPort(11434, 'Ollama', discovered),
      this.checkPort(1234, 'LM Studio', discovered),
      this.checkPort(18789, 'OpenClaw', discovered),
      this.checkPort(8000, 'Hermes API', discovered)
    ]);

    // 3. Scan Running Processes in Windows (PowerShell / tasklist lightweight query)
    await this.scanProcesses(discovered);

    // 4. Build status text
    const currentList = Array.from(discovered);
    this.activeAgents = discovered;

    let pillMessage = '🔍 Radar: Scanning for agents...';
    if (liveConnected.length > 0) {
      pillMessage = `🟢 Connected: ${liveConnected.join(', ')}`;
    } else if (currentList.length > 0) {
      pillMessage = `🟡 Detected: ${currentList.join(', ')}`;
    }

    this.sparkServer.broadcast({
      type: 'agents_radar_update',
      activeAgents: currentList,
      liveConnected,
      pillMessage
    });
  }

  checkPort(port, agentName, discoveredSet) {
    return new Promise((resolve) => {
      const req = http.get({
        host: '127.0.0.1',
        port: port,
        path: '/',
        timeout: 800
      }, (res) => {
        discoveredSet.add(agentName);
        resolve();
      });

      req.on('error', () => resolve());
      req.on('timeout', () => { req.destroy(); resolve(); });
    });
  }

  scanProcesses(discoveredSet) {
    return new Promise((resolve) => {
      // Fast lightweight query using tasklist
      exec('tasklist /FI "STATUS eq RUNNING" /FO CSV /NH', { timeout: 3000 }, (err, stdout) => {
        if (!err && stdout) {
          const lower = stdout.toLowerCase();
          
          if (lower.includes('antigravity') || lower.includes('gemini') || lower.includes('cursor')) {
            discoveredSet.add('Antigravity');
          }
          if (lower.includes('claude') || lower.includes('claude-code')) {
            discoveredSet.add('Claude Code');
          }
          if (lower.includes('ollama')) {
            discoveredSet.add('Ollama');
          }
          if (lower.includes('openclaw')) {
            discoveredSet.add('OpenClaw');
          }
        }
        resolve();
      });
    });
  }

  greetNewAgent(agentName) {
    if (!this.sparkServer) return;
    this.sparkServer.broadcast({
      type: 'notification',
      data: {
        id: 'radar_' + Date.now(),
        agent: 'capy',
        state: 'done',
        title: `📡 Radar: ${agentName} Connected!`,
        message: `I've detected ${agentName} active on your system. Ready to assist with its tasks! ✨`,
        actions: ['Awesome!'],
        timeout: 8,
        sound: true,
        timestamp: Date.now()
      }
    });
  }
}

module.exports = AgentRadar;
