# Asena

A high-performance, NestJS-like IoC web framework built on Bun runtime with full dependency injection support.

## Documentation

For detailed documentation, visit [asena.sh](https://asena.sh) (in progress). Check out [AsenaExample](https://github.com/LibirSoft/AsenaExample) for latest usage patterns.

## Key Features

- **Full IoC Container**: Field-based dependency injection for all components
- **Decorator-based**: TypeScript decorators for routing and DI (similar to NestJS)
- **High Performance**: Built on Bun runtime for optimal speed
- **WebSocket Support**: Native WebSocket handling
- **Flexible Middleware**: Multi-level middleware system (global, controller, route)
- **Adapter System**: Pluggable HTTP adapters (Hono default)
- **Type-Safe**: Full TypeScript support with strict mode
- **Zero Config**: Minimal setup required

## Quick Start

### Using CLI (Recommended)

```bash
bun add -D @asenajs/asena-cli
asena create my-project
cd my-project
asena dev start
```

### Manual Setup

Install dependencies:

```bash
bun add @asenajs/asena @asenajs/hono-adapter @asenajs/asena-logger
bun add -D @asenajs/asena-cli
```

Configure TypeScript (`tsconfig.json`):

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true,
    "skipLibCheck": true
  }
}
```

Initialize config:

```bash
asena init
```

Create your server (`src/index.ts`):

```typescript
import { AsenaServerFactory } from '@asenajs/asena';
import { createHonoAdapter } from '@asenajs/hono-adapter';
import { logger } from './logger';

const [adapter, asenaLogger] = createHonoAdapter(logger);

const server = await AsenaServerFactory.create({
  adapter,
  logger: asenaLogger,
  port: 3000
});

await server.start();
```

Create a controller (`src/controllers/HelloController.ts`):

```typescript
import { Controller } from '@asenajs/asena/server';
import { Get } from '@asenajs/asena/web';
import type { Context } from '@asenajs/hono-adapter';

@Controller('/hello')
export class HelloController {
  @Get('/world')
  async getHello(context: Context) {
    return context.send('Hello World');
  }
}
```

## Core Concepts

### Controllers

Handle HTTP requests with decorators:

```typescript
@Controller('/users')
export class UserController {
  @Get('/:id')
  async getUser(context: Context) {
    const id = context.req.param('id');
    return context.json({ id, name: 'John' });
  }

  @Post('/')
  async createUser(context: Context) {
    const body = await context.req.json();
    return context.json({ success: true });
  }
}
```

### Services

Business logic with dependency injection:

```typescript
@Service()
export class UserService {
  async findUser(id: string) {
    // Your business logic
    return { id, name: 'John' };
  }
}

@Controller('/users')
export class UserController {
  @Inject(UserService)
  private userService: UserService;

  @Get('/:id')
  async getUser(context: Context) {
    const user = await this.userService.findUser(context.req.param('id'));
    return context.json(user);
  }
}
```

### Middleware

Multi-level middleware support:

```typescript
@Middleware()
export class AuthMiddleware extends MiddlewareService {
  async handle(context: Context, next: Function) {
    // Check authentication
    await next();
  }
}

// Global middleware via Config
@Config()
export class AppConfig {
  globalMiddlewares() {
    return [AuthMiddleware];
  }
}

// Controller-level
@Controller({ path: '/admin', middlewares: [AuthMiddleware] })
export class AdminController { }

// Route-level
@Get({ path: '/users', middlewares: [AuthMiddleware] })
async getUsers(context: Context) { }
```

### WebSocket

Built-in WebSocket support:

```typescript
@WebSocket('/chat')
export class ChatSocket extends AsenaWebSocketService {
  onOpen(ws: Socket) {
    ws.send('Welcome!');
  }

  onMessage(ws: Socket, message: string) {
    ws.send(`Echo: ${message}`);
  }
}
```

## CLI Commands

```bash
asena create          # Create new project
asena init            # Initialize config
asena dev start       # Development mode
asena build           # Production build
```

Full CLI documentation: [asena.sh/docs/cli](https://asena.sh/docs/cli/overview.html)

## Performance

Built on Bun runtime for exceptional performance:

| Framework      | Requests/sec  | Latency (avg) |
|----------------|---------------| ------------- |
| Hono           | 266476.83     | 1.49ms       |
| **Asena + Ergenecore** | **259593.28** | 1.53ms       |
| **Asena + Hono-adapter** | **233182.35** | **1.70ms**    |
| NestJS (Bun)   | 100975.20        | 3.92ms       |
| NestJS (Node)  | 88083.22        | 5.33ms       |

> Benchmark: 12 threads, 400 connections, 120s duration, Hello World endpoint

## Architecture

```
lib/
├── ioc/           # IoC container & dependency injection
├── server/        # Core server & routing
├── adapter/       # HTTP adapter abstraction
└── utils/         # Utilities & helpers
```

## Contributing

Contributions welcome! Submit a Pull Request on [GitHub](https://github.com/AsenaJs/Asena).

## License

MIT License - see [LICENSE](LICENSE) file.

## Support

Issues or questions? Open an issue on [GitHub](https://github.com/AsenaJs/Asena/issues).
