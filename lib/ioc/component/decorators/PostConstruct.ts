import { OnStart } from './OnStart';

/**
 * A decorator that marks a method to be called after the component's construction.
 *
 * @deprecated Renamed to {@link OnStart}. Same metadata key, same behaviour - only the name
 * changed, so no migration is needed beyond the import.
 *
 * The rename came with a timing change worth knowing about: the hook used to run inside
 * `Container.register()`, i.e. mid-scan, while other components were still being constructed.
 * It now runs from `server.start()` once the whole graph exists. A component resolved from a
 * server that was created but never started is therefore no longer initialised.
 *
 * @returns {PropertyDecorator} The property decorator function.
 */
export const PostConstruct = OnStart;
