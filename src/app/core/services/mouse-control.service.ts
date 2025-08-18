import { Injectable } from '@angular/core';
import { UniversalCamera } from '@babylonjs/core';

@Injectable({
  providedIn: 'root'
})
export class MouseControlService {
  private camera?: UniversalCamera;
  private canvas?: HTMLCanvasElement;
  private isPointerLocked = false;
  private mouseSensitivity = 0.002;
  private minVerticalAngle = -Math.PI / 2 + 0.1;
  private maxVerticalAngle = Math.PI / 2 - 0.1;
  private boundMouseMoveHandler: (event: MouseEvent) => void;
  private boundPointerLockChangeHandler: () => void;
  private boundKeyDownHandler: (event: KeyboardEvent) => void;

  constructor() {
    // Bind event handlers to maintain proper 'this' context
    this.boundMouseMoveHandler = this.handleMouseMovement.bind(this);
    this.boundPointerLockChangeHandler = this.handlePointerLockChange.bind(this);
    this.boundKeyDownHandler = this.handleKeyDown.bind(this);
  }

  initialize(camera: UniversalCamera, canvas: HTMLCanvasElement): void {
    this.camera = camera;
    this.canvas = canvas;
    
    // First remove any existing event listeners
    this.cleanup();
    
    // Then set up the new controls
    this.setupMouseControls();
    
    console.log('Mouse control service initialized with camera:', camera);
  }

  private setupMouseControls(): void {
    if (!this.canvas || !this.camera) {
      console.error('Cannot setup mouse controls: canvas or camera is missing');
      return;
    }

    // Remove BabylonJS default mouse controls
    this.camera.inputs.removeByType('FreeCameraMouseInput');
    this.camera.inputs.removeByType('FreeCameraTouchInput');

    // Request pointer lock on canvas click
    this.canvas.addEventListener('click', this.requestPointerLock.bind(this));

    // Add event listeners with bound handlers
    document.addEventListener('pointerlockchange', this.boundPointerLockChangeHandler);
    document.addEventListener('mousemove', this.boundMouseMoveHandler);
    document.addEventListener('keydown', this.boundKeyDownHandler);
    
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

  private handleKeyDown(event: KeyboardEvent): void {
    // Only exit pointer lock on ESC if we're handling it here (game should handle ESC for settings)
    if (event.key === 'Escape' && this.isPointerLocked) {
      // Don't exit pointer lock from here anymore
      // This is now handled by the game component
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
    this.camera.rotation.x -= deltaY; // Vertical (pitch) - inverted for natural feel

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

  isMouseLocked(): boolean {
    return this.isPointerLocked;
  }

  private cleanup(): void {
    // Clean up any existing event listeners
    document.removeEventListener('mousemove', this.boundMouseMoveHandler);
    document.removeEventListener('pointerlockchange', this.boundPointerLockChangeHandler);
    document.removeEventListener('keydown', this.boundKeyDownHandler);
    
    if (this.canvas) {
      this.canvas.removeEventListener('click', this.requestPointerLock);
    }
  }

  dispose(): void {
    this.cleanup();
    console.log('Mouse control service disposed');
  }
}
