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
  AbstractMesh
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
  private masterCube!: Mesh;
  private materials = new Map<BlockType, StandardMaterial>();

  constructor() {}

  async initializeEngine(canvas: ElementRef<HTMLCanvasElement>): Promise<void> {
    // Create engine
    this.engine = new Engine(canvas.nativeElement, true);
    
    // Create scene
    this.scene = new Scene(this.engine);
    // this.scene.actionManager = null;
    
    // Setup camera (first-person)
    this.setupCamera();
    
    // Setup lighting
    this.setupLighting();
    
    // Setup materials
    this.setupMaterials();
    
    // Create master cube for instancing
    this.createMasterCube();
    
    // Start render loop
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
    
    // Handle resize
    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  private setupCamera(): void {
    this.camera = new UniversalCamera('camera', new BVector3(0, 0, 5), this.scene);
    this.camera.setTarget(BVector3.Zero());
    
    // WASD movement
    this.camera.keysUp.push(87); // W
    this.camera.keysDown.push(83); // S
    this.camera.keysLeft.push(65); // A
    this.camera.keysRight.push(68); // D
    
    // Speed settings
    this.camera.speed = 0.5;
    this.camera.angularSensibility = 2000;
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

  private createMasterCube(): void {
    this.masterCube = MeshBuilder.CreateBox('masterCube', { size: 1 }, this.scene);
    this.masterCube.isVisible = false; // Hidden master for instancing
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

      const blockMesh = this.masterCube.createInstance(`block_${key}`);
      blockMesh.position = new BVector3(
        block.position.x,
        block.position.y,
        block.position.z
      );

      const material = this.materials.get(block.metadata.blockType);
      if (material) {
        blockMesh.material = material;
      }

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

    const blockMesh = this.masterCube.createInstance(`block_${key}`);
    blockMesh.position = new BVector3(position.x, position.y, position.z);
    
    const material = this.materials.get(blockType);
    if (material) {
      blockMesh.material = material;
    }
    
    this.blockMeshes.set(key, blockMesh);
  }

  dispose(): void {
    if (this.engine) {
      this.engine.dispose();
    }
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
}
