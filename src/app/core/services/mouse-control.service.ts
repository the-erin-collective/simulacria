import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { UniversalCamera } from '@babylonjs/core';

@Injectable({
  providedIn: 'root'
})
export class MouseControlService {
  private camera?: UniversalCamera;
  private canvas?: HTMLCanvasElement;
  private isPointerLocked = false;
  private mouseSensitivity = 0.002;
  private invertMouseY = false; // Default to NON-inverted
  private minVerticalAngle = -Math.PI / 2 + 0.1;
  private maxVerticalAngle = Math.PI / 2 - 0.1;
  private boundMouseMoveHandler: (event: MouseEvent) => void;
  private boundPointerLockChangeHandler: () => void;
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    // Bind event handlers to maintain proper 'this' context
    this.boundMouseMoveHandler = this.handleMouseMovement.bind(this);
    this.boundPointerLockChangeHandler = this.handlePointerLockChange.bind(this);
  }

  initialize(camera: UniversalCamera, canvas: HTMLCanvasElement): void {
    this.camera = camera;
    this.canvas = canvas;
    
    // First remove any existing event listeners
    this.cleanup();
    
    // Remove BabylonJS default mouse controls to avoid conflicts
    this.camera.inputs.removeByType('FreeCameraMouseInput');
    this.camera.inputs.removeByType('FreeCameraTouchInput');
    
    // Then set up the new controls
    this.setupMouseControls();
    
    console.log('Mouse control service initialized with camera and canvas');
  }

  private setupMouseControls(): void {
    if (!this.canvas || !this.camera) {
      console.error('Cannot setup mouse controls: canvas or camera is missing');
      return;
    }

    // Request pointer lock on canvas click
    this.canvas.addEventListener('click', () => {
      console.log('Canvas clicked, requesting pointer lock');
      this.requestPointerLock();
    });

    // Add event listeners with bound handlers
    document.addEventListener('pointerlockchange', this.boundPointerLockChangeHandler);
    document.addEventListener('mousemove', this.boundMouseMoveHandler);
    
    // Set initial cursor style
    this.canvas.style.cursor = 'crosshair';
    
    console.log('Mouse controls setup complete');
  }

  private handlePointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
    
    if (this.isPointerLocked) {
      this.canvas!.style.cursor = 'none';
      console.log('Pointer lock acquired');
    } else {
      this.canvas!.style.cursor = 'crosshair';
      console.log('Pointer lock released');
    }
  }

  private cleanup(): void {
    // Only run cleanup on browser, not during SSR
    if (!this.isBrowser) {
      return;
    }
    
    // Clean up any existing event listeners
    document.removeEventListener('mousemove', this.boundMouseMoveHandler);
    document.removeEventListener('pointerlockchange', this.boundPointerLockChangeHandler);
    
    if (this.canvas) {
      // Remove click listeners (we'll add a new one)
      this.canvas.removeEventListener('click', this.requestPointerLock);
      
      // Reset cursor
      this.canvas.style.cursor = 'default';
    }
  }
  
  requestPointerLock(): void {
    if (!this.canvas) {
      console.error('Cannot request pointer lock: canvas is missing');
      return;
    }
    
    try {
      this.canvas.requestPointerLock();
      console.log('Requesting pointer lock');
    } catch (error) {
      console.error('Error requesting pointer lock:', error);
    }
  }

  exitPointerLock(): void {
    // Only run on browser, not during SSR
    if (!this.isBrowser) {
      return;
    }
    
    if (document.pointerLockElement) {
      document.exitPointerLock();
      console.log('Exiting pointer lock');
    }
  }

  private handleMouseMovement(event: MouseEvent): void {
    if (!this.isPointerLocked || !this.camera) return;

    // Apply mouse sensitivity
    const deltaX = event.movementX * this.mouseSensitivity;
    const deltaY = event.movementY * this.mouseSensitivity;

    // Update camera rotation
    this.camera.rotation.y += deltaX; // Horizontal (yaw)
    
    // Vertical (pitch) - apply inversion setting
    if (this.invertMouseY) {
      this.camera.rotation.x += deltaY; // Inverted
    } else {
      this.camera.rotation.x -= deltaY; // Non-inverted (natural feel)
    }

    // Clamp vertical rotation to prevent over-rotation
    this.camera.rotation.x = Math.max(
      this.minVerticalAngle,
      Math.min(this.maxVerticalAngle, this.camera.rotation.x)
    );

    // Normalize horizontal rotation (optional, prevents accumulation)
    if (this.camera.rotation.y > Math.PI * 2) {
      this.camera.rotation.y -= Math.PI * 2;
    }
    if (this.camera.rotation.y < 0) {
      this.camera.rotation.y += Math.PI * 2;
    }
  }

  setMouseSensitivity(sensitivity: number): void {
    this.mouseSensitivity = Math.max(0.0001, Math.min(0.01, sensitivity));
    console.log('Mouse sensitivity set to:', this.mouseSensitivity);
  }

  getMouseSensitivity(): number {
    return this.mouseSensitivity;
  }

  setMouseYInversion(invert: boolean): void {
    this.invertMouseY = invert;
    console.log('Mouse Y-axis inversion set to:', this.invertMouseY);
  }

  getMouseYInversion(): boolean {
    return this.invertMouseY;
  }

  isMouseLocked(): boolean {
    return this.isPointerLocked;
  }

  dispose(): void {
    this.cleanup();
    console.log('Mouse control service disposed');
  }
}
