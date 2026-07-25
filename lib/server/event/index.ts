// Core event system
export { EventEmitter } from './EventEmitter';
export { EventDispatchService } from './EventDispatchService';

// Pattern matcher (utility)
export { matchesEventPattern } from './eventPatternMatcher';

// Shared pattern → handler index (hybrid exact/wildcard lookup)
export { PatternHandlerIndex } from './PatternHandlerIndex';

// Injection utility
export { emitter } from './emitter';

// Types
export * from './types';

// Decorators
export * from './decorators';
