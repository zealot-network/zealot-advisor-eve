import type { AuthFn } from "eve/channels/auth";
import type { EveAuthFn } from "eve/channels/eve";

/**
 * Grants eval tool stubs to the callers one authenticator admits, and only
 * those. agent/channels/eve.ts wraps localDev() with it, which admits only
 * local development (eve dev), so stubbed eval sessions such as the prompt
 * injection evals work locally and never on preview or production. eve strips
 * the grant before it saves or forwards the caller identity.
 *
 * Never expose eve dev or vercel dev through a tunnel or reverse proxy:
 * callers through it count as local development and would get tool stubs.
 */
export function withLocalToolStubs(authenticate: AuthFn<Request>): EveAuthFn {
  return async (request) => {
    const caller = await authenticate(request);
    return caller ? { ...caller, allowToolStubs: true } : null;
  };
}
