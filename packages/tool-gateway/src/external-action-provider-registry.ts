import type { ExternalMarketingProviderGateway } from '@platform/marketing-os-core';

/**
 * Composition-only registry for the provider-neutral governed action port.
 * It deliberately exposes gateways, never raw provider clients or secrets.
 */
export class ExternalActionProviderRegistry {
  private readonly gateways: ReadonlyMap<string, ExternalMarketingProviderGateway>;

  constructor(entries: Readonly<Record<string, ExternalMarketingProviderGateway>>) {
    this.gateways = new Map(
      Object.entries(entries).map(([provider, gateway]) => [provider.toUpperCase(), gateway]),
    );
  }

  get(provider: string): ExternalMarketingProviderGateway {
    const gateway = this.gateways.get(provider.toUpperCase());
    if (!gateway) throw new Error('EXTERNAL_ACTION_PROVIDER_UNSUPPORTED');
    return gateway;
  }
}
