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
  Ray,
  PhysicsCharacterController,
  CharacterSupportedState,
  Quaternion
} from '@babylonjs/core';
import HavokPhysics from "@babylonjs/havok";
import { Vector3 } from '../../shared/models/block.model';

@Injectable({
  providedIn: 'root'
})
export class PhysicsService {
  private havokPlugin!: HavokPlugin;
  private scene!: Scene;
  private characterController!: PhysicsCharacterController;
  private displayCapsule!: AbstractMesh;
  private blockBodies = new Map<string, PhysicsAggregate>();
  private isBrowser: boolean;
  
  // Character Controller properties
  private playerHeight = 1.8;
  private playerRadius = 0.6;
  private onGroundSpeed = 8.0;
  private inAirSpeed = 6.0;
  private jumpHeight = 1.5;
  private characterGravity = new BVector3(0, -18, 0);
  
  // Character state
  private state = "IN_AIR";
  private wantJump = false;
  private inputDirection = new BVector3(0, 0, 0);
  private characterOrientation = Quaternion.Identity();
  private forwardLocalSpace = new BVector3(0, 0, 1);

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
    
    console.log('Initializing Havok physics...');
    
    // Initialize Havok physics with proper WASM path configuration
    const havokInstance = await HavokPhysics({
      locateFile: (path: string) => {
        // Use the assets path for WASM files
        if (path.endsWith('.wasm')) {
          return `assets/havok/${path}`;
        }
        return path;
      }
    });
    
    // Initialize Havok plugin
    this.havokPlugin = new HavokPlugin(true, havokInstance);
    
    // Enable physics in the scene with proper gravity
    scene.enablePhysics(new BVector3(0, -9.81, 0), this.havokPlugin);
    
    // Create character controller
    this.createCharacterController();
    
    // Setup physics update loop
    this.setupPhysicsLoop();
    
    console.log('Havok physics initialized successfully');
  }

  private createCharacterController(): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
    // Create display capsule (invisible)
    this.displayCapsule = MeshBuilder.CreateCapsule('player', { 
      height: this.playerHeight, 
      radius: this.playerRadius 
    }, this.scene);
    this.displayCapsule.isVisible = false;
    
    // Initial character position
    const characterPosition = new BVector3(0, 0, 20);
    
    // Create Physics Character Controller
    this.characterController = new PhysicsCharacterController(
      characterPosition, 
      { 
        capsuleHeight: this.playerHeight, 
        capsuleRadius: this.playerRadius 
      }, 
      this.scene
    );
    
    console.log('Character controller created at position (0, 0, 20) - will be repositioned by spawning system');
  }
  
  private setupPhysicsLoop(): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
    // After physics update, compute and set new velocity, update the character controller state
    this.scene.onAfterPhysicsObservable.add((_) => {
      if (!this.scene.deltaTime || !this.characterController) return;
      
      let dt = this.scene.deltaTime / 1000.0;
      if (dt === 0) return;
      
      let down = new BVector3(0, -1, 0);
      let support = this.characterController.checkSupport(dt, down);
      
      let desiredLinearVelocity = this.getDesiredVelocity(dt, support, this.characterController.getVelocity());
      this.characterController.setVelocity(desiredLinearVelocity);
      
      this.characterController.integrate(dt, support, this.characterGravity);
      
      // Update display capsule position
      if (this.displayCapsule) {
        this.displayCapsule.position.copyFrom(this.characterController.getPosition());
      }
    });
  }

  addBlockPhysics(position: Vector3, key: string): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
    // Create block physics body using mesh shape for character controller
    const blockMesh = MeshBuilder.CreateBox(`physics_block_${key}`, { size: 1 }, this.scene);
    blockMesh.position = new BVector3(position.x, position.y, position.z);
    blockMesh.isVisible = false; // Invisible physics body
    
    // Use MESH shape type for better character controller collision
    const blockAggregate = new PhysicsAggregate(
      blockMesh,
      PhysicsShapeType.MESH, // Changed from BOX to MESH for character controller
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
    if (!this.isBrowser || !this.characterController) {
      return;
    }
    
    // Update input direction and jump state
    this.inputDirection.copyFrom(moveDirection);
    this.wantJump = jump;
    
    // Character orientation updates automatically via physics loop
  }
  
  private getDesiredVelocity(deltaTime: number, supportInfo: any, currentVelocity: BVector3): BVector3 {
    let nextState = this.getNextState(supportInfo);
    if (nextState !== this.state) {
      this.state = nextState;
    }
    
    let upWorld = this.characterGravity.normalizeToNew();
    upWorld.scaleInPlace(-1.0);
    let forwardWorld = this.forwardLocalSpace.applyRotationQuaternion(this.characterOrientation);
    
    if (this.state === "IN_AIR") {
      let desiredVelocity = this.inputDirection.scale(this.inAirSpeed).applyRotationQuaternion(this.characterOrientation);
      let outputVelocity = this.characterController.calculateMovement(deltaTime, forwardWorld, upWorld, currentVelocity, BVector3.ZeroReadOnly, desiredVelocity, upWorld);
      
      // Restore to original vertical component
      outputVelocity.addInPlace(upWorld.scale(-outputVelocity.dot(upWorld)));
      outputVelocity.addInPlace(upWorld.scale(currentVelocity.dot(upWorld)));
      // Add gravity
      outputVelocity.addInPlace(this.characterGravity.scale(deltaTime));
      return outputVelocity;
      
    } else if (this.state === "ON_GROUND") {
      let desiredVelocity = this.inputDirection.scale(this.onGroundSpeed).applyRotationQuaternion(this.characterOrientation);
      let outputVelocity = this.characterController.calculateMovement(deltaTime, forwardWorld, supportInfo.averageSurfaceNormal, currentVelocity, supportInfo.averageSurfaceVelocity, desiredVelocity, upWorld);
      
      // Ground movement calculations
      outputVelocity.subtractInPlace(supportInfo.averageSurfaceVelocity);
      let inv1k = 1e-3;
      if (outputVelocity.dot(upWorld) > inv1k) {
        let velLen = outputVelocity.length();
        outputVelocity.normalizeFromLength(velLen);
        
        // Get the desired length in the horizontal direction
        let horizLen = velLen / supportInfo.averageSurfaceNormal.dot(upWorld);
        
        // Re project the velocity onto the horizontal plane
        let c = supportInfo.averageSurfaceNormal.cross(outputVelocity);
        outputVelocity = c.cross(upWorld);
        outputVelocity.scaleInPlace(horizLen);
      }
      outputVelocity.addInPlace(supportInfo.averageSurfaceVelocity);
      return outputVelocity;
      
    } else if (this.state === "START_JUMP") {
      let upWorld = this.characterGravity.normalizeToNew();
      upWorld.scaleInPlace(-1.0);
      let u = Math.sqrt(2 * this.characterGravity.length() * this.jumpHeight);
      let curRelVel = currentVelocity.dot(upWorld);
      return currentVelocity.add(upWorld.scale(u - curRelVel));
    }
    
    return BVector3.Zero();
  }
  
  private getNextState(supportInfo: any): string {
    if (this.state === "IN_AIR") {
      if (supportInfo.supportedState === CharacterSupportedState.SUPPORTED) {
        return "ON_GROUND";
      }
      return "IN_AIR";
    } else if (this.state === "ON_GROUND") {
      if (supportInfo.supportedState !== CharacterSupportedState.SUPPORTED) {
        return "IN_AIR";
      }
      if (this.wantJump) {
        return "START_JUMP";
      }
      return "ON_GROUND";
    } else if (this.state === "START_JUMP") {
      return "IN_AIR";
    }
    return this.state;
  }

  getPlayerPosition(): Vector3 {
    // Return default position if not in browser or character controller not available
    if (!this.isBrowser || !this.characterController) {
      return { x: 0, y: 0, z: 0 };
    }
    
    // Return the character controller position
    const pos = this.characterController.getPosition();
    return {
      x: pos.x,
      y: pos.y,
      z: pos.z
    };
  }

  setPlayerPosition(position: Vector3): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser || !this.characterController) {
      return;
    }
    
    // Set character controller position
    this.characterController.setPosition(new BVector3(position.x, position.y, position.z));
    
    // Update display capsule
    if (this.displayCapsule) {
      this.displayCapsule.position = new BVector3(position.x, position.y, position.z);
    }
    
    console.log(`Player positioned at: (${position.x}, ${position.y}, ${position.z})`);
  }

  // Force set player position and reset velocity (for spawning)
  forceSetPlayerPosition(position: Vector3): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser || !this.characterController) {
      return;
    }
    
    // Set character controller position
    this.characterController.setPosition(new BVector3(position.x, position.y, position.z));
    
    // Reset velocity
    this.characterController.setVelocity(new BVector3(0, 0, 0));
    
    // Reset state
    this.state = "IN_AIR";
    this.wantJump = false;
    this.inputDirection.set(0, 0, 0);
    
    // Update display capsule
    if (this.displayCapsule) {
      this.displayCapsule.position = new BVector3(position.x, position.y, position.z);
    }
    
    console.log(`Player force positioned at: (${position.x}, ${position.y}, ${position.z}) with reset state`);
  }

  isPlayerGrounded(): boolean {
    // Return false if not in browser (during SSR)
    if (!this.isBrowser || !this.characterController) {
      return false;
    }
    
    return this.state === "ON_GROUND";
  }
  
  updateCameraOrientation(cameraRotation: BVector3): void {
    // Update character orientation based on camera rotation
    if (!this.isBrowser) {
      return;
    }
    
    Quaternion.FromEulerAnglesToRef(0, cameraRotation.y, 0, this.characterOrientation);
  }

  dispose(): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
    // Clean up character controller
    if (this.characterController) {
      //this.characterController.dispose();
    }
    
    // Clean up display capsule
    if (this.displayCapsule) {
      this.displayCapsule.dispose();
    }
    
    // Clean up all block physics bodies
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
