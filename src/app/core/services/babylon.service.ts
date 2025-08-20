import { Injectable, ElementRef } from '@angular/core';
import { 
  Engine, 
  Scene, 
  ArcRotateCamera, 
  HemisphericLight, 
  Vector3 as BVector3, 
  MeshBuilder, 
  StandardMaterial, 
  Color3, 
  Mesh,
  InstancedMesh,
  FreeCamera,
  UniversalCamera,
  Ray,
  RayHelper,
  PickingInfo,
  AbstractMesh,
  KeyboardEventTypes,
  PointerEventTypes
} from '@babylonjs/core';
import { Block, BlockType, Vector3 } from '../../shared/models/block.model';
import '@babylonjs/loaders';

@Injectable({
  providedIn: 'root'
})
export class BabylonService {
  private engine!: Engine;
  private scene!: Scene;
  private camera!: UniversalCamera;
  private light!: HemisphericLight;
  private blockMeshes = new Map<string, AbstractMesh>();
  private masterMeshes = new Map<BlockType, Mesh>();
  private materials = new Map<BlockType, StandardMaterial>();
  private inputDirection = new BVector3(0, 0, 0);
  private moveSpeed = 0.1;
  private mouseSensitivity = 0.002;

  constructor() {}

  async initializeEngine(canvas: ElementRef<HTMLCanvasElement>): Promise<void> {
    // Create engine
    this.engine = new Engine(canvas.nativeElement, true);
    
    // Create scene
    this.scene = new Scene(this.engine);
    // this.scene.actionManager = null;
    
    // Setup camera (first-person)
    this.setupCamera();
    
    // Attach camera controls to canvas
    this.attachCameraControls(canvas.nativeElement);
    
    // Setup lighting
    this.setupLighting();
    
    // Setup materials
    this.setupMaterials();
    
    // Create master meshes for each block type
    this.createMasterMeshes();
    
    // Start render loop
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
    
    // Handle resize
    window.addEventListener('resize', () => {
      this.engine.resize();
    });
    
    console.log('BabylonJS engine initialized successfully');
  }

  private setupCamera(): void {
    this.camera = new UniversalCamera('camera', new BVector3(0, 0, 5), this.scene);
    this.camera.setTarget(BVector3.Zero());
    
    // Remove default BabylonJS input controls to avoid conflicts
    this.camera.inputs.clear();
    
    // Speed settings
    this.camera.speed = 0.2;
    this.camera.angularSensibility = 2000;
    
    console.log('Camera setup complete with custom controls');
  }
  
  private attachCameraControls(canvas: HTMLCanvasElement): void {
    // Setup custom input handling using BabylonJS observables (like the playground example)
    this.setupKeyboardControls();
    this.setupMouseControls();
    
    console.log('Custom camera controls attached');
  }

  private setupLighting(): void {
    this.light = new HemisphericLight('light', new BVector3(0, 1, 0), this.scene);
    this.light.intensity = 0.7;
  }

  private setupMaterials(): void {
    // Air (transparent)
    const airMaterial = new StandardMaterial('air', this.scene);
    airMaterial.alpha = 0;
    this.materials.set(BlockType.AIR, airMaterial);

    // Dirt (brown)
    const dirtMaterial = new StandardMaterial('dirt', this.scene);
    dirtMaterial.diffuseColor = new Color3(0.6, 0.4, 0.2);
    this.materials.set(BlockType.DIRT, dirtMaterial);

    // Stone (gray)
    const stoneMaterial = new StandardMaterial('stone', this.scene);
    stoneMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
    this.materials.set(BlockType.STONE, stoneMaterial);

    // Sand (light yellow)
    const sandMaterial = new StandardMaterial('sand', this.scene);
    sandMaterial.diffuseColor = new Color3(0.9, 0.8, 0.6);
    this.materials.set(BlockType.SAND, sandMaterial);

    // Water (blue, translucent)
    const waterMaterial = new StandardMaterial('water', this.scene);
    waterMaterial.diffuseColor = new Color3(0.2, 0.4, 0.8);
    waterMaterial.alpha = 0.7;
    this.materials.set(BlockType.WATER, waterMaterial);

    // Wood (brown)
    const woodMaterial = new StandardMaterial('wood', this.scene);
    woodMaterial.diffuseColor = new Color3(0.4, 0.2, 0.1);
    this.materials.set(BlockType.WOOD, woodMaterial);

    // Leaves (green)
    const leavesMaterial = new StandardMaterial('leaves', this.scene);
    leavesMaterial.diffuseColor = new Color3(0.2, 0.6, 0.2);
    this.materials.set(BlockType.LEAVES, leavesMaterial);
  }

  private createMasterMeshes(): void {
    // Create a master mesh for each block type with its material
    for (const [blockType, material] of this.materials) {
      if (blockType === BlockType.AIR) continue; // Skip air blocks
      
      const masterMesh = MeshBuilder.CreateBox(`master_${blockType}`, { size: 1 }, this.scene);
      masterMesh.material = material;
      masterMesh.isVisible = false; // Hidden master for instancing
      this.masterMeshes.set(blockType, masterMesh);
    }
  }

  updateWorldBlocks(blocks: Map<string, Block>): void {
    // Clear existing blocks
    for (const [key, mesh] of this.blockMeshes) {
      mesh.dispose();
    }
    this.blockMeshes.clear();

    // Create new block meshes
    for (const [key, block] of blocks) {
      if (block.metadata.blockType === BlockType.AIR) {
        continue; // Skip air blocks
      }

      const masterMesh = this.masterMeshes.get(block.metadata.blockType);
      if (!masterMesh) {
        console.warn(`No master mesh found for block type: ${block.metadata.blockType}`);
        continue;
      }
      
      // Create instance from master mesh (material is inherited automatically)
      const blockMesh = masterMesh.createInstance(`block_${key}`);
      blockMesh.position = new BVector3(
        block.position.x,
        block.position.y,
        block.position.z
      );
      
      // IMPORTANT: Do NOT set material on instances - they inherit from master
      // Setting material on instances will cause "Setting material on an instanced mesh" warnings

      this.blockMeshes.set(key, blockMesh);
    }
  }

  updatePlayerPosition(position: Vector3, rotation?: Vector3): void {
    if (this.camera) {
      this.camera.position = new BVector3(position.x, position.y, position.z);
      
      if (rotation) {
        this.camera.rotation = new BVector3(rotation.x, rotation.y, rotation.z);
      }
    }
  }

  getCameraPosition(): Vector3 {
    if (this.camera) {
      return {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      };
    }
    return { x: 0, y: 0, z: 0 };
  }

  getCameraRotation(): Vector3 {
    if (this.camera) {
      return {
        x: this.camera.rotation.x,
        y: this.camera.rotation.y,
        z: this.camera.rotation.z
      };
    }
    return { x: 0, y: 0, z: 0 };
  }

  getTargetedBlock(): Vector3 | null {
    if (!this.camera) return null;

    const forward = this.camera.getForwardRay();
    const ray = new Ray(this.camera.position, forward.direction);
    const pickInfo = this.scene.pickWithRay(ray, (mesh) => {
      return this.blockMeshes.has(mesh.name.replace('block_', ''));
    });

    if (pickInfo?.hit && pickInfo.pickedMesh) {
      const meshName = pickInfo.pickedMesh.name.replace('block_', '');
      const [x, y, z] = meshName.split(',').map(Number);
      return { x, y, z };
    }

    return null;
  }

  highlightBlock(position: Vector3 | null): void {
    // Remove previous highlights
    this.blockMeshes.forEach((mesh) => {
      if ('renderOutline' in mesh) {
        (mesh as any).renderOutline = false;
      }
    });

    if (position) {
      const key = `${position.x},${position.y},${position.z}`;
      const blockMesh = this.blockMeshes.get(key);
      if (blockMesh && 'renderOutline' in blockMesh) {
        (blockMesh as any).renderOutline = true;
        (blockMesh as any).outlineColor = Color3.White();
        (blockMesh as any).outlineWidth = 0.1;
      }
    }
  }

  removeBlock(position: Vector3): void {
    const key = `${position.x},${position.y},${position.z}`;
    const blockMesh = this.blockMeshes.get(key);
    if (blockMesh) {
      blockMesh.dispose();
      this.blockMeshes.delete(key);
    }
  }

  addBlock(position: Vector3, blockType: BlockType): void {
    const key = `${position.x},${position.y},${position.z}`;
    
    if (blockType === BlockType.AIR) {
      this.removeBlock(position);
      return;
    }

    const masterMesh = this.masterMeshes.get(blockType);
    if (!masterMesh) {
      console.warn(`No master mesh found for block type: ${blockType}`);
      return;
    }
    
    // Create instance from master mesh (material is inherited automatically)
    const blockMesh = masterMesh.createInstance(`block_${key}`);
    blockMesh.position = new BVector3(position.x, position.y, position.z);
    
    // IMPORTANT: Do NOT set material on instances - they inherit from master
    
    this.blockMeshes.set(key, blockMesh);
  }

  dispose(): void {
    if (this.engine) {
      this.engine.dispose();
    }
  }
  
  setMouseSensitivity(sensitivity: number): void {
    this.mouseSensitivity = Math.max(0.0001, Math.min(0.01, sensitivity));
    console.log('Mouse sensitivity updated to:', this.mouseSensitivity);
  }
  
  getMouseSensitivity(): number {
    return this.mouseSensitivity;
  }

  getCamera(): UniversalCamera {
    return this.camera;
  }

  getEngine(): Engine {
    return this.engine;
  }

  getScene(): Scene {
    return this.scene;
  }

  getRenderedBlocksCount(): number {
    return this.blockMeshes.size;
  }
  
  private setupKeyboardControls(): void {
    // Keyboard input handling based on playground example
    this.scene.onKeyboardObservable.add((kbInfo) => {
      switch (kbInfo.type) {
        case KeyboardEventTypes.KEYDOWN:
          if (kbInfo.event.key === 'w' || kbInfo.event.key === 'W' || kbInfo.event.key === 'ArrowUp') {
            this.inputDirection.z = 1;
          } else if (kbInfo.event.key === 's' || kbInfo.event.key === 'S' || kbInfo.event.key === 'ArrowDown') {
            this.inputDirection.z = -1;
          } else if (kbInfo.event.key === 'a' || kbInfo.event.key === 'A' || kbInfo.event.key === 'ArrowLeft') {
            this.inputDirection.x = -1;
          } else if (kbInfo.event.key === 'd' || kbInfo.event.key === 'D' || kbInfo.event.key === 'ArrowRight') {
            this.inputDirection.x = 1;
          }
          break;
        case KeyboardEventTypes.KEYUP:
          if (kbInfo.event.key === 'w' || kbInfo.event.key === 'W' || kbInfo.event.key === 's' || kbInfo.event.key === 'S' || 
              kbInfo.event.key === 'ArrowUp' || kbInfo.event.key === 'ArrowDown') {
            this.inputDirection.z = 0;
          }
          if (kbInfo.event.key === 'a' || kbInfo.event.key === 'A' || kbInfo.event.key === 'd' || kbInfo.event.key === 'D' || 
              kbInfo.event.key === 'ArrowLeft' || kbInfo.event.key === 'ArrowRight') {
            this.inputDirection.x = 0;
          }
          break;
      }
    });
    
    // Movement update in render loop
    this.scene.onBeforeRenderObservable.add(() => {
      this.updateCameraMovement();
    });
    
    console.log('Keyboard controls setup complete');
  }
  
  private setupMouseControls(): void {
    // Mouse input handling for camera rotation with pointer lock support
    let isMouseDown = false;
    
    this.scene.onPointerObservable.add((pointerInfo) => {
      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          if (pointerInfo.event.button === 0) { // Left mouse button
            isMouseDown = true;
            // Request pointer lock on first click
            if (document.pointerLockElement !== this.engine.getRenderingCanvas()) {
              this.engine.getRenderingCanvas()?.requestPointerLock();
            }
          }
          break;

        case PointerEventTypes.POINTERUP:
          if (pointerInfo.event.button === 0) {
            isMouseDown = false;
          }
          break;

        case PointerEventTypes.POINTERMOVE:
          // Use pointer lock movement if available, otherwise use drag movement
          const movementX = pointerInfo.event.movementX || 0;
          const movementY = pointerInfo.event.movementY || 0;
          
          if (document.pointerLockElement === this.engine.getRenderingCanvas() || isMouseDown) {
            // Apply mouse movement to camera rotation
            this.camera.rotation.y += movementX * this.mouseSensitivity;
            this.camera.rotation.x -= movementY * this.mouseSensitivity;
            
            // Clamp vertical rotation
            this.camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.camera.rotation.x));
          }
          break;
      }
    });
    
    console.log('Mouse controls setup complete with pointer lock support');
  }
  
  private updateCameraMovement(): void {
    if (this.inputDirection.length() > 0) {
      // Calculate movement direction relative to camera rotation
      const forward = this.camera.getDirection(new BVector3(0, 0, 1));
      const right = this.camera.getDirection(new BVector3(1, 0, 0));
      
      // Calculate movement vector
      const movement = new BVector3(0, 0, 0);
      movement.addInPlace(forward.scale(this.inputDirection.z * this.moveSpeed));
      movement.addInPlace(right.scale(this.inputDirection.x * this.moveSpeed));
      
      // Apply movement to camera position
      this.camera.position.addInPlace(movement);
    }
  }
}
