import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type Offer, type Stats, type Stream } from "./api";
import OfferPicker from "./OfferPicker";

type Row = { offer_id: number; name: string; share: number; status: "synced" | "new" | "removed"; stats: Stats };

function StatCells({ s, on }: { s: Stats; on: boolean }) {
  const v = (n: number) => (on ? n : "—");
  return (
    <>
      <td className="w-20 px-2 text-right tabular-nums">{v(s.clicks)}</td>
      <td className="w-20 px-2 text-right tabular-nums">{v(s.unique)}</td>
      <td className="w-20 px-2 text-right tabular-nums">{v(s.bots)}</td>
    </>
  );
}

const fromServer = (s: Stream): Row[] =>
  s.offers.map((o) => ({ offer_id: o.offer_id, name: o.name, share: o.share, status: "synced", stats: o.stats }));

/** Even split of 100% over the rows that will remain; remainder goes 1 point each to the first rows. */
function rebalance(rows: Row[]): Row[] {
  const alive = rows.filter((r) => r.status !== "removed");
  const n = alive.length;
  let i = 0;
  return rows.map((r) => (r.status === "removed" ? r : { ...r, share: Math.floor(100 / n) + (i++ < 100 % n ? 1 : 0) }));
}

const NO_STATS: Stats = { clicks: 0, unique: 0, bots: 0 };

function StreamCard({ stream, statsOn, campaignId }: { stream: Stream; statsOn: boolean; campaignId: number }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => fromServer(stream));
  const [picked, setPicked] = useState<Offer | null>(null);

  // reset the draft whenever fresh server data arrives (after push)
  useEffect(() => setRows(fromServer(stream)), [stream]);

  const push = useMutation({
    mutationFn: () =>
      api.pushOffers(
        stream.id,
        rows.filter((r) => r.status !== "removed").map((r) => ({ offer_id: r.offer_id, share: r.share })),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign", campaignId] }),
  });

  const server = fromServer(stream);
  const alive = rows.filter((r) => r.status !== "removed");
  const total = alive.reduce((a, r) => a + (Number(r.share) || 0), 0);
  const pending =
    rows.some((r) => r.status !== "synced") || server.some((o) => rows.find((r) => r.offer_id === o.offer_id)?.share !== o.share);
  const valid = alive.length === 0 || total === 100;
  const editable = stream.schema === "landings";

  const add = () => {
    if (!picked) return;
    setRows(rebalance([...rows, { offer_id: picked.id, name: picked.name, share: 0, status: "new", stats: NO_STATS }]));
    setPicked(null);
  };
  const remove = (id: number) =>
    setRows(
      rebalance(
        rows.flatMap((r) => (r.offer_id !== id ? [r] : r.status === "new" ? [] : [{ ...r, status: "removed" as const }])),
      ),
    );

  return (
    <section
      className={`rounded border p-4 transition-colors ${pending ? "border-yellow-400 bg-yellow-100" : "border-slate-200 bg-white"}`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">
          {stream.name} <span className="text-xs font-normal text-slate-400">{stream.type}</span>
          {pending && <span className="ml-2 rounded bg-yellow-300 px-1.5 py-0.5 text-xs font-medium">Pending approval</span>}
        </h3>
        <table className="text-sm text-slate-500">
          <tbody>
            <tr>
              <StatCells s={stream.stats} on={statsOn} />
            </tr>
          </tbody>
        </table>
      </div>

      {!editable && (
        <p className="mt-2 text-sm text-slate-600">
          {stream.action_payload && <>Redirect to {stream.action_payload}. </>}
          {stream.filters.map((f) => (
            <span key={f.name} className="mr-2 rounded bg-slate-100 px-1.5 py-0.5">
              {f.name} {f.mode === "accept" ? "accept" : "reject"} {f.payload?.join(", ")}
            </span>
          ))}
        </p>
      )}

      {editable && (
        <>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="font-normal">Offer</th>
                <th className="w-24 font-normal">Share, %</th>
                <th className="px-2 text-right font-normal">Clicks</th>
                <th className="px-2 text-right font-normal">Unique</th>
                <th className="px-2 text-right font-normal">Bots</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.offer_id}
                  className={`border-t border-slate-100 ${r.status === "new" ? "bg-yellow-200" : ""} ${r.status === "removed" ? "text-slate-400 line-through" : ""}`}
                >
                  <td className="py-1.5">
                    <span className="text-slate-400">[{r.offer_id}]</span> {r.name}
                    {r.status === "new" && <span className="ml-2 text-xs no-underline">new</span>}
                    {r.status === "removed" && <span className="ml-2 text-xs">to be removed</span>}
                  </td>
                  <td>
                    {r.status !== "removed" && (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-16 rounded border border-slate-300 bg-white px-1 py-0.5"
                        value={r.share}
                        onChange={(e) =>
                          setRows(rows.map((x) => (x.offer_id === r.offer_id ? { ...x, share: Number(e.target.value) } : x)))
                        }
                      />
                    )}
                  </td>
                  <StatCells s={r.stats} on={statsOn && r.status !== "new"} />
                  <td>
                    {r.status !== "removed" && (
                      <button title="Remove offer" onClick={() => remove(r.offer_id)} className="text-slate-400 hover:text-red-600">
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-2 text-slate-400">
                    No offers
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-3 flex gap-2">
            <div className="flex-1">
              <OfferPicker value={picked} onChange={setPicked} exclude={alive.map((r) => r.offer_id)} />
            </div>
            <button
              disabled={!picked}
              onClick={add}
              className="rounded bg-sky-600 px-3 text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Changes stay local until pushed. Adding/removing re-splits shares evenly; you can edit them by hand.
          </p>

          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className={valid ? "text-green-700" : "text-red-600"}>Total: {total}%</span>
            <button
              disabled={!pending || !valid || push.isPending}
              onClick={() => push.mutate()}
              className="rounded bg-green-600 px-3 py-1 font-medium text-white disabled:opacity-40"
            >
              {push.isPending ? "Pushing…" : "Push to KT"}
            </button>
            <button
              disabled={!pending || push.isPending}
              onClick={() => {
                setRows(fromServer(stream));
                setPicked(null);
                push.reset();
              }}
              className="rounded border border-slate-400 bg-white px-3 py-1 disabled:opacity-40"
            >
              Cancel
            </button>
            {!valid && <span className="text-red-600">Shares must sum to 100%</span>}
          </div>
        </>
      )}
      {push.error && <p className="mt-2 text-sm text-red-600">{(push.error as Error).message}</p>}
    </section>
  );
}

export default function Editor({ campaignId, onSelect }: { campaignId: number | null; onSelect: (id: number) => void }) {
  const list = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns });
  const camp = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => api.campaign(campaignId!),
    enabled: campaignId != null,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          className="rounded border border-slate-300 bg-white px-2 py-1.5"
          value={campaignId ?? ""}
          onChange={(e) => onSelect(Number(e.target.value))}
        >
          <option value="" disabled>
            Select a campaign…
          </option>
          {list.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (#{c.id})
            </option>
          ))}
        </select>
        {list.error && <span className="text-red-600">{(list.error as Error).message}</span>}
      </div>

      {camp.isLoading && <p className="text-slate-400">Loading…</p>}
      {camp.error && <p className="text-red-600">{(camp.error as Error).message}</p>}
      {camp.data && (
        <>
          {!camp.data.stats_available && (
            <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
              Stats unavailable: the server does not expose /report/build. Dashes are shown instead.
            </p>
          )}
          {camp.data.streams.map((s) => (
            <StreamCard key={s.id} stream={s} statsOn={camp.data.stats_available} campaignId={camp.data.id} />
          ))}
        </>
      )}
    </div>
  );
}
