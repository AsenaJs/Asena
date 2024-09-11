import type { HttpMethod } from '../../server/web/http/HttpMethod.ts';
import type {ValidationService} from "../../server/validation/ValidationService";

export interface RouteParams<M, H> {
  method: HttpMethod;
  path: string;
  middleware: M[];
  handler: H;
  staticServe: boolean;
  validator:ValidationService<M>
}
