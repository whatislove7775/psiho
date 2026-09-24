/* TEMPORARY STUB — the full renderer replaces this file. API is final. */
import * as THREE from "three";
import type { AvatarConfig } from "../schema";
import type { AvatarRendererApi, FaceResult, Framing, RendererOptions } from "./types";

export class AvatarRenderer implements AvatarRendererApi {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(22, 1, 0.1, 50);
  private head: THREE.Mesh;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
    this.head = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ color: "#EDB98D" }));
    this.scene.add(this.head, new THREE.HemisphereLight("#fff", "#444", 2));
    this.camera.position.set(0, 0, 7);
  }
  setConfig(cfg: AvatarConfig) {
    (this.head.material as THREE.MeshStandardMaterial).color.set(cfg.skin.tone);
  }
  applyFaceResult(_r: FaceResult | null | undefined) {}
  setExpression(_w: Record<string, number>) {}
  setIdle(_e: boolean) {}
  setFraming(_f: Framing) {}
  lookAt(_y: number, _p: number) {}
  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  renderOnce() {
    this.renderer.render(this.scene, this.camera);
  }
  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.renderOnce();
    };
    loop();
  }
  stop() {
    cancelAnimationFrame(this.raf);
  }
  captureStream(fps = 30) {
    return this.canvas.captureStream(fps);
  }
  dispose() {
    this.stop();
    this.renderer.dispose();
  }
}
