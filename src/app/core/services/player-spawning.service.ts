import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Vector3, BlockType, Block } from '../../shared/models/block.model';
import { selectBlockAtPosition } from '../../store/world/world.selectors';
import { take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PlayerSpawningService {
  constructor(private store: Store) {}

  // Try to use the optimized spawn chunk (chunk 0,0,0) if it exists
  private async tryOptimizedSpawnChunk(): Promise<Vector3 | null> {
    console.log('🎯 Checking for optimized spawn chunk...');
    
    // Check for optimized spawn chunk at the center of chunk (0,0,0)
    // Spawn chunk has dirt blocks at Z=0-7, air at Z=8-15
    // Best spawn position is at (8, 8, 8.9) - standing on dirt platform
    const centerX = 8; // Middle of 16x16 chunk
    const centerY = 8; // Middle of 16x16 chunk 
    const surfaceZ = 7;   // Top of dirt layer
    const spawnZ = surfaceZ + 1.9; // Surface + gap + player height offset
    
    console.log(`🎯 Checking optimized spawn chunk at (${centerX}, ${centerY}, ${spawnZ})...`);
    
    try {
      // Check multiple positions to confirm this is the optimized chunk
      let validPositions = 0;
      const testPositions = [
        { x: centerX, y: centerY },
        { x: centerX - 2, y: centerY },
        { x: centerX + 2, y: centerY },
        { x: centerX, y: centerY - 2 },
        { x: centerX, y: centerY + 2 }
      ];
      
      for (const pos of testPositions) {
        const surfaceBlock = await this.getBlockAtPosition(pos.x, pos.y, surfaceZ);
        const aboveBlock = await this.getBlockAtPosition(pos.x, pos.y, surfaceZ + 1);
        
        const hasDirtSurface = surfaceBlock && surfaceBlock.metadata.blockType === BlockType.DIRT;
        const hasAirAbove = (!aboveBlock || aboveBlock.metadata.blockType === BlockType.AIR);
        
        if (hasDirtSurface && hasAirAbove) {
          validPositions++;
        }
      }
      
      // If we found at least 3 out of 5 valid positions, consider it optimized
      if (validPositions >= 3) {
        const spawnPos = { x: centerX, y: centerY, z: spawnZ };
        console.log(`✅ Found optimized spawn chunk! Valid positions: ${validPositions}/5`);
        console.log(`✅ Spawning at (${centerX}, ${centerY}, ${spawnZ})`);
        return spawnPos;
      } else {
        console.log(`❌ Optimized spawn chunk pattern not found: valid=${validPositions}/5`);
      }
    } catch (error) {
      console.warn('Error checking optimized spawn chunk:', error);
    }
    
    return null;
  }

  async findSafeSpawnPosition(): Promise<Vector3> {
    console.log('Finding safe spawn position...');
    
    // Priority 1: Use optimized spawn chunk if available
    const spawnChunkPosition = await this.tryOptimizedSpawnChunk();
    if (spawnChunkPosition) {
      console.log(`Using optimized spawn chunk at: (${spawnChunkPosition.x}, ${spawnChunkPosition.y}, ${spawnChunkPosition.z})`);
      return spawnChunkPosition;
    }
    
    // Priority 2: For new worlds, find a surface position based on generated terrain
    // Search in a spiral pattern around origin
    const searchRadius = 20;
    const maxHeight = 50;
    const minHeight = -10;

    for (let radius = 0; radius <= searchRadius; radius++) {
      for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
          // Only check the perimeter of the current radius
          if (Math.abs(x) !== radius && Math.abs(y) !== radius && radius > 0) continue;

          const spawnPos = await this.findSurfaceAt(x, y, maxHeight, minHeight);
          if (spawnPos) {
            // Double-check that this position is actually safe
            const isActuallySafe = await this.isPositionSafe(spawnPos);
            if (isActuallySafe) {
              console.log(`Found safe spawn at: (${spawnPos.x}, ${spawnPos.y}, ${spawnPos.z})`);
              return spawnPos;
            } else {
              console.warn(`Surface found but not safe at: (${spawnPos.x}, ${spawnPos.y}, ${spawnPos.z})`);
            }
          }
        }
      }
    }

    console.warn('No safe spawn found using surface search, trying terrain analysis...');
    
    // Fallback 1: Use terrain height detection at origin
    const terrainHeight = await this.findTerrainHeight(0, 0, maxHeight, minHeight);
    if (terrainHeight !== null) {
      // Position player properly above the terrain
      // PhysicsCharacterController center should be 1.8/2 = 0.9 above the ground
      // We want the player's feet to be just above the terrain block
      const terrainSpawn = { x: 0, y: 0, z: terrainHeight + 1.9 }; // terrain block + 0.1 gap + 1.8 player height
      if (await this.isPositionSafe(terrainSpawn)) {
        console.log(`Using terrain-based spawn at: (${terrainSpawn.x}, ${terrainSpawn.y}, ${terrainSpawn.z})`);
        return terrainSpawn;
      }
    }
    
    // Fallback 2: Try origin area with higher spawn position
    for (let z = maxHeight; z >= minHeight; z--) {
      const testPos = { x: 0, y: 0, z: z + 1.9 }; // Add player height offset
      if (await this.isPositionSafe(testPos)) {
        console.log(`Using fallback spawn at origin: (0, 0, ${z + 1.9})`);
        return testPos;
      }
    }
    
    // Fallback 3: Spawn high above ground (emergency) with proper physics positioning
    console.warn('Using emergency high spawn position');
    return { x: 0, y: 0, z: 32 }; // Spawn high above origin - physics controller center at 32 units
  }

  private async findSurfaceAt(x: number, y: number, maxZ: number, minZ: number): Promise<Vector3 | null> {
    console.log(`Checking surface at (${x}, ${y})...`);
    
    // Start from the top and scan downward to find the highest solid surface
    for (let z = maxZ; z >= minZ; z--) {
      try {
        const blockAtCurrentZ = await this.getBlockAtPosition(x, y, z);
        const blockAboveCurrentZ = await this.getBlockAtPosition(x, y, z + 1);
        const blockAboveAboveCurrentZ = await this.getBlockAtPosition(x, y, z + 2);
        
        // Check if we found a solid block with 2 air blocks above it
        const currentIsSolid = blockAtCurrentZ && 
                              blockAtCurrentZ.metadata.blockType !== BlockType.AIR && 
                              blockAtCurrentZ.metadata.blockType !== BlockType.WATER;
        const aboveIsAir = !blockAboveCurrentZ || blockAboveCurrentZ.metadata.blockType === BlockType.AIR;
        const aboveAboveIsAir = !blockAboveAboveCurrentZ || blockAboveAboveCurrentZ.metadata.blockType === BlockType.AIR;
        
        if (currentIsSolid && aboveIsAir && aboveAboveIsAir) {
          // Position player physics controller center properly
          // PhysicsCharacterController center should be 1.8/2 = 0.9 above the surface
          // We want the player to stand ON the surface block, not inside it
          // So: surface block height (z) + 0.1 gap + 1.8 player height = z + 1.9
          const spawnZ = z + 1.9; // Surface block + gap + controller center offset
          console.log(`Found valid surface at (${x}, ${y}, ${spawnZ}) on solid block at z=${z}`);
          return { x, y, z: spawnZ };
        }
      } catch (error) {
        // If we can't get block data, continue searching
        console.warn(`Error checking block at (${x}, ${y}, ${z}):`, error);
        continue;
      }
    }

    console.log(`No valid surface found at (${x}, ${y})`);
    return null;
  }
  
  private async getBlockAtPosition(x: number, y: number, z: number): Promise<Block | null> {
    return new Promise((resolve) => {
      // Try to get block from store first
      this.store.select(selectBlockAtPosition).pipe(take(1)).subscribe(getBlock => {
        try {
          const block = getBlock(x, y, z);
          resolve(block);
        } catch (error) {
          resolve(null);
        }
      });
    });
  }

  // Find the height of the terrain (highest solid block) at given coordinates
  private async findTerrainHeight(x: number, y: number, maxZ: number, minZ: number): Promise<number | null> {
    console.log(`Finding terrain height at (${x}, ${y})...`);
    
    // Scan from top to bottom to find the highest solid block
    for (let z = maxZ; z >= minZ; z--) {
      try {
        const block = await this.getBlockAtPosition(x, y, z);
        if (block && 
            block.metadata.blockType !== BlockType.AIR && 
            block.metadata.blockType !== BlockType.WATER) {
          console.log(`Found terrain height ${z} at (${x}, ${y})`);
          return z;
        }
      } catch (error) {
        console.warn(`Error checking terrain height at (${x}, ${y}, ${z}):`, error);
        continue;
      }
    }
    
    console.log(`No terrain found at (${x}, ${y})`);
    return null;
  }

  // Check if a position is safe for spawning (not inside blocks, has space above)
  async isPositionSafe(position: Vector3): Promise<boolean> {
    return new Promise((resolve) => {
      this.store.select(selectBlockAtPosition).pipe(take(1)).subscribe(getBlock => {
        const { x, y, z } = position;
        
        // Player physics body center is at position, but we need to check collision space
        // Player height is 1.8, radius is 0.3
        // Check collision space accounting for physics body positioning
        const playerFeetZ = z - 0.9; // Physics center minus half height
        const playerHeadZ = z + 0.9; // Physics center plus half height
        
        // Check blocks at feet level (where player stands)
        const blockAtFeet = getBlock(Math.floor(x), Math.floor(y), Math.floor(playerFeetZ));
        // Check blocks at head level (player needs clearance)
        const blockAtHead = getBlock(Math.floor(x), Math.floor(y), Math.floor(playerHeadZ));
        // Check block below feet for solid ground
        const blockBelowFeet = getBlock(Math.floor(x), Math.floor(y), Math.floor(playerFeetZ - 0.1));

        // Position is safe if:
        // 1. Feet position is clear (not solid)
        // 2. Head position is clear (not solid) 
        // 3. Block below feet is solid (something to stand on)
        const feetClear = !blockAtFeet || 
                         blockAtFeet.metadata.blockType === BlockType.AIR;
        const headClear = !blockAtHead || 
                         blockAtHead.metadata.blockType === BlockType.AIR;
        const solidGround = blockBelowFeet && 
                           blockBelowFeet.metadata.blockType !== BlockType.AIR &&
                           blockBelowFeet.metadata.blockType !== BlockType.WATER;

        const isSafe = feetClear && headClear && solidGround;
        console.log(`Position safety check (${x}, ${y}, ${z}): feet=${feetClear}, head=${headClear}, ground=${solidGround}, safe=${isSafe}`);
        
        resolve(Boolean(isSafe));
      });
    });
  }

  // Get a random spawn position within a radius
  getRandomSpawnInRadius(center: Vector3, radius: number): Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    
    return {
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance,
      z: center.z
    };
  }

  // Emergency spawn position if all else fails
  getEmergencySpawn(): Vector3 {
    // Spawn high in the sky with physics body center positioning
    // This ensures the player will fall down to find solid ground
    return { x: 0, y: 0, z: 100 }; // High in the sky, physics will handle the fall
  }

  // Validate and adjust spawn position for physics compatibility
  async validateSpawnPosition(position: Vector3): Promise<Vector3> {
    console.log(`Validating spawn position: (${position.x}, ${position.y}, ${position.z})`);
    
    // Check if position is safe
    if (await this.isPositionSafe(position)) {
      return position;
    }
    
    // If not safe, try to find a safe position nearby
    const searchRadius = 3;
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        for (let dz = -2; dz <= 5; dz++) { // Search slightly below and above
          const testPos = {
            x: position.x + dx,
            y: position.y + dy,
            z: position.z + dz
          };
          
          if (await this.isPositionSafe(testPos)) {
            console.log(`Found safe adjusted position: (${testPos.x}, ${testPos.y}, ${testPos.z})`);
            return testPos;
          }
        }
      }
    }
    
    // If no safe position found nearby, return original (physics will handle)
    console.warn('No safe adjusted position found, using original position');
    return position;
  }

  // Get spawn position that ensures player stands on solid ground
  async getGroundSpawnPosition(x: number, y: number): Promise<Vector3 | null> {
    const terrainHeight = await this.findTerrainHeight(x, y, 50, -10);
    if (terrainHeight === null) {
      return null;
    }
    
    // Position player physics body center so feet touch the ground
    // Physics controller center should be positioned 1.9 units above terrain
    // This accounts for: terrain block + small gap (0.1) + player height (1.8)
    const spawnZ = terrainHeight + 1.9;
    
    const spawnPos = { x, y, z: spawnZ };
    
    // Validate the position is actually safe
    if (await this.isPositionSafe(spawnPos)) {
      return spawnPos;
    }
    
    return null;
  }
}
