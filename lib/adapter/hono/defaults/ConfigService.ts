import type { AsenaConfig } from '../../../server/config/AsenaConfig';
import type { Context } from './Context';

export abstract class ConfigService implements AsenaConfig<Context> {}
