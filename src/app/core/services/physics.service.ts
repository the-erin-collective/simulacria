import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { 
  Scene,
  Vector3 as BVector3, 
  AbstractMesh, 
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeType,
  PhysicsAggregate,
  HavokPlugin,
  Ray
} from '@babylonjs/core';
import HavokPhysics from "@babylonjs/havok";
import { Vector3 } from '../../shared/models/block.model';

@Injectable({
  providedIn: 'root'
})
export class PhysicsService {
  private havokPlugin!: HavokPlugin;
  private scene!: Scene;
  private playerBody!: PhysicsAggregate;
  private playerMesh!: AbstractMesh;
  private blockBodies = new Map<string, PhysicsAggregate>();
  private isBrowser: boolean;
  
  // Player physics properties
  private jumpForce = 8;
  private movementSpeed = 5;
  private isGrounded = false;
  private playerHeight = 1.8;
  private playerRadius = 0.3;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  async initializePhysics(scene: Scene): Promise<void> {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      console.warn('Physics initialization skipped in server environment');
      return;
    }
    
    this.scene = scene;
    
    try {
      // Import and initialize Havok physics module
      const havokInstance = await HavokPhysics();
      
      // Initialize Havok plugin
      this.havokPlugin = new HavokPlugin(true, havokInstance);
      
      // Enable physics in the scene
      scene.enablePhysics(new BVector3(0, -9.81, 0), this.havokPlugin);
      
      // Create player physics body
      this.createPlayerPhysicsBody();
      
      console.log('Havok physics initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Havok physics:', error);
      throw error;
    }
  }

  private createPlayerPhysicsBody(): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
    // Create invisible player capsule mesh
    this.playerMesh = MeshBuilder.CreateCapsule('player', { 
      height: this.playerHeight, 
      radius: this.playerRadius 
    }, this.scene);
    this.playerMesh.isVisible = false;
    
    // Position player at starting location
    this.playerMesh.position = new BVector3(0, 10, 5);
    
    // Create physics aggregate for player
    this.playerBody = new PhysicsAggregate(
      this.playerMesh,
      PhysicsShapeType.CAPSULE,
      { mass: 70, restitution: 0.1, friction: 0.1 },
      this.scene
    );
    
    // Prevent rotation around X and Z axes (keep upright) 
    // Note: setAngularFactor is not available in current Havok implementation
    // The physics body should maintain upright position naturally with proper settings
    
    // Set motion type to dynamic
    this.playerBody.body.setMotionType(PhysicsMotionType.DYNAMIC);
    
    console.log('Player physics body created');
  }

  addBlockPhysics(position: Vector3, key: string): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
    // Create block physics body
    const blockMesh = MeshBuilder.CreateBox(`physics_block_${key}`, { size: 1 }, this.scene);
    blockMesh.position = new BVector3(position.x, position.y, position.z);
    blockMesh.isVisible = false; // Invisible physics body
    
    const blockAggregate = new PhysicsAggregate(
      blockMesh,
      PhysicsShapeType.BOX,
      { mass: 0 }, // Static block
      this.scene
    );
    
    blockAggregate.body.setMotionType(PhysicsMotionType.STATIC);
    this.blockBodies.set(key, blockAggregate);
  }

  removeBlockPhysics(key: string): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
    const blockBody = this.blockBodies.get(key);
    if (blockBody) {
      blockBody.dispose();
      this.blockBodies.delete(key);
    }
  }

  updateBlocksPhysics(blockPositions: Map<string, Vector3>): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
    // Remove physics bodies that no longer exist
    for (const [key] of this.blockBodies) {
      if (!blockPositions.has(key)) {
        this.removeBlockPhysics(key);
      }
    }
    
    // Add physics bodies for new blocks
    for (const [key, position] of blockPositions) {
      if (!this.blockBodies.has(key)) {
        this.addBlockPhysics(position, key);
      }
    }
  }

  applyPlayerMovement(moveDirection: BVector3, jump: boolean): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser || !this.playerBody) {
      return;
    }
    
    // Get current velocity
    const velocity = this.playerBody.body.getLinearVelocity();
    
    // Apply horizontal movement
    const horizontalMove = new BVector3(
      moveDirection.x * this.movementSpeed,
      velocity.y, // Preserve vertical velocity
      moveDirection.z * this.movementSpeed
    );
    
    // Check if grounded for jumping
    this.checkGrounded();
    
    // Apply jump if grounded
    if (jump && this.isGrounded) {
      horizontalMove.y = this.jumpForce;
      this.isGrounded = false;
    }
    
    // Apply the new velocity
    this.playerBody.body.setLinearVelocity(horizontalMove);
  }

  getPlayerPosition(): Vector3 {
    // Return default position if not in browser or player mesh not available
    if (!this.isBrowser || !this.playerMesh) {
      return { x: 0, y: 0, z: 0 };
    }
    
    return {
      x: this.playerMesh.position.x,
      y: this.playerMesh.position.y + this.playerHeight / 2, // Camera at head level
      z: this.playerMesh.position.z
    };
  }

  setPlayerPosition(position: Vector3): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser || !this.playerMesh) {
      return;
    }
    
    this.playerMesh.position = new BVector3(position.x, position.y - this.playerHeight / 2, position.z);
  }

  private checkGrounded(): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser || !this.playerMesh || !this.scene) {
      return;
    }
    
    // Cast a ray downward from player to check if grounded
    const rayStart = this.playerMesh.position.clone();
    rayStart.y -= this.playerHeight / 2; // Start from bottom of player
    
    const rayDirection = new BVector3(0, -1, 0);
    const rayLength = 0.2;
    
    // Create a ray
    const ray = new Ray(rayStart, rayDirection, rayLength);
    
    // Perform ray cast using scene.pickWithRay
    const hit = this.scene.pickWithRay(ray, (mesh) => {
      // Check if ray hits any physics block mesh (not the physics bodies, but the visible meshes)
      return mesh.name.startsWith('physics_block_');
    });
    
    this.isGrounded = hit?.hit || false;
  }

  isPlayerGrounded(): boolean {
    // Return false if not in browser (during SSR)
    if (!this.isBrowser) {
      return false;
    }
    
    return this.isGrounded;
  }

  dispose(): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
    // Clean up all physics bodies
    if (this.playerBody) {
      this.playerBody.dispose();
    }
    
    for (const [key, blockBody] of this.blockBodies) {
      blockBody.dispose();
    }
    this.blockBodies.clear();
    
    // Dispose physics plugin
    if (this.havokPlugin) {
      this.havokPlugin.dispose();
    }
  }
}
