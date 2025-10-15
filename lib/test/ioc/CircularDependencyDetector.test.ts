import { beforeEach, describe, expect, test } from 'bun:test';
import { CircularDependencyDetector, CircularDependencyError, Container } from '../../ioc';
import { Component } from '../../server/decorators';
import { Inject } from '../../ioc/component';

describe('CircularDependencyDetector', () => {
  let detector: CircularDependencyDetector;

  beforeEach(() => {
    detector = new CircularDependencyDetector();
  });

  describe('Basic Operations', () => {
    test('should create detector with empty stack', () => {
      expect(detector.isEmpty()).toBe(true);
      expect(detector.getStack()).toEqual([]);
    });

    test('should push service to stack', () => {
      detector.push('ServiceA');

      expect(detector.isEmpty()).toBe(false);
      expect(detector.getStack()).toEqual(['ServiceA']);
    });

    test('should pop service from stack', () => {
      detector.push('ServiceA');
      detector.pop('ServiceA');

      expect(detector.isEmpty()).toBe(true);
      expect(detector.getStack()).toEqual([]);
    });

    test('should handle multiple services in stack', () => {
      detector.push('ServiceA');
      detector.push('ServiceB');
      detector.push('ServiceC');

      expect(detector.getStack()).toEqual(['ServiceA', 'ServiceB', 'ServiceC']);
    });

    test('should clear entire stack', () => {
      detector.push('ServiceA');
      detector.push('ServiceB');
      detector.push('ServiceC');

      detector.clear();

      expect(detector.isEmpty()).toBe(true);
      expect(detector.getStack()).toEqual([]);
    });
  });

  describe('Circular Dependency Detection', () => {
    test('should not throw error for non-circular dependencies', () => {
      detector.push('ServiceA');
      detector.push('ServiceB');

      // eslint-disable-next-line max-nested-callbacks
      expect(() => detector.checkCircular('ServiceC')).not.toThrow();
    });

    test('should detect direct circular dependency (A -> A)', () => {
      detector.push('ServiceA');

      // eslint-disable-next-line max-nested-callbacks
      expect(() => detector.checkCircular('ServiceA')).toThrow(CircularDependencyError);
    });

    test('should detect two-level circular dependency (A -> B -> A)', () => {
      detector.push('ServiceA');
      detector.push('ServiceB');

      // eslint-disable-next-line max-nested-callbacks
      expect(() => detector.checkCircular('ServiceA')).toThrow(CircularDependencyError);
    });

    test('should detect multi-level circular dependency (A -> B -> C -> A)', () => {
      detector.push('ServiceA');
      detector.push('ServiceB');
      detector.push('ServiceC');

      // eslint-disable-next-line max-nested-callbacks
      expect(() => detector.checkCircular('ServiceA')).toThrow(CircularDependencyError);
    });

    test('should provide detailed error message with chain', () => {
      detector.push('ServiceA');
      detector.push('ServiceB');
      detector.push('ServiceC');

      try {
        detector.checkCircular('ServiceA');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(CircularDependencyError);
        expect((error as Error).message).toContain('Circular dependency detected');
        expect((error as Error).message).toContain('ServiceA -> ServiceB -> ServiceC -> ServiceA');
      }
    });

    test('should have correct error name', () => {
      detector.push('ServiceA');

      try {
        detector.checkCircular('ServiceA');
      } catch (error) {
        expect((error as Error).name).toBe('CircularDependencyError');
      }
    });
  });

  describe('Stack Management', () => {
    test('should maintain FIFO order in stack', () => {
      detector.push('First');
      detector.push('Second');
      detector.push('Third');

      const stack = detector.getStack();

      expect(stack[0]).toBe('First');
      expect(stack[1]).toBe('Second');
      expect(stack[2]).toBe('Third');
    });

    test('should remove only specified service on pop', () => {
      detector.push('ServiceA');
      detector.push('ServiceB');
      detector.push('ServiceC');

      detector.pop('ServiceB');

      const stack = detector.getStack();

      expect(stack).toContain('ServiceA');
      expect(stack).not.toContain('ServiceB');
      expect(stack).toContain('ServiceC');
    });

    test('should handle popping non-existent service gracefully', () => {
      detector.push('ServiceA');

      // eslint-disable-next-line max-nested-callbacks
      expect(() => detector.pop('NonExistent')).not.toThrow();
      expect(detector.getStack()).toEqual(['ServiceA']);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty stack check', () => {
      // eslint-disable-next-line max-nested-callbacks
      expect(() => detector.checkCircular('ServiceA')).not.toThrow();
    });

    test('should handle multiple pushes of same service', () => {
      detector.push('ServiceA');
      detector.push('ServiceA');

      // Set should contain only one instance
      expect(detector.getStack().length).toBe(1);
    });

    test('should handle special characters in service names', () => {
      detector.push('Service$A');
      detector.push('Service@B');

      // eslint-disable-next-line max-nested-callbacks
      expect(() => detector.checkCircular('Service#C')).not.toThrow();
    });

    test('should handle very long dependency chains', () => {
      for (let i = 0; i < 100; i++) {
        detector.push(`Service${i}`);
      }

      expect(detector.getStack()).toHaveLength(100);
      // eslint-disable-next-line max-nested-callbacks
      expect(() => detector.checkCircular('Service0')).toThrow(CircularDependencyError);
    });
  });
});

describe('Container Integration - Circular Dependency Detection', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('Direct Circular Dependencies', () => {
    test('should detect A -> B -> A circular dependency', async () => {
      @Component()
      class ServiceA {

        @Inject('ServiceB')
        public serviceB: any;
      
}

      @Component()
      class ServiceB {

        @Inject('ServiceA')
        public serviceA: any;
      
}

      await container.register('ServiceB', ServiceB, false);
      await container.register('ServiceA', ServiceA, false);

      expect(container.resolve('ServiceA')).rejects.toThrow(CircularDependencyError);
      expect(container.resolve('ServiceA')).rejects.toThrow(/ServiceA -> ServiceB -> ServiceA/);
    });

    test('should detect self-referencing dependency (A -> A)', async () => {
      @Component()
      class SelfReferencingService {

        @Inject('SelfReferencingService')
        public self: any;
      
}

      await container.register('SelfReferencingService', SelfReferencingService, false);

      expect(container.resolve('SelfReferencingService')).rejects.toThrow(CircularDependencyError);
    });
  });

  describe('Multi-Level Circular Dependencies', () => {
    test('should detect A -> B -> C -> A circular dependency', async () => {
      @Component()
      class ServiceA {

        @Inject('ServiceB')
        public serviceB: any;
      
}

      @Component()
      class ServiceB {

        @Inject('ServiceC')
        public serviceC: any;
      
}

      @Component()
      class ServiceC {

        @Inject('ServiceA')
        public serviceA: any;
      
}

      await container.register('ServiceC', ServiceC, false);
      await container.register('ServiceB', ServiceB, false);
      await container.register('ServiceA', ServiceA, false);

      expect(container.resolve('ServiceA')).rejects.toThrow(CircularDependencyError);
      expect(container.resolve('ServiceA')).rejects.toThrow(/ServiceA -> ServiceB -> ServiceC -> ServiceA/);
    });

    test('should detect A -> B -> C -> D -> B circular dependency', async () => {
      @Component()
      class ServiceA {

        @Inject('ServiceB')
        public serviceB: any;
      
}

      @Component()
      class ServiceB {

        @Inject('ServiceC')
        public serviceC: any;
      
}

      @Component()
      class ServiceC {

        @Inject('ServiceD')
        public serviceD: any;
      
}

      @Component()
      class ServiceD {

        @Inject('ServiceB')
        public serviceB: any;
      
}

      await container.register('ServiceD', ServiceD, false);
      await container.register('ServiceC', ServiceC, false);
      await container.register('ServiceB', ServiceB, false);
      await container.register('ServiceA', ServiceA, false);

      expect(container.resolve('ServiceA')).rejects.toThrow(CircularDependencyError);
    });
  });

  describe('Non-Circular Dependencies', () => {
    test('should allow valid dependency chain A -> B -> C', async () => {
      @Component()
      class ServiceC {

        public value = 'C';
      
}

      @Component()
      class ServiceB {

        @Inject('ServiceC')
        public serviceC: any;
      
}

      @Component()
      class ServiceA {

        @Inject('ServiceB')
        public serviceB: any;
      
}

      await container.register('ServiceC', ServiceC, true);
      await container.register('ServiceB', ServiceB, true);
      await container.register('ServiceA', ServiceA, true);

      const serviceA = (await container.resolve('ServiceA')) as any;

      expect(serviceA).toBeInstanceOf(ServiceA);
      expect(serviceA.serviceB).toBeInstanceOf(ServiceB);
      expect(serviceA.serviceB.serviceC).toBeInstanceOf(ServiceC);
      expect(serviceA.serviceB.serviceC.value).toBe('C');
    });

    test('should allow multiple services depending on same service (diamond pattern)', async () => {
      @Component()
      class SharedService {

        public value = 'shared';
      
}

      @Component()
      class ServiceB {

        @Inject('SharedService')
        public shared: any;
      
}

      @Component()
      class ServiceC {

        @Inject('SharedService')
        public shared: any;
      
}

      @Component()
      class ServiceA {

        @Inject('ServiceB')
        public serviceB: any;

        @Inject('ServiceC')
        public serviceC: any;
      
}

      await container.register('SharedService', SharedService, true);
      await container.register('ServiceB', ServiceB, true);
      await container.register('ServiceC', ServiceC, true);
      await container.register('ServiceA', ServiceA, true);

      const serviceA = (await container.resolve('ServiceA')) as any;

      expect(serviceA).toBeInstanceOf(ServiceA);
      expect(serviceA.serviceB.shared).toBe(serviceA.serviceC.shared); // Same singleton instance
    });
  });

  describe('Error Recovery', () => {
    test('should allow resolution after circular dependency error', async () => {
      @Component()
      class GoodService {

        public value = 'good';
      
}

      @Component()
      class BadServiceA {

        @Inject('BadServiceB')
        public serviceB: any;
      
}

      @Component()
      class BadServiceB {

        @Inject('BadServiceA')
        public serviceA: any;
      
}

      await container.register('GoodService', GoodService, true);
      await container.register('BadServiceB', BadServiceB, false);
      await container.register('BadServiceA', BadServiceA, false);

      // First resolution should fail
      expect(container.resolve('BadServiceA')).rejects.toThrow(CircularDependencyError);

      // But should be able to resolve other services
      const goodService = (await container.resolve('GoodService')) as any;

      expect(goodService.value).toBe('good');
    });
  });
});
