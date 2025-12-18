import { GLView } from 'expo-gl';
import * as THREE from 'three';

export class ThreeHelper {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      1,
      0.1,
      1000
    );
  }

  async setupRenderer(gl: any, width: number, height: number) {
    // Create WebGL renderer with Expo GL context
    this.renderer = new THREE.WebGLRenderer({
      canvas: {
        width,
        height,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        clientHeight: height,
        clientWidth: width,
        getContext: () => gl,
      } as any,
      context: gl,
    });

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(1);

    // Update camera aspect ratio
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    return this.renderer;
  }

  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.camera;
  }

  getRenderer() {
    return this.renderer;
  }

  render() {
    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}

// Helper function to create AR measurement objects
export function createMeasurementLine(
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: number = 0x00ff00
): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({ color });
  return new THREE.Line(geometry, material);
}

export function createMeasurementPoint(
  position: THREE.Vector3,
  color: number = 0xff0000,
  size: number = 0.05
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(size);
  const material = new THREE.MeshBasicMaterial({ color });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.copy(position);
  return sphere;
}

export function createTextSprite(
  text: string,
  position: THREE.Vector3
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not create canvas context');
  }

  canvas.width = 256;
  canvas.height = 128;

  context.fillStyle = 'rgba(255, 255, 255, 0.9)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.font = 'Bold 40px Arial';
  context.fillStyle = 'rgba(0, 0, 0, 1)';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  
  sprite.position.copy(position);
  sprite.scale.set(0.5, 0.25, 1);
  
  return sprite;
}