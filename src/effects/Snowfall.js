export function createSnowfall({ count = 130 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "snowfall";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const context = canvas.getContext("2d");
  const flakes = [];
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let previousTime = performance.now();

  const makeFlake = (randomY = true) => ({
    x: Math.random() * width,
    y: randomY ? Math.random() * height : -12,
    radius: 1.2 + Math.random() * 3.2,
    speed: 22 + Math.random() * 44,
    drift: (Math.random() - 0.5) * 18,
    phase: Math.random() * Math.PI * 2,
    opacity: 0.32 + Math.random() * 0.58,
  });

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    while (flakes.length < count) flakes.push(makeFlake(true));
  };

  const render = (time) => {
    const delta = Math.min(0.04, (time - previousTime) / 1000);
    previousTime = time;
    context.clearRect(0, 0, width, height);

    for (const flake of flakes) {
      flake.phase += delta * 0.8;
      flake.x += (flake.drift + Math.sin(flake.phase) * 12) * delta;
      flake.y += flake.speed * delta;
      if (flake.y > height + 12 || flake.x < -20 || flake.x > width + 20) {
        Object.assign(flake, makeFlake(false));
      }
      context.beginPath();
      context.fillStyle = `rgba(255,255,255,${flake.opacity})`;
      context.shadowColor = "rgba(255,255,255,0.55)";
      context.shadowBlur = flake.radius * 2;
      context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      context.fill();
    }
    requestAnimationFrame(render);
  };

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(render);
  return canvas;
}
