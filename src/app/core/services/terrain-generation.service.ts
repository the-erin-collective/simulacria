import { Injectable } from '@angular/core';
import { 
  Block, 
  BlockType, 
  BlockMetadata, 
  Vector3, 
  ProbabilityMapping,
  BLOCK_PROPERTIES 
} from '../../shared/models/block.model';
import { DEFAULT_PROBABILITY_MAPPINGS } from '../../shared/models/probability-mappings';

@Injectable({
  providedIn: 'root'
})
export class TerrainGenerationService {
  private generatedBlocks = new Map<string, Block>();
  private blockQueue: Vector3[] = [];

  constructor() {}

  generateWorld(startPosition: Vector3, radius: number = 32): Map<string, Block> {
    this.generatedBlocks.clear();
    this.blockQueue = [];
    
    // Special handling for spawn chunk (chunk 0,0) - create predictable spawn area
    if (this.isSpawnChunk(startPosition)) {
      console.log('🎯 Generating optimized spawn chunk at origin...');
      return this.generateOptimizedSpawnChunk();
    }

    // Original complex terrain generation for all other chunks
    return this.generateComplexTerrain(startPosition, radius);
  }
  
  private isSpawnChunk(position: Vector3): boolean {
    // Check if this is the spawn chunk (chunk coordinates 0,0,0)
    const chunkSize = 16;
    const chunkX = Math.floor(position.x / chunkSize);
    const chunkY = Math.floor(position.y / chunkSize);
    const chunkZ = Math.floor(position.z / chunkSize);
    return chunkX === 0 && chunkY === 0 && chunkZ === 0;
  }
  
  /**
   * Generate a simple, predictable spawn chunk:
   * - 8 dirt blocks at bottom (Z = 0-7)
   * - 8 air blocks on top (Z = 8-15)
   * - Player spawns at Z = 8.9 (on top of dirt)
   */
  private generateOptimizedSpawnChunk(): Map<string, Block> {
    const spawnBlocks = new Map<string, Block>();
    const chunkSize = 16;
    
    console.log('🎯 Generating optimized spawn chunk...');
    
    // Generate 16x16x16 chunk starting at origin (0,0,0)
    for (let x = 0; x < chunkSize; x++) {
      for (let y = 0; y < chunkSize; y++) {
        // Bottom half: dirt blocks (Z = 0 to 7)
        for (let z = 0; z < 8; z++) {
          const position = { x, y, z };
          const block = this.createBlock(position, BlockType.DIRT);
          const key = this.getBlockKey(position);
          spawnBlocks.set(key, block);
          
          // Debug key blocks
          if ((x === 8 && y === 8) || (x === 4 && y === 4) || (x === 12 && y === 12)) {
            console.log(`🔗 Dirt block: ${key} -> ${block.metadata.blockType}`);
          }
        }
        
        // Top half: air blocks (Z = 8 to 15) 
        for (let z = 8; z < 16; z++) {
          const position = { x, y, z };
          const block = this.createBlock(position, BlockType.AIR);
          const key = this.getBlockKey(position);
          spawnBlocks.set(key, block);
          
          // Debug key blocks
          if ((x === 8 && y === 8) || (x === 4 && y === 4) || (x === 12 && y === 12)) {
            if (z === 8) { // Only log the first air block to avoid spam
              console.log(`🌪️ Air block: ${key} -> ${block.metadata.blockType}`);
            }
          }
        }
      }
    }
    
    console.log(`✅ Generated optimized spawn chunk with ${spawnBlocks.size} blocks (${16*16*8} dirt + ${16*16*8} air)`);
    console.log('🎮 Spawn chunk layout:');
    console.log('  Z=0-7: 🟤 Dirt foundation (safe ground)');
    console.log('  Z=8-15: ☁️ Air space (safe spawn area)');
    console.log('🎮 Player spawn position: (8, 8, 8.9) - standing on dirt platform');
    console.log('🔍 Debug: Generated dirt blocks at Z=0-7, air blocks at Z=8-15');
    
    // Verify critical spawn blocks
    const centerDirt = spawnBlocks.get('8,8,7');
    const centerAir = spawnBlocks.get('8,8,8');
    console.log(`🔍 Spawn verification: dirt at 8,8,7 = ${centerDirt?.metadata.blockType}, air at 8,8,8 = ${centerAir?.metadata.blockType}`);
    
    return spawnBlocks;
  }
  
  private generateComplexTerrain(startPosition: Vector3, radius: number): Map<string, Block> {
    console.log(`🌎 Generating complex terrain at (${startPosition.x}, ${startPosition.y}, ${startPosition.z}) with radius ${radius}`);
    
    // Original complex terrain generation logic
    const seedBlock = this.createBlock(startPosition, BlockType.DIRT);
    this.generatedBlocks.set(this.getBlockKey(startPosition), seedBlock);
    this.blockQueue.push(startPosition);

    // Generate blocks using breadth-first traversal within the specified radius
    while (this.blockQueue.length > 0) {
      const currentPosition = this.blockQueue.shift()!;
      const currentBlock = this.generatedBlocks.get(this.getBlockKey(currentPosition))!;

      // Generate neighboring blocks within radius
      const neighbors = this.getNeighborPositions(currentPosition);
      for (const neighborPos of neighbors) {
        const neighborKey = this.getBlockKey(neighborPos);
        
        // Check if neighbor is within radius and not already generated
        const distance = Math.sqrt(
          Math.pow(neighborPos.x - startPosition.x, 2) +
          Math.pow(neighborPos.y - startPosition.y, 2) +
          Math.pow(neighborPos.z - startPosition.z, 2)
        );
        
        if (!this.generatedBlocks.has(neighborKey) && distance <= radius) {
          const newBlockType = this.selectBlockType(currentBlock, neighborPos, currentPosition);
          const newBlock = this.createBlock(neighborPos, newBlockType, currentBlock);
          
          this.generatedBlocks.set(neighborKey, newBlock);
          this.blockQueue.push(neighborPos);
        }
      }
    }

    console.log(`✅ Generated complex terrain with ${this.generatedBlocks.size} blocks`);
    return new Map(this.generatedBlocks);
  }

  private createBlock(
    position: Vector3, 
    blockType: BlockType, 
    parentBlock?: Block
  ): Block {
    const metadata = this.createBlockMetadata(blockType, parentBlock);
    
    return {
      id: this.generateBlockId(),
      position: { ...position },
      metadata,
      isVisible: blockType !== BlockType.AIR
    };
  }

  private createBlockMetadata(blockType: BlockType, parentBlock?: Block): BlockMetadata {
    const baseProperties = BLOCK_PROPERTIES[blockType];
    const baseProbabilities = DEFAULT_PROBABILITY_MAPPINGS[blockType];
    
    // Apply mutations if parent block exists
    let mutatedProbabilities = baseProbabilities;
    if (parentBlock) {
      mutatedProbabilities = this.applyMutations(baseProbabilities);
    }

    // Handle wood consecutive count for tree generation
    let consecutiveWoodCount = 0;
    if (blockType === BlockType.WOOD && parentBlock?.metadata.blockType === BlockType.WOOD) {
      consecutiveWoodCount = (parentBlock.metadata.consecutiveWoodCount || 1) + 1;
      mutatedProbabilities = this.applyTreeGenerationLogic(mutatedProbabilities, consecutiveWoodCount);
    }

    return {
      blockType,
      probabilityMappings: {
        horizontalNeighbors: mutatedProbabilities.horizontalNeighbors || this.getDefaultMapping(),
        positiveZ: mutatedProbabilities.positiveZ || this.getDefaultMapping(),
        negativeZ: mutatedProbabilities.negativeZ || this.getDefaultMapping()
      },
      consecutiveWoodCount,
      breakable: baseProperties.breakable || false,
      requiredTool: baseProperties.requiredTool,
      hardness: baseProperties.hardness || 0,
      transparent: baseProperties.transparent || false
    };
  }

  private applyMutations(
    baseProbabilities: Partial<BlockMetadata['probabilityMappings']>
  ): Partial<BlockMetadata['probabilityMappings']> {
    const mutated = JSON.parse(JSON.stringify(baseProbabilities));
    
    // Apply 1% probability transfers between block types
    const blockTypes = Object.values(BlockType);
    const mutationRate = 0.01;

    for (const direction of ['horizontalNeighbors', 'positiveZ', 'negativeZ'] as const) {
      if (mutated[direction]) {
        const mapping = mutated[direction];
        
        // Perform (N-1) × 1% probability transfers
        for (let i = 0; i < blockTypes.length - 1; i++) {
          const fromType = blockTypes[i];
          const toType = blockTypes[(i + 1) % blockTypes.length];
          
          const transferAmount = mapping[fromType] * mutationRate;
          mapping[fromType] = Math.max(0, mapping[fromType] - transferAmount);
          mapping[toType] += transferAmount;
        }
        
        // Normalize to ensure sum equals 100%
        this.normalizeProbabilities(mapping);
      }
    }

    return mutated;
  }

  private applyTreeGenerationLogic(
    probabilities: Partial<BlockMetadata['probabilityMappings']>,
    consecutiveCount: number
  ): Partial<BlockMetadata['probabilityMappings']> {
    const mutated = JSON.parse(JSON.stringify(probabilities));
    
    if (mutated.positiveZ) {
      // Apply tree generation formula: (1 / consecutiveCount) × baseChance
      const reductionFactor = 1 / consecutiveCount;
      const baseWoodChance = mutated.positiveZ[BlockType.WOOD];
      const reducedWoodChance = baseWoodChance * reductionFactor;
      const increasedAirChance = baseWoodChance - reducedWoodChance;
      
      mutated.positiveZ[BlockType.WOOD] = reducedWoodChance;
      mutated.positiveZ[BlockType.AIR] += increasedAirChance;
      
      // Additional 5% reduction per consecutive block
      const additionalReduction = Math.min(consecutiveCount * 5, 50);
      const additionalTransfer = (mutated.positiveZ[BlockType.WOOD] * additionalReduction) / 100;
      
      mutated.positiveZ[BlockType.WOOD] -= additionalTransfer;
      mutated.positiveZ[BlockType.AIR] += additionalTransfer;
      
      this.normalizeProbabilities(mutated.positiveZ);
    }
    
    return mutated;
  }

  private selectBlockType(parentBlock: Block, newPosition: Vector3, parentPosition: Vector3): BlockType {
    const direction = this.getDirection(parentPosition, newPosition);
    let probabilityMapping: ProbabilityMapping;

    switch (direction) {
      case 'up':
        probabilityMapping = parentBlock.metadata.probabilityMappings.positiveZ;
        break;
      case 'down':
        probabilityMapping = parentBlock.metadata.probabilityMappings.negativeZ;
        break;
      default:
        probabilityMapping = parentBlock.metadata.probabilityMappings.horizontalNeighbors;
    }

    return this.selectRandomBlockType(probabilityMapping);
  }

  private selectRandomBlockType(probabilityMapping: ProbabilityMapping): BlockType {
    const random = Math.random() * 100;
    let cumulative = 0;

    for (const [blockType, probability] of Object.entries(probabilityMapping)) {
      cumulative += probability;
      if (random <= cumulative) {
        return blockType as BlockType;
      }
    }

    // Fallback to air if something goes wrong
    return BlockType.AIR;
  }

  private getDirection(from: Vector3, to: Vector3): 'up' | 'down' | 'horizontal' {
    if (to.z > from.z) return 'up';
    if (to.z < from.z) return 'down';
    return 'horizontal';
  }

  private getNeighborPositions(position: Vector3): Vector3[] {
    return [
      { x: position.x + 1, y: position.y, z: position.z },
      { x: position.x - 1, y: position.y, z: position.z },
      { x: position.x, y: position.y + 1, z: position.z },
      { x: position.x, y: position.y - 1, z: position.z },
      { x: position.x, y: position.y, z: position.z + 1 },
      { x: position.x, y: position.y, z: position.z - 1 }
    ];
  }

  private getBlockKey(position: Vector3): string {
    return `${position.x},${position.y},${position.z}`;
  }

  private generateBlockId(): string {
    return 'block_' + Math.random().toString(36).substr(2, 9);
  }

  private getDefaultMapping(): ProbabilityMapping {
    return {
      [BlockType.AIR]: 0,
      [BlockType.DIRT]: 0,
      [BlockType.STONE]: 0,
      [BlockType.SAND]: 0,
      [BlockType.WATER]: 0,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    };
  }

  private normalizeProbabilities(mapping: ProbabilityMapping): void {
    const total = Object.values(mapping).reduce((sum, val) => sum + val, 0);
    if (total > 0) {
      for (const key in mapping) {
        mapping[key as BlockType] = (mapping[key as BlockType] / total) * 100;
      }
    }
  }
}
