import { BlockType, ProbabilityMapping, BlockMetadata } from './block.model';

export const DEFAULT_PROBABILITY_MAPPINGS: Record<BlockType, Partial<BlockMetadata['probabilityMappings']>> = {
  [BlockType.DIRT]: {
    horizontalNeighbors: {
      [BlockType.AIR]: 8,
      [BlockType.DIRT]: 70,
      [BlockType.STONE]: 12,
      [BlockType.SAND]: 7,
      [BlockType.WATER]: 3,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    },
    positiveZ: {
      [BlockType.AIR]: 75,
      [BlockType.DIRT]: 20,
      [BlockType.STONE]: 3,
      [BlockType.SAND]: 2,
      [BlockType.WATER]: 0,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    },
    negativeZ: {
      [BlockType.AIR]: 1,
      [BlockType.DIRT]: 65,
      [BlockType.STONE]: 28,
      [BlockType.SAND]: 3,
      [BlockType.WATER]: 3,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    }
  },
  [BlockType.STONE]: {
    horizontalNeighbors: {
      [BlockType.AIR]: 7,
      [BlockType.DIRT]: 18,
      [BlockType.STONE]: 65,
      [BlockType.SAND]: 5,
      [BlockType.WATER]: 5,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    },
    positiveZ: {
      [BlockType.AIR]: 45,
      [BlockType.DIRT]: 35,
      [BlockType.STONE]: 15,
      [BlockType.SAND]: 3,
      [BlockType.WATER]: 2,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    },
    negativeZ: {
      [BlockType.AIR]: 0.5,
      [BlockType.DIRT]: 8,
      [BlockType.STONE]: 87,
      [BlockType.SAND]: 2,
      [BlockType.WATER]: 2.5,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    }
  },
  [BlockType.SAND]: {
    horizontalNeighbors: {
      [BlockType.AIR]: 10,
      [BlockType.DIRT]: 20,
      [BlockType.STONE]: 5,
      [BlockType.SAND]: 50,
      [BlockType.WATER]: 15,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    },
    positiveZ: {
      [BlockType.AIR]: 70,
      [BlockType.DIRT]: 10,
      [BlockType.STONE]: 2,
      [BlockType.SAND]: 15,
      [BlockType.WATER]: 3,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    },
    negativeZ: {
      [BlockType.AIR]: 3,
      [BlockType.DIRT]: 15,
      [BlockType.STONE]: 20,
      [BlockType.SAND]: 50,
      [BlockType.WATER]: 12,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    }
  },
  [BlockType.WATER]: {
    horizontalNeighbors: {
      [BlockType.AIR]: 20,
      [BlockType.DIRT]: 10,
      [BlockType.STONE]: 5,
      [BlockType.SAND]: 30,
      [BlockType.WATER]: 35,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    },
    positiveZ: {
      [BlockType.AIR]: 90,
      [BlockType.DIRT]: 2,
      [BlockType.STONE]: 1,
      [BlockType.SAND]: 5,
      [BlockType.WATER]: 2,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    },
    negativeZ: {
      [BlockType.AIR]: 1,
      [BlockType.DIRT]: 20,
      [BlockType.STONE]: 15,
      [BlockType.SAND]: 40,
      [BlockType.WATER]: 24,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    }
  },
  [BlockType.WOOD]: {
    horizontalNeighbors: {
      [BlockType.AIR]: 30,
      [BlockType.DIRT]: 30,
      [BlockType.STONE]: 5,
      [BlockType.SAND]: 5,
      [BlockType.WATER]: 0,
      [BlockType.WOOD]: 20,
      [BlockType.LEAVES]: 10
    },
    positiveZ: {
      [BlockType.AIR]: 20,
      [BlockType.DIRT]: 0,
      [BlockType.STONE]: 0,
      [BlockType.SAND]: 0,
      [BlockType.WATER]: 0,
      [BlockType.WOOD]: 80,
      [BlockType.LEAVES]: 0
    },
    negativeZ: {
      [BlockType.AIR]: 5,
      [BlockType.DIRT]: 50,
      [BlockType.STONE]: 20,
      [BlockType.SAND]: 10,
      [BlockType.WATER]: 5,
      [BlockType.WOOD]: 10,
      [BlockType.LEAVES]: 0
    }
  },
  [BlockType.LEAVES]: {
    horizontalNeighbors: {
      [BlockType.AIR]: 40,
      [BlockType.DIRT]: 5,
      [BlockType.STONE]: 0,
      [BlockType.SAND]: 0,
      [BlockType.WATER]: 0,
      [BlockType.WOOD]: 20,
      [BlockType.LEAVES]: 35
    },
    positiveZ: {
      [BlockType.AIR]: 80,
      [BlockType.DIRT]: 0,
      [BlockType.STONE]: 0,
      [BlockType.SAND]: 0,
      [BlockType.WATER]: 0,
      [BlockType.WOOD]: 5,
      [BlockType.LEAVES]: 15
    },
    negativeZ: {
      [BlockType.AIR]: 60,
      [BlockType.DIRT]: 10,
      [BlockType.STONE]: 0,
      [BlockType.SAND]: 0,
      [BlockType.WATER]: 0,
      [BlockType.WOOD]: 25,
      [BlockType.LEAVES]: 5
    }
  },
  [BlockType.AIR]: {
    horizontalNeighbors: {
      [BlockType.AIR]: 98,
      [BlockType.DIRT]: 1,
      [BlockType.STONE]: 0.5,
      [BlockType.SAND]: 0.3,
      [BlockType.WATER]: 0.2,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    },
    positiveZ: {
      [BlockType.AIR]: 99.5,
      [BlockType.DIRT]: 0.2,
      [BlockType.STONE]: 0.1,
      [BlockType.SAND]: 0.1,
      [BlockType.WATER]: 0.1,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    },
    negativeZ: {
      [BlockType.AIR]: 15,
      [BlockType.DIRT]: 40,
      [BlockType.STONE]: 30,
      [BlockType.SAND]: 8,
      [BlockType.WATER]: 7,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    }
  }
};
