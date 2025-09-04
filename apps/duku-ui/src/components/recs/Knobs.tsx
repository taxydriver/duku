"use client";
import { Slider } from "@/components/ui/slider";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export function KnobsPanel(props: any) {
  const { algo, setAlgo, ser, setSer, explore, setExplore, novel, setNovel } = props;
  return (
    <div className="bg-card p-4 rounded-xl shadow-sm grid gap-4 md:grid-cols-4">
      <div>
        <label className="text-sm">Algorithm</label>
        <Select value={algo} onValueChange={setAlgo}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CF">CF</SelectItem>
            <SelectItem value="DeepFM">DeepFM</SelectItem>
            <SelectItem value="MMoE">MMoE</SelectItem>
            <SelectItem value="DCNv2">DCNv2</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Knob label="Serendipity" value={ser} onChange={setSer} />
      <Knob label="Exploration" value={explore} onChange={setExplore} />
      <Knob label="Novelty" value={novel} onChange={setNovel} />
    </div>
  );
}

function Knob({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span>{value.toFixed(2)}</span></div>
      <Slider className="mt-2" value={[value]} max={1} step={0.01} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}
