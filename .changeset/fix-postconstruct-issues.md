---
"@asenajs/asena": patch
---

Fix critical PostConstruct issues in IoC Container

- Fixed PostConstruct methods being executed multiple times in inheritance chains
- Fixed async PostConstruct not being awaited during singleton registration
- Added comprehensive test coverage for PostConstruct behavior
- Code cleanup: Removed debug console.log statements

**Breaking Change:** Container.register() is now async - all register calls must be awaited
