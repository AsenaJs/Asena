<p width="%100" align="center">
  <img src="https://avatars.githubusercontent.com/u/179836938?s=200&v=4" width="150" align="center"/>
</p>

# Asena

[![Version](https://img.shields.io/badge/version-0.9.1-blue.svg)](https://asena.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-1.3.12%2B-blueviolet)](https://bun.sh)

A high-performance IoC web framework for Bun runtime, bringing Spring Boot's automatic component discovery and field-based dependency injection to TypeScript.

## Philosophy

`Spring Boot` and `Quarkus` have established proven patterns for enterprise application development, but developers transitioning to TypeScript often find themselves reimplementing familiar concepts or adapting to unfamiliar architectures. `AsenaJS` addresses this gap by bringing automatic component discovery, field-based dependency injection to the `Bun` ecosystem.

The framework eliminates boilerplate through automatic scanning of decorator-annotated classes, removing the need for explicit module declarations or manual wiring. Components marked with `@Controller`, `@Service`, or `@Repository` (via asena-drizzle package) are discovered and registered automatically, allowing developers to focus on business logic rather than configuration. This approach, combined with Bun's native performance characteristics, delivers both the familiar developer experience of Spring Boot and the speed expected from modern JavaScript runtimes.

`AsenaJS` is designed to make developers familiar with `Spring Boot` and `Quarkus` feel at home in the TypeScript ecosystem. As the framework evolves, we remain committed to this philosophy—bringing more proven patterns from the Java world while maintaining the performance advantages that `Bun` provides and flexiblity of Typescript.

## Documentation

📚 **Full documentation:** [asena.sh](https://asena.sh)

For complete guides, API reference, and advanced topics, visit our documentation site.

**Example Project:** [AsenaExample](https://github.com/LibirSoft/AsenaExample) - See latest usage patterns and best practices.

## Quick Start

```bash
# Create new project
bun add -g @asenajs/asena-cli
asena create my-project --adapter=hono --logger --eslint --prettier
cd my-project

# Start development
asena dev start
```

Visit [asena.sh/docs/get-started](https://asena.sh/docs/get-started) for detailed setup instructions.

## Component Lifecycle

A component can take part in the server's start and stop:

```typescript
@Service()
export class OutboxWorker {
  @OnStart()
  public start(): void {
    // Runs during server.start(), once every component is constructed and before the
    // application is wired up - so a @Config finds its dependencies started - and long
    // before the HTTP socket binds, so no request can reach a component that has not run.
    this.running = true;
    this.loop = this.run(); // start it and return; do not block here
  }

  @OnStop()
  public async stop(): Promise<void> {
    // Runs during server.stop(), in the reverse order, so this component still has its
    // dependencies while it lets go of its own.
    this.running = false;
    await this.loop;
  }
}
```

`@OnStart` is the new name for `@PostConstruct`, which remains as a deprecated alias writing the
same metadata — existing code keeps working. Hooks run in registration order, which is the
topological order the container computed, so dependencies start first and stop last. A failing
`@OnStart` aborts the boot and rolls back what had already started; a failing or hanging `@OnStop`
is logged and skipped so the rest of the shutdown still runs.

`SIGTERM`, `SIGINT` and `SIGHUP` are handled by default and translated into `server.stop()`, so a
rolling deploy drains rather than kills. See
[asena.sh/docs/concepts/lifecycle](https://asena.sh/docs/concepts/lifecycle).

## Performance

Built on Bun runtime for exceptional performance:

| Framework                | Requests/sec          | Latency (avg) |
|--------------------------|-----------------------|---------------|
| **Asena + Ergenecore**   | **294,962.61**        | **1.34ms**    |
| Hono                     | 266,476.83            | 1.49ms        |
| **Asena + Hono-adapter** | **233,182.35**        | **1.70ms**    |
| NestJS (Bun)             | 100,975.20            | 3.92ms        |
| NestJS (Node)            | 88,083.22             | 5.33ms        |

> Benchmark: 12 threads, 400 connections, 120s duration, Hello World endpoint

## Contributing

Contributions are welcome! Submit a Pull Request on [GitHub](https://github.com/AsenaJs/Asena).

## License

MIT License - see [LICENSE](LICENSE) file.

## Support

Issues or questions? Open an issue on [GitHub](https://github.com/AsenaJs/Asena/issues).
