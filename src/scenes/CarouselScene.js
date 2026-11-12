import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PhotoSpiral } from "./PhotoSpiral.js";

const CAROUSEL_MODEL_URL = `${import.meta.env.BASE_URL}models/dream_carousel_v008.glb`;

const lerp = (a, b, t) => a + (b - a) * t;

export class CarouselScene {
  constructor({
    canvas,
    flashElement,
    photos = [],
    onPhotoSelect,
    onPhotoLoadProgress,
    onPhotosReady,
    onLoad,
    onError,
  }) {
    this.canvas = canvas;
    this.flashElement = flashElement;
    this.progress = 0;
    this.rotationProgress = 0;
    this.focusProgress = 0;
    this.transitionProgress = 0;
    this.modelLoaded = false;
    this.targetRotation = 0;
    this.photoSlotCount = Math.min(8, photos.length);
    this.rotationTurns = Math.max(4, Math.ceil(photos.length / Math.max(1, this.photoSlotCount)));
    this.onLoad = onLoad;
    this.onError = onError;
    this.structure = null;
    this.grounding = null;
    this.cameraStart = new THREE.Vector3(0, 2.8, 14.5);
    this.lookStart = new THREE.Vector3(0, 2.45, 0);
    this.focusTarget = new THREE.Vector3(0.8, 3.1, 1.8);

    this.scene = new THREE.Scene();
    this.scene.background = createDreamGradientTexture();
    this.scene.fog = new THREE.FogExp2("#d9f0fa", 0.022);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(this.cameraStart);
    this.camera.lookAt(this.lookStart);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.carousel = this.createCarouselGroup();
    this.scene.add(this.carousel.group);
    this.photoSpiral = new PhotoSpiral({
      parent: this.carousel.rotationPivot,
      camera: this.camera,
      canvas,
      photos,
      slotCount: this.photoSlotCount,
      onSelect: onPhotoSelect,
      onLoadProgress: onPhotoLoadProgress,
      onReady: onPhotosReady,
    });
    this.loadCarouselModel();
    this.scene.add(createStars());
    this.scene.add(createMist());
    this.addLighting();

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  createCarouselGroup() {
    const rotationPivot = new THREE.Group();
    rotationPivot.name = "CarouselGroup";

    const orientationGroup = new THREE.Group();
    orientationGroup.name = "CarouselOrientation";
    orientationGroup.rotation.x = -Math.PI / 2;
    rotationPivot.add(orientationGroup);

    const carousel = { group: rotationPivot, rotationPivot, orientationGroup, model: null };
    rotationPivot.userData.CarouselGroup = carousel;
    return carousel;
  }

  loadCarouselModel() {
    const loader = new GLTFLoader();
    loader.load(
      CAROUSEL_MODEL_URL,
      (gltf) => {
        const model = gltf.scene;
        model.name = "dream-carousel-rebuilt-horses-model";
        model.traverse((object) => {
          if (object.isMesh) {
            object.castShadow = false;
            object.receiveShadow = false;
          }
        });

        this.carousel.model = model;
        this.carousel.orientationGroup.add(model);
        this.structure = this.measureCarouselStructure();
        this.addGrounding();
        this.modelLoaded = true;
        this.frameCameraToCarousel();
        this.configurePhotoRig();
        this.applyTimeline();
        this.onLoad?.();
      },
      undefined,
      (error) => {
        console.error(`[CarouselScene] Failed to load ${CAROUSEL_MODEL_URL}`, error);
        this.onError?.(error);
      },
    );
  }

  frameCameraToCarousel() {
    if (!this.carousel.model || !this.structure) {
      return;
    }

    const box = this.structure.overallBox;
    if (box.isEmpty()) {
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const verticalDistance = size.y / (2 * Math.tan(verticalFov / 2));
    const horizontalDistance = size.x / (2 * Math.tan(horizontalFov / 2));
    const viewportFill = this.camera.aspect < 0.75 ? 0.72 : 0.64;
    const distance = Math.max(verticalDistance, horizontalDistance) / viewportFill;
    const viewDirection = new THREE.Vector3(0.72, 0.055, 1).normalize();

    this.lookStart.set(center.x, box.min.y + size.y * 0.46, center.z);
    this.cameraStart.copy(this.lookStart).addScaledVector(viewDirection, distance);
    this.carouselRadius = Math.max(size.x, size.z) * 0.5;

    this.camera.position.copy(this.cameraStart);
    this.camera.lookAt(this.lookStart);
  }

  measureCarouselStructure() {
    const previousRotation = this.carousel.rotationPivot.rotation.y;
    this.carousel.rotationPivot.rotation.y = 0;
    this.carousel.group.updateMatrixWorld(true);

    const overallBox = new THREE.Box3().setFromObject(this.carousel.orientationGroup);
    const roofBox = collectNamedBounds(this.carousel.model, [
      "Canopy", "UnderRoof", "Panel", "RoofGold", "SpiderArm", "Apex",
    ]);
    const baseBox = collectNamedBounds(this.carousel.model, ["Base", "Platform"]);
    const horseBox = collectNamedBounds(this.carousel.model, ["Horse_01_", "Horse_02_", "Horse_03_"]);

    this.carousel.rotationPivot.rotation.y = previousRotation;
    this.carousel.group.updateMatrixWorld(true);
    return { overallBox, roofBox, baseBox, horseBox };
  }

  configurePhotoRig() {
    if (!this.structure || this.structure.roofBox.isEmpty()) return;
    const { roofBox, horseBox } = this.structure;
    const roofSize = roofBox.getSize(new THREE.Vector3());
    const roofCenter = roofBox.getCenter(new THREE.Vector3());
    const roofDiameter = Math.min(roofSize.x, roofSize.z);
    const roofRadius = roofDiameter * 0.5;
    const anchorY = roofBox.min.y + 0.018;
    const horseTop = horseBox.isEmpty() ? anchorY - roofDiameter * 0.6 : horseBox.max.y;
    const availableHeight = Math.max(1, anchorY - horseTop - 0.38);
    const mobile = window.innerWidth < 768;

    this.photoSpiral.configure({
      center: new THREE.Vector3(roofCenter.x, 0, roofCenter.z),
      anchorRadius: roofRadius * 0.84,
      anchorY,
      frameWidth: roofDiameter * (mobile ? 0.168 : 0.24),
      maxFrameHeight: Math.min(roofDiameter * 0.36, availableHeight * 0.6),
      ropeLengths: [availableHeight * 0.34, availableHeight * 0.43],
      backAngle: Math.atan2(
        this.cameraStart.x - roofCenter.x,
        this.cameraStart.z - roofCenter.z,
      ) + Math.PI,
    });
  }

  addGrounding() {
    if (this.grounding || !this.structure || this.structure.baseBox.isEmpty()) return;
    const overallSize = this.structure.overallBox.getSize(new THREE.Vector3());
    const groundY = this.structure.baseBox.min.y - 0.03;
    const group = new THREE.Group();
    group.name = "CarouselGrounding";

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(overallSize.x * 6, overallSize.z * 6),
      new THREE.MeshBasicMaterial({
        map: createGroundFadeTexture(),
        color: "#ffffff",
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ground.name = "SoftGroundPlane";
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = groundY;
    group.add(ground);

    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(overallSize.x * 1.6, overallSize.z * 1.6),
      new THREE.MeshBasicMaterial({
        map: createContactShadowTexture(),
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    contactShadow.name = "CarouselContactShadow";
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = groundY + 0.006;
    group.add(contactShadow);

    this.scene.add(group);
    this.grounding = group;
  }

  addLighting() {
    this.scene.add(new THREE.HemisphereLight("#fff8ea", "#b7d9ee", 1.8));

    const key = new THREE.DirectionalLight("#fff5de", 2.1);
    key.position.set(-3.6, 6.4, 6.2);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight("#d7efff", 0.85);
    fill.position.set(4, 3, 5);
    this.scene.add(fill);

    const warmCenter = new THREE.PointLight("#fff1c7", 1.2, 8, 2.0);
    warmCenter.position.set(0, 3.7, 2.2);
    this.scene.add(warmCenter);
  }

  setProgress(state) {
    this.progress = state.progress;
    this.rotationProgress = state.rotationProgress;
    this.focusProgress = state.focusProgress;
    this.transitionProgress = state.transitionProgress;
    this.applyTimeline();
  }

  applyTimeline() {
    this.targetRotation = this.rotationProgress * Math.PI * 2 * this.rotationTurns;
    this.camera.position.copy(this.cameraStart);
    this.camera.lookAt(this.lookStart);

    this.renderer.toneMappingExposure = lerp(0.95, 1.45, this.transitionProgress);

    if (this.flashElement) {
      this.flashElement.style.opacity = String(this.transitionProgress);
    }
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.modelLoaded) {
      this.frameCameraToCarousel();
      this.configurePhotoRig();
      this.applyTimeline();
    }
    this.photoSpiral.resize();
  }

  render() {
    const delta = this.targetRotation - this.carousel.rotationPivot.rotation.y;
    const appliedRotation = delta * 0.115;
    this.carousel.rotationPivot.rotation.y += appliedRotation;
    this.photoSpiral.update(
      this.carousel.rotationPivot.rotation.y,
      appliedRotation,
      performance.now() * 0.001,
    );
    this.renderer.render(this.scene, this.camera);
  }

  getPhotoSequencePosition() {
    return this.photoSpiral.getSequencePosition(this.targetRotation);
  }
}

function collectNamedBounds(root, prefixes) {
  const bounds = new THREE.Box3();
  let found = false;
  root.traverse((object) => {
    if (!object.isMesh || !prefixes.some((prefix) => object.name.startsWith(prefix))) return;
    bounds.union(new THREE.Box3().setFromObject(object));
    found = true;
  });
  return found ? bounds : new THREE.Box3();
}

function createStars() {
  const group = new THREE.Group();
  const material = new THREE.SpriteMaterial({
    map: createHaloTexture(),
    color: "#ffffff",
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });

  for (let i = 0; i < 34; i += 1) {
    const star = new THREE.Sprite(material.clone());
    star.position.set((Math.random() - 0.5) * 15, 3 + Math.random() * 5, -5 - Math.random() * 10);
    star.scale.setScalar(0.05 + Math.random() * 0.08);
    group.add(star);
  }
  return group;
}

function createMist() {
  const group = new THREE.Group();
  const material = new THREE.SpriteMaterial({
    map: createMistTexture(),
    color: "#ffffff",
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });

  for (let i = 0; i < 7; i += 1) {
    const mist = new THREE.Sprite(material.clone());
    mist.position.set((Math.random() - 0.5) * 9, 0.8 + Math.random() * 3.8, -3 - Math.random() * 8);
    mist.scale.set(3.5 + Math.random() * 4, 0.8 + Math.random() * 0.9, 1);
    group.add(mist);
  }
  return group;
}

function createDreamGradientTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#d9f3ff");
  gradient.addColorStop(0.48, "#eefaff");
  gradient.addColorStop(1, "#c8e8f7");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createHaloTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 255, 238, 0.96)");
  gradient.addColorStop(0.35, "rgba(255, 239, 190, 0.36)");
  gradient.addColorStop(1, "rgba(255, 239, 190, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createContactShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(256, 256, 18, 256, 256, 250);
  gradient.addColorStop(0, "rgba(70, 91, 112, 0.34)");
  gradient.addColorStop(0.28, "rgba(89, 111, 132, 0.2)");
  gradient.addColorStop(0.62, "rgba(109, 132, 151, 0.07)");
  gradient.addColorStop(1, "rgba(125, 148, 165, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGroundFadeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(256, 256, 24, 256, 256, 256);
  gradient.addColorStop(0, "rgba(226, 237, 240, 0.88)");
  gradient.addColorStop(0.46, "rgba(224, 237, 241, 0.62)");
  gradient.addColorStop(0.78, "rgba(220, 235, 240, 0.2)");
  gradient.addColorStop(1, "rgba(217, 243, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMistTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 48, 0, 128, 48, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0.46)");
  gradient.addColorStop(0.55, "rgba(238,250,255,0.18)");
  gradient.addColorStop(1, "rgba(238,250,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
