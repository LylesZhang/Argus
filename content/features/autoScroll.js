let frameId = null;
let lastTime = null;
let speedPxPerSecond = 30;

function speedLevelToPixelsPerSecond(level) {
  const raw = Number(level);
  const safeLevel = raw > 10
    ? Math.min(10, Math.max(1, Math.round(1 + ((raw - 15) * 9 / 165))))
    : Math.min(10, Math.max(1, Math.round(raw || 2)));
  return 15 + ((safeLevel - 1) * (165 / 9));
}

function tick(timestamp) {
  if (lastTime === null) lastTime = timestamp;
  const elapsedSeconds = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  window.scrollBy({ top: speedPxPerSecond * elapsedSeconds, left: 0, behavior: 'auto' });
  frameId = requestAnimationFrame(tick);
}

export function setupAutoScroll(speed) {
  speedPxPerSecond = speedLevelToPixelsPerSecond(speed);
  if (frameId !== null) return;
  lastTime = null;
  frameId = requestAnimationFrame(tick);
}

export function teardownAutoScroll() {
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  lastTime = null;
}
