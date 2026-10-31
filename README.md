<p width="%100" align="center">
  <img src="https://avatars.githubusercontent.com/u/179836938?s=200&v=4" width="150" align="center"/>
</p>

# Asena

[![Version](https://img.shields.io/npm/v/@asenajs/asena.svg)](https://asena.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-1.4%2B-blueviolet)](https://bun.sh)

A high-performance IoC web framework for Bun runtime, bringing Spring Boot's automatic component discovery and field-based dependency injection to TypeScript.

**Requirements:** Bun 1.4+, and `experimentalDecorators` + `emitDecoratorMetadata` enabled in `tsconfig.json`.

## Quick Start

```bash
bun add -g @asenajs/asena-cli
asena create my-app --adapter=ergenecore
cd my-app
asena dev start
```

Or add it to an existing project:

```bash
bun add @asenajs/asena @asenajs/ergenecore @asenajs/asena-logger zod
```

```typescript
// src/index.ts
import { AsenaServerFactory } from '@asenajs/asena';
import { Controller, Service } from '@asenajs/asena/decorators';
import { Get } from '@asenajs/asena/decorators/http';
import { Inject } from '@asenajs/asena/decorators/ioc';
import { createErgenecoreAdapter, type Context } from '@asenajs/ergenecore';
import { AsenaLogger } from '@asenajs/asena-logger';

@Service()
class GreetingService {
  greet(name: string) {
    return `Hello ${name}`;
  }
}

@Controller('/')
class HelloController {
  @Inject(GreetingService)
  private greetingService: GreetingService;

  @Get('/')
  async hello(context: Context) {
    return context.send(this.greetingService.greet('asena'));
  }
}

const server = await AsenaServerFactory.create({
  adapter: createErgenecoreAdapter(),
  logger: new AsenaLogger(),
  port: 3000,
  components: [GreetingService, HelloController],
});

await server.start();
```

## Documentation

Full documentation: [asena.sh/docs/get-started](https://asena.sh/docs/get-started) · Philosophy: [asena.sh/docs/philosophy](https://asena.sh/docs/philosophy) · Benchmarks: [asena.sh/docs/benchmarks](https://asena.sh/docs/benchmarks)

## Contributing

Contributions are welcome! Submit a Pull Request on [GitHub](https://github.com/AsenaJs/Asena).

## License

MIT License - see [LICENSE](LICENSE) file.

## Support

Issues or questions? Open an issue on [GitHub](https://github.com/AsenaJs/Asena/issues).
