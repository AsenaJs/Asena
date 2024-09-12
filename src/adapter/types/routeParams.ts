import type { HttpMethod } from '../../server/web/http';
import type {ValidationService} from "../../server/web/middleware";

export interface RouteParams<M, H> {
  method: HttpMethod;
  path: string;
  middleware: M[];
  handler: H;
  staticServe: boolean;
  validator:ValidationService<M>
}
