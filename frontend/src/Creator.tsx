import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Offer } from "./api";
import OfferPicker from "./OfferPicker";

export default function Creator({ onOpen }: { onOpen: (id: number) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [geo, setGeo] = useState("");
  const [offer, setOffer] = useState<Offer | null>(null);

  const create = useMutation({
    mutationFn: () => api.createCampaign({ name, geo, offer_id: offer!.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
  const valid = name.trim() && /^[A-Za-z]{2}$/.test(geo.trim()) && offer;

  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-lg font-semibold">New campaign</h2>
      <label className="block">
        <span className="text-sm text-slate-500">Name (prefix test_verkhoturov_ is added automatically)</span>
        <input
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="campaign name"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-500">Geo (country code, e.g. AU)</span>
        <input
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 uppercase"
          value={geo}
          maxLength={2}
          onChange={(e) => setGeo(e.target.value)}
          placeholder="MX"
        />
      </label>
      <div>
        <span className="text-sm text-slate-500">Offer</span>
        <OfferPicker value={offer} onChange={setOffer} />
      </div>
      <button
        disabled={!valid || create.isPending}
        onClick={() => create.mutate()}
        className="w-full rounded bg-sky-600 py-2 font-medium text-white disabled:opacity-40"
      >
        {create.isPending ? "Creating…" : "Create"}
      </button>
      {create.error && <p className="text-red-600">{(create.error as Error).message}</p>}
      {create.data && (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-sm">
          Campaign created: <b>{create.data.name}</b> (id {create.data.id}, alias {create.data.alias})
          <br />
          domain: {create.data.domain.name} · group: {create.data.group.name} · source: {create.data.source.name}
          <br />
          <button className="mt-1 text-sky-700 underline" onClick={() => onOpen(create.data!.id)}>
            Open in editor
          </button>
        </div>
      )}
    </div>
  );
}
