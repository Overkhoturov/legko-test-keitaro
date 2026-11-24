export type Stats = { clicks: number; unique: number; bots: number };
export type Offer = { id: number; name: string; country: string[] };
export type StreamOffer = { offer_id: number; name: string; share: number; state: string; stats: Stats };
export type Stream = {
  id: number;
  name: string;
  type: string;
  schema: string;
  state: string;
  action_payload: string | null;
  filters: { name: string; mode: string; payload: string[] | null }[];
  stats: Stats;
  offers: StreamOffer[];
};
export type Campaign = { id: number; name: string; stats_available: boolean; streams: Stream[] };
export type CampaignListItem = { id: number; name: string; state: string };
export type Created = {
  id: number;
  name: string;
  alias: string;
  domain: { name: string };
  group: { name: string };
  source: { name: string };
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => null);
    const d = e?.detail;
    throw new Error(typeof d === "string" ? d : d ? JSON.stringify(d) : r.statusText);
  }
  return r.json();
}

export const api = {
  offers: (q: string) => call<Offer[]>("GET", `/offers?q=${encodeURIComponent(q)}`),
  campaigns: () => call<CampaignListItem[]>("GET", "/campaigns"),
  campaign: (id: number) => call<Campaign>("GET", `/campaigns/${id}`),
  createCampaign: (b: { name: string; geo: string; offer_id: number }) => call<Created>("POST", "/campaigns", b),
  pushOffers: (streamId: number, offers: { offer_id: number; share: number }[]) =>
    call("PUT", `/streams/${streamId}/offers`, { offers }),
};
