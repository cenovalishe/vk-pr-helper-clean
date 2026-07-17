// FILE: yc/index.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Cloud Function handler adapter using serverless-http to wrap the Express app.
//   SCOPE: exports.handler Yandex Cloud Function entry point.
//   DEPENDS: M-YC-EXPRESS, undici
//   LINKS: M-YC-EXPRESS
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   handler - Cloud Function entry point handler adapting event/context to Express
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.0 - Add global ProxyAgent configuration via undici for optional outbound proxying]
//   PREVIOUS_CHANGES:
//     - [v1.0.0 - Initial implementation of Cloud Function handler adapter]
// END_CHANGE_SUMMARY

import { ProxyAgent, Agent, Dispatcher, setGlobalDispatcher } from 'undici';

class CustomProxyDispatcher extends Dispatcher {
  private proxyAgent: ProxyAgent;
  private defaultAgent: Agent;

  constructor(proxyUri: string) {
    super();
    this.proxyAgent = new ProxyAgent(proxyUri);
    this.defaultAgent = new Agent();
  }

  dispatch(opts: any, handler: any) {
    const originStr = opts.origin ? String(opts.origin) : '';
    if (
      originStr.includes('169.254.169.254') ||
      originStr.includes('localhost') ||
      originStr.includes('127.0.0.1')
    ) {
      return this.defaultAgent.dispatch(opts, handler);
    }
    return this.proxyAgent.dispatch(opts, handler);
  }
}

if (process.env.HTTPS_PROXY) {
  // START_BLOCK_PROXY_SETUP
  try {
    const customDispatcher = new CustomProxyDispatcher(process.env.HTTPS_PROXY);
    setGlobalDispatcher(customDispatcher);
    console.log('[Entry] Global CustomProxyDispatcher configured successfully:', process.env.HTTPS_PROXY);
  } catch (err: any) {
    console.error('[Entry] Failed to configure CustomProxyDispatcher:', err.message || err);
  }
  // END_BLOCK_PROXY_SETUP
}

import serverless from 'serverless-http';
import { app } from './http';
import { log } from './logger';

const serverlessHandler = serverless(app);

// START_CONTRACT: handler
//   PURPOSE: Cloud Function entry point handler adapting event/context to Express
//   INPUTS: { event: any, context: any }
//   OUTPUTS: Promise<any>
//   SIDE_EFFECTS: Processes request via Express app
//   LINKS: M-YC-EXPRESS
// END_CONTRACT: handler
export async function handler(event: any, context: any) {
  // START_BLOCK_HANDLER_ADAPTER
  if (!event.httpMethod) {
    log('YcExpress', 'handler', 'BLOCK_HANDLER_ADAPTER', 'Timer keepalive trigger received');
    try {
      const { query } = await import('./db/index');
      await query('SELECT 1');
      log('YcExpress', 'handler', 'BLOCK_HANDLER_ADAPTER', 'Database ping successful');
    } catch (dbErr: any) {
      log('YcExpress', 'handler', 'BLOCK_HANDLER_ADAPTER', 'Database ping failed', { error: dbErr.message });
    }
    return { statusCode: 200, body: 'warmed' };
  }

  // Resolve true path for wildcard API Gateway integration
  if (event.requestContext && event.requestContext.path) {
    event.path = event.requestContext.path;
  } else if (event.url) {
    event.path = event.url.split('?')[0];
  } else if (event.params && event.params.path) {
    event.path = '/' + event.params.path;
  }

  log('YcExpress', 'handler', 'BLOCK_HANDLER_ADAPTER', 'Invoking YC handler', {
    httpMethod: event.httpMethod,
    path: event.path
  });
  return serverlessHandler(event, context);
  // END_BLOCK_HANDLER_ADAPTER
}

// GRACE_MARKER: [YcExpress][handler][BLOCK_HANDLER_ADAPTER]

const _graceLogMarkers = [
  "[YcExpress][handler][BLOCK_HANDLER_ADAPTER]"
];
