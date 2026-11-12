const clamp01 = (value) => Math.min(1, Math.max(0, value));

export function createScrollTimeline({
  scrollElement = document.documentElement,
  onUpdate = () => {},
} = {}) {
  const state = {
    progress: 0,
    rotationProgress: 0,
    focusProgress: 0,
    transitionProgress: 0,
  };

  const calculate = () => {
    const maxScroll = Math.max(1, scrollElement.scrollHeight - window.innerHeight);
    state.progress = clamp01(window.scrollY / maxScroll);
    state.rotationProgress = state.progress;
    state.focusProgress = 0;
    state.transitionProgress = 0;
    onUpdate({ ...state });
  };

  const handleScroll = () => requestAnimationFrame(calculate);
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", handleScroll);
  calculate();

  return {
    getState: () => ({ ...state }),
    destroy() {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    },
  };
}
