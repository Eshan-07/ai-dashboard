import { useRef } from "react";
import ChartRenderer from "./ChartRenderer";
import ExportMenu from "./ExportMenu";

export default function ChartContainer({ spec }) {
  const nodeRef = useRef(null);

  return (
    <div ref={nodeRef} className="rounded-xl border bg-white p-4 shadow">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">{spec.title || "Chart"}</h3>
        <ExportMenu nodeRef={nodeRef} data={spec.data} title={spec.title || spec.id} />
      </div>
      <ChartRenderer spec={spec} />
      {spec.drilldownKey && (
        <p className="text-xs text-gray-500 mt-2">
          💡 Click a {spec.drilldownKey} to drill down.
        </p>
      )}
    </div>
  );
}
