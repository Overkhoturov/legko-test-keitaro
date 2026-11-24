import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type Offer } from "./api";

/** Offer search with autocomplete (debounced), by name or id. */
export default function OfferPicker({
  value,
  onChange,
  exclude = [],
}: {
  value: Offer | null;
  onChange: (o: Offer | null) => void;
  exclude?: number[];
}) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 250);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["offers", debounced],
    queryFn: () => api.offers(debounced),
    enabled: open,
  });
  const items = (data ?? []).filter((o) => !exclude.includes(o.id));

  return (
    <div className="relative">
      <input
        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
        placeholder="Search offer by name or ID"
        value={value ? `[${value.id}] ${value.name}` : text}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onChange(null);
          setText(e.target.value);
          setOpen(true);
        }}
      />
      {open && !value && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded border border-slate-300 bg-white shadow">
          {isFetching && <li className="px-2 py-1 text-slate-400">Searching…</li>}
          {error && <li className="px-2 py-1 text-red-600">{(error as Error).message}</li>}
          {!isFetching && !error && items.length === 0 && <li className="px-2 py-1 text-slate-400">Nothing found</li>}
          {items.map((o) => (
            <li
              key={o.id}
              className="cursor-pointer px-2 py-1 hover:bg-sky-50"
              onMouseDown={() => {
                onChange(o);
                setText("");
                setOpen(false);
              }}
            >
              <span className="text-slate-400">[{o.id}]</span> {o.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
