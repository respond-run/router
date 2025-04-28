export type Handler<TEnv = unknown, TCtx = DefaultExecutionContext> = (
  request: Request,
  env: TEnv,
  ctx: TCtx,
  params: Record<string, string>
) => Promise<Response>;

export type RouteModule<TEnv = unknown, TCtx = DefaultExecutionContext> = {
  [method: string]: Handler<TEnv, TCtx> | undefined;
};

interface Route<TEnv, TCtx> {
  filePath: string;
  loader: () => Promise<RouteModule<TEnv, TCtx>>;
  regex: RegExp;
  paramNames: string[];
}

export interface DefaultExecutionContext {
  waitUntil(promise: Promise<any>): void;
}

/**
 * Creates a route handler from a Vite import.meta.glob() result
 */
export function createRouter<TEnv = unknown, TCtx = DefaultExecutionContext>(
  globs: Record<string, () => Promise<unknown>>
) {
  const routeMap: Route<TEnv, TCtx>[] = Object.entries(globs).map(([filePath, loader]) => {
    let routePath = filePath.replace(/^.*\/routes/, '').replace(/\.ts$/, '');

    if (routePath.endsWith('/index')) {
      routePath = routePath.replace(/\/index$/, '') || '/';
    }

    const paramNames: string[] = [];
    const regex = new RegExp('^' + routePath.replace(/\[(\w+)\]/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    }) + '$');

    return {
      filePath,
      loader: loader as () => Promise<RouteModule<TEnv, TCtx>>,
      regex,
      paramNames
    };
  });

  return async function handleRoutes(
    request: Request,
    env: TEnv,
    ctx: TCtx
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    for (const { regex, paramNames, loader } of routeMap) {
      const match = pathname.match(regex);
      if (!match) continue;

      const params = Object.fromEntries(
        paramNames.map((key, i) => [key, match[i + 1]])
      );

      const mod = await loader();
      const handler = mod[method];
      if (!handler) {
        return new Response('Method Not Allowed', { status: 405 });
      }

      return handler(request, env, ctx, params);
    }

    return new Response('Not Found', { status: 404 });
  };
}

/**
 * Optional helper for defining routes with strong type hints.
 */
export function defineRoute<TEnv = unknown, TCtx = DefaultExecutionContext>(
  fn: Handler<TEnv, TCtx>
): typeof fn {
  return fn;
}
