import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function useWebGLCleanup() {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const geometriesRef = useRef<THREE.BufferGeometry[]>([]);
  const materialsRef = useRef<THREE.Material[]>([]);
  const texturesRef = useRef<THREE.Texture[]>([]);

  const registerGeometry = (geometry: THREE.BufferGeometry) => {
    geometriesRef.current.push(geometry);
  };

  const registerMaterial = (material: THREE.Material) => {
    materialsRef.current.push(material);
  };

  const registerTexture = (texture: THREE.Texture) => {
    texturesRef.current.push(texture);
  };

  const cleanup = () => {
    // Dispose geometries
    geometriesRef.current.forEach(geometry => {
      geometry.dispose();
    });
    geometriesRef.current = [];

    // Dispose materials
    materialsRef.current.forEach(material => {
      if (Array.isArray(material)) {
        material.forEach(m => m.dispose());
      } else {
        material.dispose();
      }
    });
    materialsRef.current = [];

    // Dispose textures
    texturesRef.current.forEach(texture => {
      texture.dispose();
    });
    texturesRef.current = [];

    // Clean up scene
    if (sceneRef.current) {
      sceneRef.current.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) {
            object.geometry.dispose();
          }
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
      
      // Clear scene
      while (sceneRef.current.children.length > 0) {
        sceneRef.current.remove(sceneRef.current.children[0]);
      }
    }

    // Dispose renderer
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current.forceContextLoss();
      rendererRef.current = null;
    }
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      cleanup();
    };
  }, []);

  return {
    sceneRef,
    rendererRef,
    registerGeometry,
    registerMaterial,
    registerTexture,
    cleanup,
  };
}