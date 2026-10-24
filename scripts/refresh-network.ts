// npm run network: fetch the MBTA subway route patterns (geometry + stop order) and write the committed copy.
// This is schedule reference data. It changes rarely (service changes), not minute to minute.
import { fetchLiveNetwork, NETWORK_FILE, writeNetworkFile } from "../lib/data/network";

async function main(): Promise<void> {
  const network = await fetchLiveNetwork();
  if (!(await writeNetworkFile(network))) throw new Error(`Could not write ${NETWORK_FILE}`);
  const points = network.patterns.reduce((n, p) => n + p.coordinates.length, 0);
  console.log(`Wrote ${NETWORK_FILE}: patterns=${network.patterns.length} points=${points} fetchedAt=${network.fetchedAt}`);
}

main().catch((err: unknown) => {
  console.error("Network refresh failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
