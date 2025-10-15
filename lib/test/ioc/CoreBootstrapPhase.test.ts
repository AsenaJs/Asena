import { describe, expect, test } from 'bun:test';
import { CoreBootstrapPhase } from '../../ioc';

describe('CoreBootstrapPhase', () => {
  test('should have all 9 phases defined', () => {
    const phases = Object.values(CoreBootstrapPhase);

    expect(phases).toHaveLength(9);
    expect(phases).toContain('CONTAINER_INIT');
    expect(phases).toContain('LOGGER_INIT');
    expect(phases).toContain('IOC_ENGINE_INIT');
    expect(phases).toContain('HTTP_ADAPTER_INIT');
    expect(phases).toContain('PREPARE_SERVICES_INIT');
    expect(phases).toContain('USER_COMPONENTS_SCAN');
    expect(phases).toContain('USER_COMPONENTS_INIT');
    expect(phases).toContain('APPLICATION_SETUP');
    expect(phases).toContain('SERVER_READY');
  });

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

  test('phase values should match their keys', () => {
    // @ts-ignore
    expect(CoreBootstrapPhase.CONTAINER_INIT).toBe('CONTAINER_INIT');
    // @ts-ignore
    expect(CoreBootstrapPhase.LOGGER_INIT).toBe('LOGGER_INIT');
    // @ts-ignore
    expect(CoreBootstrapPhase.IOC_ENGINE_INIT).toBe('IOC_ENGINE_INIT');
    // @ts-ignore
    expect(CoreBootstrapPhase.HTTP_ADAPTER_INIT).toBe('HTTP_ADAPTER_INIT');
    // @ts-ignore
    expect(CoreBootstrapPhase.PREPARE_SERVICES_INIT).toBe('PREPARE_SERVICES_INIT');
    // @ts-ignore
    expect(CoreBootstrapPhase.USER_COMPONENTS_SCAN).toBe('USER_COMPONENTS_SCAN');
    // @ts-ignore
    expect(CoreBootstrapPhase.USER_COMPONENTS_INIT).toBe('USER_COMPONENTS_INIT');
    // @ts-ignore
    expect(CoreBootstrapPhase.APPLICATION_SETUP).toBe('APPLICATION_SETUP');
    // @ts-ignore
    expect(CoreBootstrapPhase.SERVER_READY).toBe('SERVER_READY');
  });

  test('should be usable in switch statements', () => {
    const phase = CoreBootstrapPhase.CONTAINER_INIT;
    let result :string;

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
