import { useState } from "react";
import Creator from "./Creator";
import Editor from "./Editor";

export default function App() {
  const [tab, setTab] = useState<"create" | "edit">("create");
  const [campaignId, setCampaignId] = useState<number | null>(null);

  const open = (id: number) => {
    setCampaignId(id);
    setTab("edit");
  };
  const tabCls = (t: string) =>
    `px-4 py-2 border-b-2 ${tab === t ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500"}`;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <nav className="mb-6 flex border-b border-slate-200">
        <button className={tabCls("create")} onClick={() => setTab("create")}>
          Create campaign
        </button>
        <button className={tabCls("edit")} onClick={() => setTab("edit")}>
          Editor
        </button>
      </nav>
      {tab === "create" ? <Creator onOpen={open} /> : <Editor campaignId={campaignId} onSelect={setCampaignId} />}
    </div>
  );
}
