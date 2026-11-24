import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type Offer, type Stats, type Stream } from "./api";
import OfferPicker from "./OfferPicker";

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

function StreamCard({ stream, statsOn, campaignId }: { stream: Stream; statsOn: boolean; campaignId: number }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
  const [picked, setPicked] = useState<Offer | null>(null);
  const [shares, setShares] = useState<Record<number, number>>({});

  useEffect(() => {
    setShares(Object.fromEntries(stream.offers.map((o) => [o.offer_id, o.share])));
  }, [stream]);

  const add = useMutation({
    mutationFn: (id: number) => api.addOffer(stream.id, id),
    onSuccess: () => {
      setPicked(null);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: number) => api.removeOffer(stream.id, id), onSuccess: refresh });
  const save = useMutation({ mutationFn: () => api.setShares(stream.id, shares), onSuccess: refresh });

  const total = Object.values(shares).reduce((a, b) => a + (Number(b) || 0), 0);
  const dirty = stream.offers.some((o) => shares[o.offer_id] !== o.share);
  const editable = stream.schema === "landings";
  const err = (add.error || remove.error || save.error) as Error | null;

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">
          {stream.name} <span className="text-xs font-normal text-slate-400">{stream.type}</span>
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
          {stream.action_payload && <>Редирект на {stream.action_payload}. </>}
          {stream.filters.map((f) => (
            <span key={f.name} className="mr-2 rounded bg-slate-100 px-1.5 py-0.5">
              {f.name} {f.mode === "accept" ? "принимать" : "отклонять"} {f.payload?.join(", ")}
            </span>
          ))}
        </p>
      )}

      {editable && (
        <>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="font-normal">Оффер</th>
                <th className="w-24 font-normal">Доля, %</th>
                <th className="px-2 text-right font-normal">Клики</th>
                <th className="px-2 text-right font-normal">Уник.</th>
                <th className="px-2 text-right font-normal">Боты</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {stream.offers.map((o) => (
                <tr key={o.offer_id} className="border-t border-slate-100">
                  <td className="py-1.5">
                    <span className="text-slate-400">[{o.offer_id}]</span> {o.name}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-16 rounded border border-slate-300 px-1 py-0.5"
                      value={shares[o.offer_id] ?? 0}
                      onChange={(e) => setShares({ ...shares, [o.offer_id]: Number(e.target.value) })}
                    />
                  </td>
                  <StatCells s={o.stats} on={statsOn} />
                  <td>
                    <button
                      title="Удалить оффер"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(o.offer_id)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {stream.offers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-2 text-slate-400">
                    Офферов нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {stream.offers.length > 0 && (
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className={total === 100 ? "text-green-700" : "text-red-600"}>Сумма: {total}%</span>
              <button
                disabled={!dirty || total !== 100 || save.isPending}
                onClick={() => save.mutate()}
                className="rounded border border-sky-600 px-2 py-0.5 text-sky-700 disabled:opacity-40"
              >
                Сохранить доли
              </button>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <div className="flex-1">
              <OfferPicker value={picked} onChange={setPicked} exclude={stream.offers.map((o) => o.offer_id)} />
            </div>
            <button
              disabled={!picked || add.isPending}
              onClick={() => add.mutate(picked!.id)}
              className="rounded bg-sky-600 px-3 text-white disabled:opacity-40"
            >
              Добавить
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">При добавлении/удалении доли выравниваются поровну (в сумме 100%).</p>
        </>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err.message}</p>}
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
            Выберите кампанию…
          </option>
          {list.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (#{c.id})
            </option>
          ))}
        </select>
        {list.error && <span className="text-red-600">{(list.error as Error).message}</span>}
      </div>

      {camp.isLoading && <p className="text-slate-400">Загрузка…</p>}
      {camp.error && <p className="text-red-600">{(camp.error as Error).message}</p>}
      {camp.data && (
        <>
          {!camp.data.stats_available && (
            <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
              Статистика недоступна: стенд не отдаёт /report/build. Показаны прочерки.
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
