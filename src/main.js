import { CarouselScene } from "./scenes/CarouselScene.js";
import { createScrollTimeline } from "./animation/scrollTimeline.js";
import { createSnowfall } from "./effects/Snowfall.js";
import photoManifest from "./generated/photo-manifest.json";

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
const photos = photoManifest.map((photo) => ({
  ...photo,
  src: assetUrl(photo.src),
}));

const app = document.getElementById("app") ?? document.body.appendChild(document.createElement("div"));
app.id = "app";
app.replaceChildren();
createSnowfall();

const backgroundMusic = new Audio(assetUrl("birthday.mp3"));
backgroundMusic.loop = true;
backgroundMusic.preload = "auto";
backgroundMusic.autoplay = true;
backgroundMusic.volume = 0.58;

const startBackgroundMusic = () => {
  backgroundMusic.play().then(() => {
    for (const eventName of ["pointerdown", "touchstart", "wheel", "keydown"]) {
      window.removeEventListener(eventName, startBackgroundMusic);
    }
  }).catch(() => {
    // Browsers can block audible autoplay. The same call is retried on the
    // visitor's first gesture without adding a visible control.
  });
};

backgroundMusic.addEventListener("canplaythrough", startBackgroundMusic, { once: true });
for (const eventName of ["pointerdown", "touchstart", "wheel", "keydown"]) {
  window.addEventListener(eventName, startBackgroundMusic, { passive: true });
}
backgroundMusic.load();

const canvas = document.createElement("canvas");
canvas.setAttribute("aria-label", "滚轮控制的梦幻旋转木马 3D 预览");
app.appendChild(canvas);

const hint = document.createElement("div");
hint.className = "scroll-hint";
document.body.appendChild(hint);

const counter = document.createElement("div");
counter.className = "photo-counter";
counter.textContent = photos.length ? `0 / ${photos.length}` : "请将照片放入 public/photos";
document.body.appendChild(counter);

const loading = document.createElement("div");
loading.className = "model-loading";
loading.innerHTML = `
  <div class="model-loading__panel">
    <span class="model-loading__spark" aria-hidden="true"></span>
    <strong>正在加载回忆</strong>
    <span class="model-loading__status">准备照片…</span>
    <span class="model-loading__track"><i></i></span>
    <span class="model-loading__value">0%</span>
  </div>
`;
document.body.appendChild(loading);
document.documentElement.classList.add("is-loading");

const loadingStatus = loading.querySelector(".model-loading__status");
const loadingFill = loading.querySelector(".model-loading__track i");
const loadingValue = loading.querySelector(".model-loading__value");
let modelReady = false;
let photosReady = photos.length === 0;
let photoProgress = photos.length ? 0 : 1;

function updateLoading() {
  const progress = Math.min(1, photoProgress * 0.88 + (modelReady ? 0.12 : 0));
  const percent = Math.round(progress * 100);
  loadingFill.style.transform = `scaleX(${progress})`;
  loadingValue.textContent = `${percent}%`;
  if (!photosReady) loadingStatus.textContent = `正在准备照片挂位 ${Math.round(photoProgress * 100)}%`;
  else if (!modelReady) loadingStatus.textContent = "正在加载旋转木马…";

  if (modelReady && photosReady) {
    loadingStatus.textContent = `照片挂位已就绪，共 ${photos.length} 张可轮换`;
    loadingFill.style.transform = "scaleX(1)";
    loadingValue.textContent = "100%";
    loading.classList.add("is-complete");
    document.documentElement.classList.remove("is-loading");
    startBackgroundMusic();
    window.setTimeout(() => loading.remove(), 520);
  }
}

const flash = document.createElement("div");
flash.className = "warm-memory-flash";
document.body.appendChild(flash);

const carouselScene = new CarouselScene({
  canvas,
  flashElement: flash,
  photos,
  onPhotoSelect: openPhoto,
  onPhotoLoadProgress(progress) {
    photoProgress = progress;
    updateLoading();
  },
  onPhotosReady() {
    photosReady = true;
    photoProgress = 1;
    updateLoading();
  },
  onLoad() {
    modelReady = true;
    updateLoading();
  },
  onError() {
    loading.classList.add("is-error");
  },
});

createScrollTimeline({
  onUpdate(state) {
    carouselScene.setProgress(state);
    hint.style.opacity = String(Math.max(0, 0.72 - state.progress * 2.2));
    if (photos.length) {
      counter.textContent = `${carouselScene.getPhotoSequencePosition()} / ${photos.length}`;
    }
  },
});

const lightbox = createLightbox();
let activePhotoIndex = 0;

function openPhoto(index) {
  if (!photos[index]) return;
  activePhotoIndex = index;
  renderLightboxPhoto();
  lightbox.showModal();
  document.documentElement.classList.add("lightbox-open");
  lightbox.querySelector(".photo-lightbox__close").focus();
}

function renderLightboxPhoto() {
  const photo = photos[activePhotoIndex];
  const image = lightbox.querySelector("img");
  image.src = photo.src;
  image.alt = photo.alt;
  lightbox.querySelector("h2").textContent = photo.title;
  lightbox.querySelector("p").textContent = [photo.date, photo.caption].filter(Boolean).join(" · ");
  lightbox.querySelector(".photo-lightbox__position").textContent = `${activePhotoIndex + 1} / ${photos.length}`;
}

function createLightbox() {
  const dialog = document.createElement("dialog");
  dialog.className = "photo-lightbox";
  dialog.setAttribute("aria-label", "照片大图预览");
  dialog.innerHTML = `
    <button class="photo-lightbox__close" type="button" aria-label="关闭照片">×</button>
    <button class="photo-lightbox__nav photo-lightbox__prev" type="button" aria-label="上一张">‹</button>
    <figure>
      <img alt="" />
      <figcaption><h2></h2><p></p><span class="photo-lightbox__position"></span></figcaption>
    </figure>
    <button class="photo-lightbox__nav photo-lightbox__next" type="button" aria-label="下一张">›</button>
  `;
  document.body.appendChild(dialog);

  const close = () => dialog.close();
  const move = (offset) => {
    activePhotoIndex = (activePhotoIndex + offset + photos.length) % photos.length;
    renderLightboxPhoto();
  };
  dialog.querySelector(".photo-lightbox__close").addEventListener("click", close);
  dialog.querySelector(".photo-lightbox__prev").addEventListener("click", () => move(-1));
  dialog.querySelector(".photo-lightbox__next").addEventListener("click", () => move(1));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("close", () => document.documentElement.classList.remove("lightbox-open"));
  dialog.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  });
  return dialog;
}

function updateScrollLength() {
  const height = Math.max(window.innerHeight * 3.2, window.innerHeight + photos.length * 110);
  document.documentElement.style.minHeight = `${height}px`;
  document.body.style.minHeight = `${height}px`;
}

updateScrollLength();
window.addEventListener("resize", updateScrollLength);

function animate() {
  requestAnimationFrame(animate);
  carouselScene.render();
}

animate();
