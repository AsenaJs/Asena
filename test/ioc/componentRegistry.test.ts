import { describe, expect, test } from 'bun:test';
import { getComponentsDeclaredIn, resetComponentRegistry } from '../../lib/ioc/component/componentRegistry';
import { Service } from '../../lib/server/decorators';
import { Controller } from '../../lib/server/decorators';

const THIS_FILE = import.meta.path;

@Service()
class RegisteredService {}

@Controller('/registered')
class RegisteredController {}

describe('componentRegistry', () => {
  test('attributes decorated classes to the file they were declared in', () => {
    const names = getComponentsDeclaredIn(new Set([THIS_FILE])).map((cls) => cls.name);

    expect(names).toContain('RegisteredService');
    expect(names).toContain('RegisteredController');
  });

  test('returns nothing for a file that declared no components', () => {
    expect(getComponentsDeclaredIn(new Set(['/somewhere/else.ts']))).toEqual([]);
  });

  test('returns nothing when asked for no files', () => {
    expect(getComponentsDeclaredIn(new Set())).toEqual([]);
  });

  test('does not attribute framework-internal classes to user files', () => {
    // Core services are decorated with @CoreService, which never marks an IoC
    // component - and every component decorator runs inside lib/, which is skipped
    const declared = getComponentsDeclaredIn(new Set([THIS_FILE]));

    expect(declared.every((cls) => cls.name !== 'IocEngine')).toBe(true);
  });

  test('clears on reset so a second boot in the same process starts clean', () => {
    expect(getComponentsDeclaredIn(new Set([THIS_FILE])).length).toBeGreaterThan(0);

    resetComponentRegistry();

    expect(getComponentsDeclaredIn(new Set([THIS_FILE]))).toEqual([]);
  });
});

// Keep the classes referenced so they are not treated as unused
void RegisteredService;
void RegisteredController;
