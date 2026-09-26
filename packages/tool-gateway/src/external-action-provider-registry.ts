import type {
  ExternalMarketingProviderGateway,
  ProviderCampaignCapabilities,
} from '@platform/marketing-os-core';

export interface ExternalActionProviderRegistration {
  gateway: ExternalMarketingProviderGateway;
  capabilities: ProviderCampaignCapabilities;
}

type RegistryEntry = ExternalMarketingProviderGateway | ExternalActionProviderRegistration;

/**
 * Composition-only registry for the provider-neutral governed action port.
 * It deliberately exposes gateways, never raw provider clients or secrets.
 */
export class ExternalActionProviderRegistry {
  private readonly gateways: ReadonlyMap<string, ExternalMarketingProviderGateway>;
  private readonly capabilityDeclarations: ReadonlyMap<string, ProviderCampaignCapabilities>;

  constructor(entries: Readonly<Record<string, RegistryEntry>>) {
    this.gateways = new Map(
      Object.entries(entries).map(([provider, entry]) => [provider.toUpperCase(), isRegistration(entry) ? entry.gateway : entry]),
    );
    this.capabilityDeclarations = new Map(
      Object.entries(entries).map(([provider, entry]) => {
        if (!isRegistration(entry)) {
          return [provider.toUpperCase(), { actionTypes: [], budgetUnit: 'MAJOR' } satisfies ProviderCampaignCapabilities];
        }
        if (!entry.capabilities.actionTypes.length) throw new Error('EXTERNAL_ACTION_PROVIDER_CAPABILITIES_REQUIRED');
        return [provider.toUpperCase(), {
          actionTypes: [...new Set(entry.capabilities.actionTypes)],
          budgetUnit: entry.capabilities.budgetUnit,
        } satisfies ProviderCampaignCapabilities];
      }),
    );
  }

  get(provider: string): ExternalMarketingProviderGateway {
    const gateway = this.gateways.get(provider.toUpperCase());
    if (!gateway) throw new Error('EXTERNAL_ACTION_PROVIDER_UNSUPPORTED');
    return gateway;
  }

  capabilities(provider: string): ProviderCampaignCapabilities {
    const capabilities = this.capabilityDeclarations.get(provider.toUpperCase());
    if (!capabilities || capabilities.actionTypes.length === 0) {
      throw new Error('EXTERNAL_ACTION_PROVIDER_CAPABILITY_UNSUPPORTED');
    }
    return { actionTypes: [...capabilities.actionTypes], budgetUnit: capabilities.budgetUnit };
  }
}

function isRegistration(entry: RegistryEntry): entry is ExternalActionProviderRegistration {
  return 'gateway' in entry && 'capabilities' in entry;
}
