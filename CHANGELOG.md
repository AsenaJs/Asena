# @asenajs/asena

## 0.3.3

### Patch Changes
- 
- 647b8d5: Fix WebSocket cleanup and unsubscribe mechanism

  - Fixed topic format inconsistency in subscribe/unsubscribe calls
  - Improved AsenaSocket cleanup to avoid modification during iteration
  - Enhanced unsubscribe method with safer filtering approach
  - Added comprehensive test coverage for memory leak prevention and topic format consistency

## 0.3.2

### Patch Changes

- d488206: Fix critical PostConstruct issues in IoC Container

  - Fixed PostConstruct methods being executed multiple times in inheritance chains
  - Fixed async PostConstruct not being awaited during singleton registration
  - Added comprehensive test coverage for PostConstruct behavior
  - Code cleanup: Removed debug console.log statements

  **Breaking Change:** Container.register() is now async - all register calls must be awaited

## 0.3.1

### Patch Changes

- fc9e310: Config service name undefined bug fixed

## 0.3.0

### Minor Changes

- b7aae6c: - Removed Winston dependency to reduce external dependencies. -
  - Implemented a new WebSocket adapter system for enhanced real-time communication capabilities.
  - Introduced a static serve API and configuration for serving static files.
  - Addressed various minor bugs. - Improved and fixed existing tests.
  - Added new tests to increase code coverage and ensure stability.
  - Performed general code cleanup and refactoring.

## 0.2.1

### Patch Changes

- da1d732: minor bugs on inheritance system fixed

## 0.2.0

### Minor Changes

- 2924af1: Inheritance bugs fixed. Hono adapter removed from asenajs.
