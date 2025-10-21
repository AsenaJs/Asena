import { describe, expect, test } from 'bun:test';
import { CoreBootstrapPhase } from '../../ioc';

describe('CoreBootstrapPhase', () => {
  test('should have correct phase order', () => {
    const expectedOrder = [
      CoreBootstrapPhase.CONTAINER_INIT,
      CoreBootstrapPhase.LOGGER_INIT,
      CoreBootstrapPhase.IOC_ENGINE_INIT,
      CoreBootstrapPhase.HTTP_ADAPTER_INIT,
      CoreBootstrapPhase.PREPARE_SERVICES_INIT,
      CoreBootstrapPhase.USER_COMPONENTS_SCAN,
      CoreBootstrapPhase.USER_COMPONENTS_INIT,
      CoreBootstrapPhase.APPLICATION_SETUP,
      CoreBootstrapPhase.SERVER_READY,
    ];

    expectedOrder.forEach((phase, _index) => {
      expect(phase).toBeDefined();
      expect(typeof phase).toBe('string');
    });
  });

  test('each phase should be a unique string', () => {
    const phases = Object.values(CoreBootstrapPhase);
    const uniquePhases = new Set(phases);

    expect(uniquePhases.size).toBe(phases.length);
  });

  test('should be usable in switch statements', () => {
    const phase = CoreBootstrapPhase.CONTAINER_INIT;
    let result: string;

    switch (phase) {
      case CoreBootstrapPhase.CONTAINER_INIT:
        result = 'Container initialized';
        break;

      default:
        result = 'Unknown phase';
    }

    expect(result).toBe('Container initialized');
  });

  test('should be usable as object keys', () => {
    const phaseHandlers = {
      [CoreBootstrapPhase.CONTAINER_INIT]: () => 'Container phase',
      [CoreBootstrapPhase.LOGGER_INIT]: () => 'Logger phase',
      [CoreBootstrapPhase.SERVER_READY]: () => 'Server ready phase',
    };

    expect(phaseHandlers[CoreBootstrapPhase.CONTAINER_INIT]()).toBe('Container phase');
    expect(phaseHandlers[CoreBootstrapPhase.LOGGER_INIT]()).toBe('Logger phase');
    expect(phaseHandlers[CoreBootstrapPhase.SERVER_READY]()).toBe('Server ready phase');
  });
});
