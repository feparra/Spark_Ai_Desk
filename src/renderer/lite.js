// LiteMode — auto-detect low-RAM machines and apply CSS/behavior optimizations
// Runs in the renderer process

window.LiteMode = (function () {
  const RAM_THRESHOLD_GB = 4; // navigator.deviceMemory threshold

  function detect() {
    let isLite = false;

    // 1. Check navigator.deviceMemory (Chrome/Electron exposes in GB)
    if (navigator.deviceMemory !== undefined && navigator.deviceMemory <= RAM_THRESHOLD_GB) {
      isLite = true;
    }

    // 2. Check URL param ?lite=1 (passed by main.js when os.totalmem() <= 8GB or SPARK_LITE=1)
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('lite') === '1') {
        isLite = true;
      }
    } catch (e) {}

    // 3. Apply CSS class
    if (isLite) {
      document.body.classList.add('lite-mode');
      console.log('⚡ Lite mode activated — reduced visual effects');
    }

    return isLite;
  }

  function isActive() {
    return document.body.classList.contains('lite-mode');
  }

  function getSettings() {
    const isLite = isActive();
    return {
      radarInterval: isLite ? 30000 : 12000,
      wanderEnabled: false, // Always false in lite
      backdropBlur: !isLite,
      gifAnimation: !isLite,
      fontLoading: !isLite // Skip web font loading in lite mode
    };
  }

  return {
    detect,
    isActive,
    getSettings
  };
})();