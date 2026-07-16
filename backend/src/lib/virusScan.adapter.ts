export type ScanResult = "clean" | "infected";

export interface VirusScanAdapter {
  scan(buffer: Buffer, fileName: string): Promise<ScanResult>;
}

/**
 * FR-33/WF30 requires every upload to be virus-scanned before it is made
 * available for preview/download. A real scanner (ClamAV as a sidecar
 * container or Lambda, or a managed API) is an infrastructure decision
 * deferred to deployment - see deployment/06-Deployment-AWS.md and
 * deployment/07-Deployment-Azure.md, "Attachments & Virus Scanning".
 *
 * This stub adapter marks every file "clean" immediately so the feature is
 * usable end-to-end in dev/test without that infrastructure. It MUST be
 * swapped for a real scanner (implement `VirusScanAdapter` and change
 * `buildVirusScanAdapter` below) before this endpoint is exposed to
 * untrusted uploads in production. `attachment.service.ts` still enforces a
 * size cap and a MIME-type allowlist regardless of scan results - those are
 * real controls, not stubs.
 */
class NoopVirusScanAdapter implements VirusScanAdapter {
  async scan(_buffer: Buffer, _fileName: string): Promise<ScanResult> {
    return "clean";
  }
}

function buildVirusScanAdapter(): VirusScanAdapter {
  return new NoopVirusScanAdapter();
}

export const virusScanner: VirusScanAdapter = buildVirusScanAdapter();
