import * as THREE from "three";
import {
  TAU,
  getSequencePosition,
  getSlotPhotoIndex,
  positiveModulo,
} from "./photoSlotSequence.js";

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const DEFAULT_SLOT_COUNT = 8;

export class PhotoSpiral {
  constructor({
    parent,
    camera,
    canvas,
    photos,
    onSelect,
    onLoadProgress,
    onReady,
    slotCount = DEFAULT_SLOT_COUNT,
  }) {
    this.parent = parent;
    this.camera = camera;
    this.canvas = canvas;
    this.photos = photos;
    this.onSelect = onSelect;
    this.slotCount = Math.min(slotCount, photos.length);
    this.rotation = 0;
    this.windStrength = 0;
    this.targetWindStrength = 0;
    this.textureCache = new Map();
    this.geometry = {
      center: new THREE.Vector3(),
      anchorRadius: 2.3,
      anchorY: 5.3,
      frameWidth: 0.76,
      maxFrameHeight: 1.4,
      ropeLengths: [1.24, 1.55],
      backAngle: Math.PI,
    };
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.group = new THREE.Group();
    this.group.name = "CarouselPhotoHangingRig";
    parent.add(this.group);

    this.slots = Array.from({ length: this.slotCount }, (_, index) => this.createSlot(index));
    this.handlePointerUp = (event) => this.selectAtPointer(event);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    this.preloadInitialSlots(onLoadProgress).then(onReady);
  }

  createSlot(index) {
    const anchor = new THREE.Group();
    anchor.name = `PhotoAnchor_${index + 1}`;
    this.group.add(anchor);

    const pendulum = new THREE.Group();
    pendulum.name = `PhotoPendulum_${index + 1}`;
    anchor.add(pendulum);

    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 1, 10),
      new THREE.MeshStandardMaterial({
        color: "#bda875",
        metalness: 0.08,
        roughness: 0.7,
      }),
    );
    rope.name = `PhotoRope_${index + 1}`;
    pendulum.add(rope);

    const photoTop = new THREE.Group();
    photoTop.name = `PhotoTop_${index + 1}`;
    pendulum.add(photoTop);

    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({
        color: "#fff8e8",
        metalness: 0,
        roughness: 0.72,
        side: THREE.DoubleSide,
      }),
    );
    frame.name = `PolaroidFrame_${index + 1}`;
    frame.position.z = -0.012;
    photoTop.add(frame);

    const image = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: "#e9e0d4",
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    image.name = `PhotoImage_${index + 1}`;
    image.position.z = 0.002;
    photoTop.add(image);

    const clipMaterial = new THREE.MeshStandardMaterial({
      color: "#d4b873",
      metalness: 0.46,
      roughness: 0.32,
    });
    const clip = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), clipMaterial);
    clip.name = `PhotoClip_${index + 1}`;
    clip.position.z = 0.035;
    photoTop.add(clip);

    const clipPin = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8), clipMaterial);
    clipPin.name = `PhotoClipPin_${index + 1}`;
    clipPin.position.z = 0.052;
    photoTop.add(clipPin);

    const slot = {
      index,
      anchor,
      pendulum,
      rope,
      photoTop,
      frame,
      image,
      clip,
      clipPin,
      photoIndex: -1,
      requestToken: 0,
      frameHeight: 1,
    };
    this.updateSlotGeometry(slot, 1);
    return slot;
  }

  configure({ center, anchorRadius, anchorY, frameWidth, maxFrameHeight, ropeLengths, backAngle }) {
    this.geometry.center.copy(center);
    this.geometry.anchorRadius = anchorRadius;
    this.geometry.anchorY = anchorY;
    this.geometry.frameWidth = frameWidth;
    this.geometry.maxFrameHeight = maxFrameHeight;
    this.geometry.ropeLengths = ropeLengths;
    this.geometry.backAngle = backAngle;

    for (const slot of this.slots) {
      const angle = slot.index / this.slotCount * TAU;
      const ropeLength = ropeLengths[slot.index % ropeLengths.length];
      slot.anchor.position.set(
        center.x + Math.sin(angle) * anchorRadius,
        anchorY,
        center.z + Math.cos(angle) * anchorRadius,
      );
      slot.anchor.rotation.set(0, angle, 0);
      slot.rope.position.set(0, -ropeLength * 0.5, 0);
      slot.rope.scale.set(1, ropeLength, 1);
      slot.photoTop.position.set(0, -ropeLength, 0);
      this.updateSlotGeometry(slot, slot.aspect ?? 1);
    }
  }

  updateSlotGeometry(slot, aspect) {
    const frameWidth = this.geometry.frameWidth;
    const sideBorder = frameWidth * 0.065;
    const bottomBorder = frameWidth * 0.16;
    const maxImageHeight = Math.max(0.1, this.geometry.maxFrameHeight - sideBorder - bottomBorder);
    let imageWidth = frameWidth - sideBorder * 2;
    let imageHeight = imageWidth / Math.max(0.15, aspect);
    if (imageHeight > maxImageHeight) {
      imageHeight = maxImageHeight;
      imageWidth = imageHeight * aspect;
    }

    const frameHeight = imageHeight + sideBorder + bottomBorder;
    slot.frameHeight = frameHeight;
    slot.frame.scale.set(frameWidth, frameHeight, 1);
    slot.frame.position.y = -frameHeight * 0.5;
    slot.image.scale.set(imageWidth, imageHeight, 1);
    slot.image.position.y = -sideBorder - imageHeight * 0.5;
    slot.clip.scale.set(frameWidth * 0.105, frameWidth * 0.065, frameWidth * 0.035);
    slot.clip.position.y = -frameWidth * 0.025;
    slot.clipPin.scale.setScalar(frameWidth * 0.035);
    slot.clipPin.position.y = -frameWidth * 0.025;
  }

  async preloadInitialSlots(onProgress = () => {}) {
    if (!this.slotCount) {
      onProgress(1);
      return;
    }

    let completed = 0;
    onProgress(0);
    await Promise.all(this.slots.map(async (slot) => {
      await this.assignPhoto(slot, slot.index);
      completed += 1;
      onProgress(completed / this.slotCount);
    }));

    const nearby = new Set();
    for (const slot of this.slots) {
      nearby.add(positiveModulo(slot.index + this.slotCount, this.photos.length));
      nearby.add(positiveModulo(slot.index - this.slotCount, this.photos.length));
    }
    for (const photoIndex of nearby) this.loadTextureAsset(photoIndex);
  }

  loadTextureAsset(photoIndex) {
    if (this.textureCache.has(photoIndex)) return this.textureCache.get(photoIndex);

    const promise = new Promise((resolve) => {
      const source = new Image();
      source.decoding = "async";
      source.onload = () => {
        const aspect = source.naturalWidth / Math.max(1, source.naturalHeight);
        const maxEdge = window.innerWidth < 768 ? 960 : 1280;
        const ratio = Math.min(1, maxEdge / Math.max(source.naturalWidth, source.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(source.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(source.naturalHeight * ratio));
        const context = canvas.getContext("2d", { alpha: false });
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        resolve({ texture, aspect });
      };
      source.onerror = () => resolve({ texture: null, aspect: 1 });
      source.src = this.photos[photoIndex].src;
    });
    this.textureCache.set(photoIndex, promise);
    return promise;
  }

  async assignPhoto(slot, photoIndex) {
    if (photoIndex < 0 || photoIndex === slot.photoIndex) return;
    const requestToken = ++slot.requestToken;
    const asset = await this.loadTextureAsset(photoIndex);
    if (requestToken !== slot.requestToken) return;

    slot.photoIndex = photoIndex;
    slot.aspect = asset.aspect;
    slot.image.userData.photoIndex = photoIndex;
    slot.image.material.map = asset.texture;
    slot.image.material.color.set(asset.texture ? "#ffffff" : "#e7d8c7");
    slot.image.material.needsUpdate = true;
    this.updateSlotGeometry(slot, asset.aspect);
  }

  update(rotation, angularSpeed, time = performance.now() * 0.001) {
    this.rotation = rotation;
    this.targetWindStrength = clamp01(Math.abs(angularSpeed) * 7);
    this.windStrength += (this.targetWindStrength - this.windStrength) * 0.09;
    if (this.targetWindStrength === 0 && this.windStrength < 0.0015) this.windStrength = 0;

    for (const slot of this.slots) {
      const photoIndex = getSlotPhotoIndex({
        slotIndex: slot.index,
        rotation,
        slotCount: this.slotCount,
        photoCount: this.photos.length,
        backAngle: this.geometry.backAngle,
      });
      if (photoIndex !== slot.photoIndex) this.assignPhoto(slot, photoIndex);

      const amplitude = this.windStrength * (0.045 + (slot.index % 3) * 0.008);
      const phase = time * (1.45 + this.windStrength * 1.2) + slot.index * 1.27;
      slot.pendulum.rotation.set(
        Math.cos(phase * 0.82) * amplitude * 0.32,
        0,
        Math.sin(phase) * amplitude,
      );
    }
  }

  getSequencePosition(rotation = this.rotation) {
    return getSequencePosition(rotation, this.slotCount, this.photos.length);
  }

  resize() {
    for (const slot of this.slots) this.updateSlotGeometry(slot, slot.aspect ?? 1);
  }

  selectAtPointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.slots.map((slot) => slot.image), false)[0];
    if (hit) this.onSelect?.(hit.object.userData.photoIndex);
  }
}
