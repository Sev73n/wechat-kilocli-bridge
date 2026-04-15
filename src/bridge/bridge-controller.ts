import { clearLocalCompanionEndpoint, writeLocalCompanionEndpoint } from "../companion/local-companion-link.ts";
import type { BridgeAdapter } from "./bridge-types.ts";
import { hasLocalClientEndpointProvider } from "../runtime/runtime-types.ts";

export class BridgeController {
  private endpointInstanceId: string | null = null;
  private readonly adapter: BridgeAdapter;
  private readonly cwd: string;

  constructor(adapter: BridgeAdapter, cwd: string) {
    this.adapter = adapter;
    this.cwd = cwd;
  }

  syncLocalClientEndpoint(): void {
    if (!hasLocalClientEndpointProvider(this.adapter)) {
      this.clearLocalClientEndpoint();
      return;
    }

    const endpoint = this.adapter.getLocalClientEndpoint();
    if (!endpoint) {
      this.clearLocalClientEndpoint();
      return;
    }

    this.endpointInstanceId = endpoint.instanceId;
    writeLocalCompanionEndpoint(endpoint);
  }

  clearLocalClientEndpoint(): void {
    clearLocalCompanionEndpoint(this.cwd, this.endpointInstanceId ?? undefined);
    this.endpointInstanceId = null;
  }
}
