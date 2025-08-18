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

  generateWorld(startPosition: Vector3, generationLimit: number): Map<string, Block> {
    this.generatedBlocks.clear();
    this.blockQueue = [];

    // Create the initial seed block
    const seedBlock = this.createBlock(startPosition, BlockType.DIRT);
    this.generatedBlocks.set(this.getBlockKey(startPosition), seedBlock);
    this.blockQueue.push(startPosition);

    // Generate blocks using breadth-first traversal
    let generatedCount = 1;
    while (this.blockQueue.length > 0 && generatedCount < generationLimit) {
      const currentPosition = this.blockQueue.shift()!;
      const currentBlock = this.generatedBlocks.get(this.getBlockKey(currentPosition))!;

      // Generate neighboring blocks
      const neighbors = this.getNeighborPositions(currentPosition);
      for (const neighborPos of neighbors) {
        const neighborKey = this.getBlockKey(neighborPos);
        
        if (!this.generatedBlocks.has(neighborKey) && generatedCount < generationLimit) {
          const newBlockType = this.selectBlockType(currentBlock, neighborPos, currentPosition);
          const newBlock = this.createBlock(neighborPos, newBlockType, currentBlock);
          
          this.generatedBlocks.set(neighborKey, newBlock);
          this.blockQueue.push(neighborPos);
          generatedCount++;
        }
      }
    }

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
